// AI service: provider selection, caching, structured-output validation, error handling
// and fallback to clearly-labelled DEMO output. Deterministic validation never depends on it.
import { createHash } from "node:crypto";
import { and, desc, eq, gte, inArray } from "drizzle-orm";
import { ZodError, type ZodType } from "zod";
import { getDb, schema } from "../db";
import { resolveAiConfig, type AiConfig } from "./config";
import { AI_ERROR_MESSAGES, AiProviderError, classifyError, completeJson, type AiErrorCode } from "./client";
import {
  DocumentAnalysisJsonSchema,
  DocumentAnalysisSchema,
  FindingsSummaryJsonSchema,
  FindingsSummarySchema,
  strictify,
  type DocumentAnalysis,
  type FindingsSummary,
} from "./schemas";
import { PROMPT_VERSION, SYSTEM_PROMPT, documentAnalysisPrompt, findingsSummaryPrompt } from "./prompts";
import { mockDocumentAnalysis, mockFindingsSummary, type MockFinding } from "./mock";
import type { ParsedField } from "../extraction/fields";

export type AiSource = "ai_live" | "ai_mock";

export interface AiOutcome<T> {
  output: T;
  source: AiSource;
  provider: string;
  model: string;
  /** set when a configured live provider failed and we fell back to demo output */
  errorCode: AiErrorCode | "failed_validation" | null;
  cached: boolean;
}

export interface AiCallContext {
  applicationId: string;
  runId: string | null;
  documentId?: string | null;
  correlationId: string;
  /** dependency injection for tests */
  complete?: typeof completeJson;
  config?: AiConfig;
}

function sha(s: string) {
  return createHash("sha256").update(s).digest("hex");
}

async function record(
  ctx: AiCallContext,
  cfg: AiConfig,
  task: string,
  cacheKey: string,
  status: string,
  output: unknown,
  extra: { errorCode?: string; latencyMs?: number; inputTokens?: number | null; outputTokens?: number | null } = {},
) {
  await getDb()
    .insert(schema.aiRecords)
    .values({
      applicationId: ctx.applicationId,
      runId: ctx.runId,
      documentId: ctx.documentId ?? null,
      task,
      provider: cfg.provider,
      model: cfg.model,
      promptVersion: PROMPT_VERSION,
      cacheKey,
      status,
      output: output ? JSON.stringify(output) : "",
      errorCode: extra.errorCode ?? "",
      latencyMs: extra.latencyMs ?? 0,
      inputTokens: extra.inputTokens ?? null,
      outputTokens: extra.outputTokens ?? null,
      correlationId: ctx.correlationId,
    });
}

/** Call the live provider, validate with Zod, retry once with a repair instruction. */
async function callLive<T>(
  cfg: AiConfig,
  ctx: AiCallContext,
  task: string,
  cacheKey: string,
  userPrompt: string,
  jsonSchema: Record<string, unknown>,
  zod: ZodType<T, never, unknown>,
): Promise<{ ok: true; value: T; cached: boolean } | { ok: false; code: AiErrorCode | "failed_validation" }> {
  const db = getDb();
  // Cache: identical inputs + prompt version + model → reuse validated output, no API call.
  const [hit] = await db
    .select()
    .from(schema.aiRecords)
    .where(and(eq(schema.aiRecords.cacheKey, cacheKey), eq(schema.aiRecords.status, "success")))
    .orderBy(desc(schema.aiRecords.createdAt))
    .limit(1);
  if (hit) {
    const parsed = zod.safeParse(JSON.parse(hit.output));
    if (parsed.success) {
      await record(ctx, cfg, task, cacheKey, "cache_hit", null);
      return { ok: true, value: parsed.data, cached: true };
    }
  }

  const complete = ctx.complete ?? completeJson;
  const schemaForProvider = (cfg.provider === "anthropic" ? strictify(jsonSchema) : jsonSchema) as Record<string, unknown>;
  let prompt = userPrompt;
  for (let attempt = 0; attempt < 2; attempt++) {
    const t0 = Date.now();
    let raw;
    try {
      raw = await complete(cfg, SYSTEM_PROMPT, prompt, schemaForProvider);
    } catch (err) {
      const code = classifyError(err);
      await record(ctx, cfg, task, cacheKey, "error", null, { errorCode: code, latencyMs: Date.now() - t0 });
      return { ok: false, code };
    }
    try {
      const value = zod.parse(JSON.parse(raw.text));
      await record(ctx, cfg, task, cacheKey, "success", value, {
        latencyMs: Date.now() - t0,
        inputTokens: raw.inputTokens,
        outputTokens: raw.outputTokens,
      });
      return { ok: true, value, cached: false };
    } catch (err) {
      const detail = err instanceof ZodError ? "schema validation failed" : "response was not valid JSON";
      if (attempt === 0) {
        prompt = `${userPrompt}\n\nYour previous reply was rejected (${detail}). Reply again with ONLY valid JSON that matches the schema exactly.`;
        continue;
      }
      await record(ctx, cfg, task, cacheKey, "failed_validation", null, { errorCode: "failed_validation", latencyMs: Date.now() - t0 });
      return { ok: false, code: "failed_validation" };
    }
  }
  return { ok: false, code: "failed_validation" };
}

export async function analyzeDocument(
  input: {
    documentSha256: string;
    rulesetVersion: string;
    declaredDocType: string;
    declaredDocLabel: string;
    application: Record<string, string>;
    pages: { pageNumber: number; text: string }[];
    parsed: ParsedField[];
  },
  ctx: AiCallContext,
): Promise<AiOutcome<DocumentAnalysis>> {
  const cfg = ctx.config ?? resolveAiConfig();
  const fullText = input.pages.map((p) => p.text).join("\n");
  const mock = async (errorCode: AiOutcome<unknown>["errorCode"]): Promise<AiOutcome<DocumentAnalysis>> => {
    const output = mockDocumentAnalysis({ declaredDocType: input.declaredDocType, text: fullText, parsed: input.parsed });
    await record(ctx, { ...cfg, provider: "mock", model: "deterministic-demo" }, "document_analysis", "", "mock", output, {
      errorCode: errorCode ?? "",
    });
    return { output, source: "ai_mock", provider: "mock", model: "deterministic-demo", errorCode, cached: false };
  };
  if (!cfg.configured) return mock(null);
  if (fullText.trim().length === 0) return mock(null); // nothing to send — don't spend a request

  const cacheKey = sha(
    JSON.stringify(["document_analysis", PROMPT_VERSION, cfg.provider, cfg.model, input.rulesetVersion, input.documentSha256, input.declaredDocType, input.application]),
  );
  const prompt = documentAnalysisPrompt({ ...input, maxChars: cfg.maxDocChars });
  const r = await callLive(cfg, ctx, "document_analysis", cacheKey, prompt, DocumentAnalysisJsonSchema as never, DocumentAnalysisSchema as never);
  if (r.ok) return { output: r.value as DocumentAnalysis, source: "ai_live", provider: cfg.provider, model: cfg.model, errorCode: null, cached: r.cached };
  return mock(r.code);
}

export async function summarizeFindings(
  input: { applicationRef: string; category: string; findings: MockFinding[] },
  ctx: AiCallContext,
): Promise<AiOutcome<FindingsSummary>> {
  const cfg = ctx.config ?? resolveAiConfig();
  const mock = async (errorCode: AiOutcome<unknown>["errorCode"]): Promise<AiOutcome<FindingsSummary>> => {
    const output = mockFindingsSummary(input);
    await record(ctx, { ...cfg, provider: "mock", model: "deterministic-demo" }, "findings_summary", "", "mock", output, {
      errorCode: errorCode ?? "",
    });
    return { output, source: "ai_mock", provider: "mock", model: "deterministic-demo", errorCode, cached: false };
  };
  if (!cfg.configured) return mock(null);
  const compact = input.findings.map((f) => ({
    ref: f.ref,
    rule: f.type,
    severity: f.severity,
    explanation: f.explanation,
    expected: f.expected,
    actual: f.actual,
  }));
  const cacheKey = sha(JSON.stringify(["findings_summary", PROMPT_VERSION, cfg.provider, cfg.model, input.category, compact.map(({ ref: _r, ...rest }) => rest)]));
  const prompt = findingsSummaryPrompt({ applicationRef: input.applicationRef, category: input.category, findings: compact });
  const r = await callLive(cfg, ctx, "findings_summary", cacheKey, prompt, FindingsSummaryJsonSchema as never, FindingsSummarySchema as never);
  if (r.ok) {
    const value = r.value as FindingsSummary;
    // Cached summaries may carry finding refs from an earlier run: re-key by position.
    if (r.cached) {
      value.finding_explanations = value.finding_explanations.map((e, i) => ({ ...e, finding_ref: compact[i]?.ref ?? e.finding_ref }));
    }
    return { output: value, source: "ai_live", provider: cfg.provider, model: cfg.model, errorCode: null, cached: r.cached };
  }
  return mock(r.code);
}

// ── Status for banner + System Health page ──

export type AiMode = "LIVE" | "DEMO" | "DEGRADED";

export interface AiStatus {
  mode: AiMode;
  provider: string;
  model: string;
  reason: string;
  lastError: { code: string; message: string; at: Date } | null;
  lastSuccessAt: Date | null;
}

/** LIVE = configured and the most recent live call (if any in the last 15 min) succeeded. */
export async function getAiStatus(): Promise<AiStatus> {
  const cfg = resolveAiConfig();
  if (!cfg.configured) {
    return { mode: "DEMO", provider: "mock", model: "deterministic-demo", reason: cfg.reason, lastError: null, lastSuccessAt: null };
  }
  const since = new Date(Date.now() - 15 * 60_000);
  const recent = await getDb()
    .select()
    .from(schema.aiRecords)
    .where(
      and(
        eq(schema.aiRecords.provider, cfg.provider),
        inArray(schema.aiRecords.status, ["success", "error", "failed_validation"]),
        gte(schema.aiRecords.createdAt, since),
      ),
    )
    .orderBy(desc(schema.aiRecords.createdAt))
    .limit(1);
  const [lastOk] = await getDb()
    .select({ createdAt: schema.aiRecords.createdAt })
    .from(schema.aiRecords)
    .where(and(eq(schema.aiRecords.provider, cfg.provider), eq(schema.aiRecords.status, "success")))
    .orderBy(desc(schema.aiRecords.createdAt))
    .limit(1);
  const last = recent[0];
  const failing = last && last.status !== "success";
  return {
    mode: failing ? "DEGRADED" : "LIVE",
    provider: cfg.provider,
    model: cfg.model,
    reason: failing ? AI_ERROR_MESSAGES[(last.errorCode as AiErrorCode) || "unknown"] ?? "AI calls are failing." : cfg.reason,
    lastError: failing ? { code: last.errorCode, message: AI_ERROR_MESSAGES[last.errorCode as AiErrorCode] ?? "AI output failed validation.", at: last.createdAt } : null,
    lastSuccessAt: lastOk?.createdAt ?? null,
  };
}

/** Minimal live call used by the System Health "Test connection" button. */
export async function testAiConnection(correlationId: string, complete = completeJson): Promise<{ ok: boolean; message: string }> {
  const cfg = resolveAiConfig();
  if (!cfg.configured) return { ok: false, message: cfg.reason };
  const t0 = Date.now();
  try {
    const raw = await complete(cfg, "Reply with JSON only.", 'Return {"status":"ok"}.', {
      type: "object",
      properties: { status: { type: "string" } },
      required: ["status"],
      ...(cfg.provider === "anthropic" ? { additionalProperties: false } : {}),
    });
    JSON.parse(raw.text);
    await getDb().insert(schema.aiRecords).values({
      task: "health_check",
      provider: cfg.provider,
      model: cfg.model,
      promptVersion: PROMPT_VERSION,
      cacheKey: "",
      status: "success",
      latencyMs: Date.now() - t0,
      correlationId,
    });
    return { ok: true, message: `Connected to ${cfg.provider} (${cfg.model}) in ${Date.now() - t0} ms.` };
  } catch (err) {
    const code = err instanceof AiProviderError ? err.code : classifyError(err);
    await getDb().insert(schema.aiRecords).values({
      task: "health_check",
      provider: cfg.provider,
      model: cfg.model,
      promptVersion: PROMPT_VERSION,
      cacheKey: "",
      status: "error",
      errorCode: code,
      latencyMs: Date.now() - t0,
      correlationId,
    });
    return { ok: false, message: AI_ERROR_MESSAGES[code] };
  }
}

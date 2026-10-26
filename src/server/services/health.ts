// System health. Never claims "operational" for something that failed or wasn't checked,
// and never exposes keys, connection strings or stack traces.
import { and, desc, eq, gte, inArray, sql } from "drizzle-orm";
import { getDb, schema } from "../db";
import { assertCan, type Actor } from "../authz";
import { getAiStatus } from "../ai/service";
import { resolveAiConfig } from "../ai/config";
import { ocrAvailable } from "../extraction";
import { storageDriver } from "../storage";
import { ALL_ADAPTERS } from "../verification";

export type HealthState = "Operational" | "Degraded" | "Not configured" | "Unavailable" | "Unknown";
export const APP_VERSION = "0.1.0-prototype";

export async function getHealth(actor: Actor) {
  assertCan(actor, "health.view");
  const db = getDb();
  const checks: { name: string; state: HealthState; detail: string }[] = [];

  let dbOk = false;
  try {
    await db.run(sql`select 1`);
    dbOk = true;
    const url = process.env.DATABASE_URL || "file:./dev.db";
    checks.push({ name: "Database", state: "Operational", detail: url.startsWith("file:") ? "Local SQLite file" : "Hosted libSQL database" });
  } catch {
    checks.push({ name: "Database", state: "Unavailable", detail: "Database query failed. Check DATABASE_URL / DATABASE_AUTH_TOKEN." });
  }

  const ocr = ocrAvailable();
  checks.push({ name: "OCR engine", state: ocr.ok ? "Operational" : "Unavailable", detail: ocr.detail });
  checks.push({ name: "PDF text extraction", state: "Operational", detail: "unpdf (pdf.js) — runs in-process" });
  checks.push({ name: "Document storage", state: "Operational", detail: storageDriver() === "local" ? "Private local folder (outside public web root)" : "Database blob storage" });

  const ai = dbOk ? await getAiStatus() : null;
  const cfg = resolveAiConfig();
  checks.push({
    name: "AI provider",
    state: !cfg.configured ? "Not configured" : !ai ? "Unknown" : ai.mode === "DEGRADED" ? "Degraded" : ai.lastSuccessAt ? "Operational" : "Unknown",
    detail: !cfg.configured
      ? `${cfg.reason} Deterministic validation and labelled demo explanations are used.`
      : ai?.mode === "DEGRADED"
        ? ai.reason
        : ai?.lastSuccessAt
          ? `${cfg.provider} · ${cfg.model} — last successful call ${ai.lastSuccessAt.toISOString()}`
          : `${cfg.provider} · ${cfg.model} configured but not yet tested — use "Test AI connection".`,
  });
  for (const a of ALL_ADAPTERS) {
    checks.push({
      name: `Verification: ${a.code}`,
      state: a.sourceType === "NOT_CONFIGURED" ? "Not configured" : "Operational",
      detail: a.name,
    });
  }

  let recentFailures: { at: Date; action: string; ref: string; reason: string }[] = [];
  let recentRuns: { at: Date; ref: string; mode: string; findings: number; ms: number; status: string }[] = [];
  let avgMs = 0;
  let aiErrors: { at: Date; provider: string; code: string }[] = [];
  if (dbOk) {
    const since = new Date(Date.now() - 7 * 86_400_000);
    recentFailures = (
      await db
        .select()
        .from(schema.auditLogs)
        .where(and(inArray(schema.auditLogs.action, ["document.extraction_failed", "validation.failed", "ai.degraded"]), gte(schema.auditLogs.createdAt, since)))
        .orderBy(desc(schema.auditLogs.createdAt))
        .limit(10)
    ).map((r) => ({ at: r.createdAt, action: r.action, ref: r.entityRef, reason: r.reason }));
    const runs = await db
      .select({ r: schema.validationRuns, ref: schema.applications.refNo })
      .from(schema.validationRuns)
      .innerJoin(schema.applications, eq(schema.applications.id, schema.validationRuns.applicationId))
      .orderBy(desc(schema.validationRuns.startedAt))
      .limit(10);
    recentRuns = runs.map(({ r, ref }) => ({ at: r.startedAt, ref, mode: r.aiMode, findings: r.findingCount, ms: r.durationMs, status: r.status }));
    const done = runs.filter((x) => x.r.status === "COMPLETED");
    avgMs = done.length ? Math.round(done.reduce((s, x) => s + x.r.durationMs, 0) / done.length) : 0;
    aiErrors = (
      await db
        .select()
        .from(schema.aiRecords)
        .where(inArray(schema.aiRecords.status, ["error", "failed_validation"]))
        .orderBy(desc(schema.aiRecords.createdAt))
        .limit(5)
    ).map((r) => ({ at: r.createdAt, provider: r.provider, code: r.errorCode }));
  }
  const worst = checks.some((c) => c.state === "Unavailable") ? "Unavailable" : checks.some((c) => c.state === "Degraded") ? "Degraded" : "Operational";
  return {
    overall: worst as HealthState,
    checks,
    aiMode: ai?.mode ?? "DEMO",
    recentFailures,
    recentRuns,
    avgMs,
    aiErrors,
    version: APP_VERSION,
    backgroundJobs: "None — extraction and validation run synchronously in the request.",
  };
}

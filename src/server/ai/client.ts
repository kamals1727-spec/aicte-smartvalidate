import "server-only";
// The ONLY place where AI SDK clients are constructed and API keys are read.
// Nothing in here is ever returned to the browser; errors are classified into safe codes.
import { GoogleGenAI, ApiError as GeminiApiError } from "@google/genai";
import Anthropic from "@anthropic-ai/sdk";
import { DEFAULT_OPENAI_COMPAT_BASE_URL, type AiConfig } from "./config";

export interface RawCompletion {
  text: string;
  inputTokens: number | null;
  outputTokens: number | null;
}

export type AiErrorCode =
  | "missing_credentials"
  | "invalid_credentials"
  | "rate_limited"
  | "provider_unavailable"
  | "timeout"
  | "network"
  | "bad_request"
  | "unknown";

export class AiProviderError extends Error {
  constructor(
    public readonly code: AiErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "AiProviderError";
  }
}

export const AI_ERROR_MESSAGES: Record<AiErrorCode, string> = {
  missing_credentials: "AI provider is not configured (missing key or model).",
  invalid_credentials: "The AI provider rejected the API key (401/403). Check the key in your server environment.",
  rate_limited: "The AI provider rate limit was reached (429). Free tiers allow only a few requests per minute — wait and retry.",
  provider_unavailable: "The AI provider is temporarily unavailable (5xx / overloaded).",
  timeout: "The AI request timed out.",
  network: "The AI provider could not be reached (network error).",
  bad_request: "The AI provider rejected the request (400) — often an invalid model name.",
  unknown: "Unexpected AI provider error.",
};

function classifyStatus(status: number | undefined): AiErrorCode {
  if (status === 401 || status === 403) return "invalid_credentials";
  if (status === 429) return "rate_limited";
  if (status === 400 || status === 404) return "bad_request";
  if (status && status >= 500) return "provider_unavailable";
  return "unknown";
}

export function classifyError(err: unknown): AiErrorCode {
  if (err instanceof AiProviderError) return err.code;
  if (err instanceof GeminiApiError) return classifyStatus(err.status);
  if (err instanceof Anthropic.APIConnectionTimeoutError) return "timeout";
  if (err instanceof Anthropic.APIConnectionError) return "network";
  if (err instanceof Anthropic.APIError) return classifyStatus(err.status);
  const name = err && typeof err === "object" && "name" in err ? String((err as { name: unknown }).name) : "";
  if (name === "AbortError" || name === "TimeoutError") return "timeout";
  const msg = err instanceof Error ? err.message : "";
  if (/fetch failed|ENOTFOUND|ECONNREFUSED|ECONNRESET|network/i.test(msg)) return "network";
  const status = err && typeof err === "object" && "status" in err ? Number((err as { status: unknown }).status) : undefined;
  return classifyStatus(Number.isFinite(status) ? status : undefined);
}

export async function completeJson(
  cfg: AiConfig,
  system: string,
  user: string,
  jsonSchema: Record<string, unknown>,
): Promise<RawCompletion> {
  if (cfg.provider === "gemini") {
    const key = process.env.GEMINI_API_KEY;
    if (!key) throw new AiProviderError("missing_credentials", "missing key");
    const ai = new GoogleGenAI({ apiKey: key, httpOptions: { timeout: cfg.timeoutMs } });
    let lastErr: unknown;
    for (let attempt = 0; attempt <= cfg.maxRetries; attempt++) {
      try {
        const res = await ai.models.generateContent({
          model: cfg.model,
          contents: [{ role: "user", parts: [{ text: user }] }],
          config: {
            systemInstruction: system,
            responseMimeType: "application/json",
            responseJsonSchema: jsonSchema,
            temperature: 0,
            maxOutputTokens: cfg.maxOutputTokens,
          },
        });
        return {
          text: res.text ?? "",
          inputTokens: res.usageMetadata?.promptTokenCount ?? null,
          outputTokens: res.usageMetadata?.candidatesTokenCount ?? null,
        };
      } catch (err) {
        lastErr = err;
        const code = classifyError(err);
        if (!["rate_limited", "provider_unavailable", "network"].includes(code) || attempt === cfg.maxRetries) break;
        await new Promise((r) => setTimeout(r, 1000 * 2 ** attempt));
      }
    }
    throw new AiProviderError(classifyError(lastErr), "gemini request failed");
  }

  if (cfg.provider === "anthropic") {
    const key = process.env.ANTHROPIC_API_KEY;
    if (!key) throw new AiProviderError("missing_credentials", "missing key");
    const client = new Anthropic({ apiKey: key, timeout: cfg.timeoutMs, maxRetries: cfg.maxRetries });
    try {
      const msg = await client.messages.create({
        model: cfg.model,
        max_tokens: cfg.maxOutputTokens,
        system,
        messages: [{ role: "user", content: user }],
        output_config: { format: { type: "json_schema", schema: jsonSchema } },
      });
      const text = msg.content
        .filter((b): b is Anthropic.TextBlock => b.type === "text")
        .map((b) => b.text)
        .join("");
      return { text, inputTokens: msg.usage?.input_tokens ?? null, outputTokens: msg.usage?.output_tokens ?? null };
    } catch (err) {
      throw new AiProviderError(classifyError(err), "anthropic request failed");
    }
  }

  if (cfg.provider === "openai_compat") {
    const key = process.env.OPENAI_COMPAT_API_KEY;
    if (!key) throw new AiProviderError("missing_credentials", "missing key");
    const baseUrl = (process.env.OPENAI_COMPAT_BASE_URL || DEFAULT_OPENAI_COMPAT_BASE_URL).replace(/\/+$/, "");
    // JSON mode (not strict json_schema) is the widely supported subset across Groq / OpenRouter / Cerebras,
    // so the schema goes in the system prompt and the reply is still Zod-validated by the caller.
    const systemWithSchema = `${system}\n\nRespond with a single JSON object that conforms to this JSON Schema:\n${JSON.stringify(jsonSchema)}`;
    let lastErr: unknown;
    for (let attempt = 0; attempt <= cfg.maxRetries; attempt++) {
      try {
        const res = await fetch(`${baseUrl}/chat/completions`, {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
          body: JSON.stringify({
            model: cfg.model,
            messages: [
              { role: "system", content: systemWithSchema },
              { role: "user", content: user },
            ],
            response_format: { type: "json_object" },
            temperature: 0,
            max_tokens: cfg.maxOutputTokens,
          }),
          signal: AbortSignal.timeout(cfg.timeoutMs),
        });
        if (!res.ok) throw Object.assign(new Error(`openai-compatible request failed (${res.status})`), { status: res.status });
        const data = (await res.json()) as {
          choices?: { message?: { content?: string | null } }[];
          usage?: { prompt_tokens?: number; completion_tokens?: number };
        };
        return {
          text: data.choices?.[0]?.message?.content ?? "",
          inputTokens: data.usage?.prompt_tokens ?? null,
          outputTokens: data.usage?.completion_tokens ?? null,
        };
      } catch (err) {
        lastErr = err;
        const code = classifyError(err);
        if (!["rate_limited", "provider_unavailable", "network"].includes(code) || attempt === cfg.maxRetries) break;
        await new Promise((r) => setTimeout(r, 1000 * 2 ** attempt));
      }
    }
    throw new AiProviderError(classifyError(lastErr), "openai-compatible request failed");
  }

  throw new AiProviderError("missing_credentials", "mock provider has no remote completion");
}

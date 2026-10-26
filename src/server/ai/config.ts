// Which AI provider is active is decided ONLY from server-side environment variables.
// Keys are read here and in the provider clients — never exported to client code or logs.

export type ProviderName = "gemini" | "anthropic" | "mock";

export interface AiConfig {
  provider: ProviderName;
  model: string;
  /** true when a real provider has both a key and a model configured */
  configured: boolean;
  /** human-readable reason, safe to display (contains no secrets) */
  reason: string;
  timeoutMs: number;
  maxRetries: number;
  maxOutputTokens: number;
  maxDocChars: number;
}

function num(v: string | undefined, d: number): number {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? n : d;
}

export function resolveAiConfig(env: Record<string, string | undefined> = process.env): AiConfig {
  const base = {
    timeoutMs: num(env.AI_TIMEOUT_MS, 60_000),
    maxRetries: Math.min(num(env.AI_MAX_RETRIES, 2), 5),
    maxOutputTokens: num(env.AI_MAX_OUTPUT_TOKENS, 2048),
    maxDocChars: num(env.AI_MAX_DOC_CHARS, 6000),
  };
  const choice = (env.AI_PROVIDER || "auto").toLowerCase();
  const gemini = Boolean(env.GEMINI_API_KEY && env.GEMINI_MODEL);
  const anthropic = Boolean(env.ANTHROPIC_API_KEY && env.ANTHROPIC_MODEL);

  const mock = (reason: string): AiConfig => ({ ...base, provider: "mock", model: "deterministic-demo", configured: false, reason });

  if (choice === "mock") return mock("AI_PROVIDER=mock (forced demo mode).");
  if (choice === "gemini" || (choice === "auto" && gemini)) {
    if (!gemini) return mock("AI_PROVIDER=gemini but GEMINI_API_KEY or GEMINI_MODEL is missing.");
    return { ...base, provider: "gemini", model: env.GEMINI_MODEL!, configured: true, reason: "Google Gemini configured." };
  }
  if (choice === "anthropic" || (choice === "auto" && anthropic)) {
    if (!anthropic) return mock("AI_PROVIDER=anthropic but ANTHROPIC_API_KEY or ANTHROPIC_MODEL is missing.");
    return { ...base, provider: "anthropic", model: env.ANTHROPIC_MODEL!, configured: true, reason: "Anthropic Claude configured." };
  }
  return mock("No AI API key and model configured — running in DEMO mode.");
}

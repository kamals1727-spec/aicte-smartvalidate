// Minimal .env loader for CLI scripts (Next.js loads env files itself at runtime).
// Precedence: real environment > .env.local > .env
import { existsSync, readFileSync } from "node:fs";

for (const file of [".env.local", ".env"]) {
  if (!existsSync(file)) continue;
  for (const line of readFileSync(file, "utf8").split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (!m) continue;
    const [, key, raw] = m;
    if (process.env[key] !== undefined && process.env[key] !== "") continue;
    const value = raw.replace(/^"(.*)"$/, "$1").replace(/^'(.*)'$/, "$1");
    if (value !== "") process.env[key] = value;
  }
}

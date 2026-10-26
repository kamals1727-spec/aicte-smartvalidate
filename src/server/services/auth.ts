import bcrypt from "bcryptjs";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { getDb, schema } from "../db";
import { audit } from "../audit";
import { AppError } from "../errors";
import { signSession } from "../auth/session";
import type { Actor } from "../authz";

// Best-effort in-memory rate limit (per process). On serverless hosts each instance has
// its own memory, so production should use a shared store (e.g. Redis/Upstash) instead.
const attempts = new Map<string, { count: number; until: number }>();
const MAX_ATTEMPTS = 5;
const DUMMY_HASH = bcrypt.hashSync("timing-equaliser-not-a-password", 10);
const WINDOW_MS = 10 * 60_000;

export function checkRateLimit(key: string): void {
  const now = Date.now();
  const a = attempts.get(key);
  if (a && a.until > now && a.count >= MAX_ATTEMPTS) {
    throw new AppError("Too many failed sign-in attempts. Try again in a few minutes.", 429, "RATE_LIMITED");
  }
}
function noteFailure(key: string) {
  const now = Date.now();
  const a = attempts.get(key);
  if (!a || a.until < now) attempts.set(key, { count: 1, until: now + WINDOW_MS });
  else a.count++;
}

const LoginInput = z.object({
  email: z.string().trim().toLowerCase().email("Enter a valid email"),
  password: z.string().min(1, "Enter your password").max(200),
});

export async function login(raw: unknown, clientKey: string): Promise<{ token: string; actor: Actor }> {
  const { email, password } = LoginInput.parse(raw);
  const key = `${clientKey}|${email}`;
  checkRateLimit(key);
  const db = getDb();
  const [u] = await db.select().from(schema.users).where(eq(schema.users.email, email)).limit(1);
  // Always run bcrypt to keep timing similar whether or not the user exists.
  const ok = await bcrypt.compare(password, u?.passwordHash ?? DUMMY_HASH);
  if (!u || !ok || !u.active) {
    noteFailure(key);
    await audit(db, { actor: "system", action: "auth.login_failed", entityType: "user", entityRef: email.replace(/(.{2}).*(@.*)/, "$1***$2"), reason: !u ? "unknown user" : !u.active ? "inactive" : "bad password" });
    throw new AppError("Invalid email or password.", 401, "INVALID_CREDENTIALS");
  }
  attempts.delete(key);
  await db.update(schema.users).set({ lastLoginAt: new Date() }).where(eq(schema.users.id, u.id));
  const actor: Actor = { id: u.id, name: u.name, email: u.email, role: u.role as Actor["role"], institutionId: u.institutionId };
  await audit(db, { actor, action: "auth.login", entityType: "user", entityId: u.id, entityRef: u.email });
  return { token: await signSession({ sub: u.id, role: actor.role }), actor };
}

export async function recordLogout(actor: Actor) {
  await audit(getDb(), { actor, action: "auth.logout", entityType: "user", entityId: actor.id, entityRef: actor.email });
}

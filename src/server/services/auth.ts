import bcrypt from "bcryptjs";
import { randomBytes } from "node:crypto";
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

const RegisterInput = z
  .object({
    name: z.string().trim().min(2, "Enter your full name").max(100),
    email: z.string().trim().toLowerCase().email("Enter a valid email"),
    password: z.string().min(10, "Password must be at least 10 characters").max(200),
    confirmPassword: z.string(),
    institutionName: z.string().trim().min(3, "Enter the institution name").max(200),
    address: z.string().trim().min(5, "Enter the institution address").max(300),
    city: z.string().trim().min(2, "Enter the city").max(100),
    state: z.string().trim().min(2, "Enter the state").max(100),
    affiliatedUniversity: z.string().trim().min(2, "Enter the affiliating university / board").max(200),
    contactPhone: z.string().trim().regex(/^[+0-9 -]{8,20}$/, "Enter a valid phone number"),
  })
  .refine((v) => v.password === v.confirmPassword, { path: ["confirmPassword"], message: "Passwords do not match" });

/**
 * Self-registration for a new applicant: creates a real (non-synthetic) institution record
 * and an INSTITUTION user linked to it. Applicants can never register as officer or admin;
 * an admin can deactivate a registration from Admin → Users.
 */
export async function register(raw: unknown, clientKey: string): Promise<{ token: string; actor: Actor }> {
  const input = RegisterInput.parse(raw);
  const key = `register|${clientKey}`;
  checkRateLimit(key);
  noteFailure(key); // every attempt counts: at most MAX_ATTEMPTS registrations per client per window
  const db = getDb();
  const [exists] = await db.select({ id: schema.users.id }).from(schema.users).where(eq(schema.users.email, input.email)).limit(1);
  if (exists) throw new AppError("An account with this email already exists. Sign in instead.");

  const refId = `INST-${randomBytes(4).toString("hex").toUpperCase()}`;
  const [inst] = await db
    .insert(schema.institutions)
    .values({
      refId,
      name: input.institutionName,
      address: input.address,
      city: input.city,
      state: input.state,
      affiliatedUniversity: input.affiliatedUniversity,
      approvalStatus: "Self-registered — not yet verified",
      contactEmail: input.email,
      contactPhone: input.contactPhone,
      isSynthetic: false,
    })
    .returning();
  const [u] = await db
    .insert(schema.users)
    .values({ email: input.email, name: input.name, role: "INSTITUTION", institutionId: inst.id, passwordHash: await bcrypt.hash(input.password, 10), lastLoginAt: new Date() })
    .returning();
  const actor: Actor = { id: u.id, name: u.name, email: u.email, role: "INSTITUTION", institutionId: inst.id };
  await audit(db, { actor, action: "institution.registered", entityType: "institution", entityId: inst.id, entityRef: refId, newState: inst.name });
  await audit(db, { actor, action: "user.registered", entityType: "user", entityId: u.id, entityRef: u.email, newState: u.role });
  return { token: await signSession({ sub: u.id, role: actor.role }), actor };
}

export async function recordLogout(actor: Actor) {
  await audit(getDb(), { actor, action: "auth.logout", entityType: "user", entityId: actor.id, entityRef: actor.email });
}

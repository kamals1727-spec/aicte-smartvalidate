import { SignJWT, jwtVerify } from "jose";
import type { Role } from "@/lib/constants";

export const SESSION_COOKIE = "sv_session";
export const SESSION_TTL_SECONDS = 8 * 60 * 60;

const DEV_FALLBACK = "local-dev-only-insecure-secret-do-not-use-in-production";

function secretKey(): Uint8Array {
  const s = process.env.SESSION_SECRET;
  if (!s || s.length < 32) {
    if (process.env.NODE_ENV === "production" && !process.env.SV_ALLOW_DEV_SECRET) {
      throw new Error("SESSION_SECRET must be set (32+ characters) in production.");
    }
    return new TextEncoder().encode(DEV_FALLBACK);
  }
  return new TextEncoder().encode(s);
}

export interface SessionClaims {
  sub: string; // user id
  role: Role;
}

export async function signSession(claims: SessionClaims): Promise<string> {
  return new SignJWT({ role: claims.role })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(claims.sub)
    .setIssuedAt()
    .setExpirationTime(`${SESSION_TTL_SECONDS}s`)
    .sign(secretKey());
}

export async function verifySession(token: string | undefined): Promise<SessionClaims | null> {
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, secretKey(), { algorithms: ["HS256"] });
    if (typeof payload.sub !== "string" || typeof payload.role !== "string") return null;
    return { sub: payload.sub, role: payload.role as Role };
  } catch {
    return null;
  }
}

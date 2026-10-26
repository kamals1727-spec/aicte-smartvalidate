import "server-only";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { getDb, schema } from "../db";
import { AuthError } from "../errors";
import { SESSION_COOKIE, verifySession } from "./session";
import type { Actor } from "../authz";

/**
 * Resolve the signed-in user from the session cookie AND the database.
 * The role/institution always come from the DB row, never from anything the client sent.
 */
export async function getActor(): Promise<Actor | null> {
  const store = await cookies();
  const claims = await verifySession(store.get(SESSION_COOKIE)?.value);
  if (!claims) return null;
  const [u] = await getDb().select().from(schema.users).where(eq(schema.users.id, claims.sub)).limit(1);
  if (!u || !u.active) return null;
  return { id: u.id, name: u.name, email: u.email, role: u.role as Actor["role"], institutionId: u.institutionId };
}

/** For server components/pages: redirect to login when not signed in. */
export async function requireActorPage(): Promise<Actor> {
  const a = await getActor();
  if (!a) redirect("/login");
  return a;
}

/** For server actions / route handlers: throw a typed error when not signed in. */
export async function requireActor(): Promise<Actor> {
  const a = await getActor();
  if (!a) throw new AuthError();
  return a;
}

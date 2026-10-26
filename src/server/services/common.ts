import { randomBytes } from "node:crypto";
import { eq } from "drizzle-orm";
import { getDb, schema, type DB } from "../db";
import { audit } from "../audit";
import type { Actor } from "../authz";

const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

export function shortCode(len = 6): string {
  const bytes = randomBytes(len);
  let s = "";
  for (let i = 0; i < len; i++) s += ALPHABET[bytes[i] % ALPHABET.length];
  return s;
}

export function appRef(): string {
  return `SV-${new Date().getFullYear()}-${shortCode(6)}`;
}

type Tx = Parameters<Parameters<DB["transaction"]>[0]>[0] | DB;

export async function setStatus(
  db: Tx,
  app: { id: string; refNo: string; status: string },
  to: string,
  actor: Actor | "system",
  reason: string,
  correlationId = "",
) {
  if (app.status === to) return;
  const now = new Date();
  await db
    .update(schema.applications)
    .set({ status: to, updatedAt: now, ...(to === "SUBMITTED" ? { submittedAt: now } : {}) })
    .where(eq(schema.applications.id, app.id));
  await db.insert(schema.statusHistory).values({
    applicationId: app.id,
    fromStatus: app.status,
    toStatus: to,
    actorId: actor === "system" ? null : actor.id,
    reason,
  });
  await audit(db, {
    actor,
    action: "application.status_changed",
    entityType: "application",
    entityId: app.id,
    entityRef: app.refNo,
    previousState: app.status,
    newState: to,
    reason,
    correlationId,
  });
  app.status = to;
}

export async function loadApplication(id: string) {
  const [app] = await getDb().select().from(schema.applications).where(eq(schema.applications.id, id)).limit(1);
  return app;
}

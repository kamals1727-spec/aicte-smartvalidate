import { randomUUID } from "node:crypto";
import type { DB } from "./db";
import { schema } from "./db";
import type { Actor } from "./authz";

export interface AuditEntry {
  actor: Actor | null | "system";
  action: string;
  entityType: string;
  entityId?: string;
  entityRef?: string;
  previousState?: string;
  newState?: string;
  reason?: string;
  correlationId?: string;
  /** Small, non-sensitive metadata only — never document text, keys or personal data. */
  metadata?: Record<string, unknown>;
}

export function newCorrelationId(): string {
  return randomUUID();
}

type Tx = Pick<DB, "insert">;

/** Append-only audit write (UPDATE/DELETE are blocked by DB triggers). */
export async function audit(db: Tx, e: AuditEntry): Promise<void> {
  const actorId = e.actor && e.actor !== "system" ? e.actor.id : null;
  const actorLabel =
    e.actor === "system" || !e.actor ? "system" : `${e.actor.name} (${e.actor.role.toLowerCase()})`;
  await db.insert(schema.auditLogs).values({
    actorId,
    actorLabel,
    action: e.action,
    entityType: e.entityType,
    entityId: e.entityId ?? "",
    entityRef: e.entityRef ?? "",
    previousState: e.previousState ?? "",
    newState: e.newState ?? "",
    reason: e.reason ?? "",
    correlationId: e.correlationId ?? "",
    metadata: JSON.stringify(e.metadata ?? {}),
  });
}

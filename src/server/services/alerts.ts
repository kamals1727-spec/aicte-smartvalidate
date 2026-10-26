import { and, desc, eq, inArray, type SQL } from "drizzle-orm";
import { z } from "zod";
import { getDb, schema } from "../db";
import { audit } from "../audit";
import { assertCan, canViewApplication, type Actor } from "../authz";
import { AppError, NotFoundError } from "../errors";

export async function listAlerts(actor: Actor, raw: unknown) {
  const f = z
    .object({ severity: z.string().optional(), status: z.string().optional(), mine: z.string().optional() })
    .parse(raw);
  const db = getDb();
  const where: SQL[] = [];
  if (f.severity) where.push(eq(schema.alerts.severity, f.severity));
  if (f.status) where.push(eq(schema.alerts.status, f.status));
  else where.push(inArray(schema.alerts.status, ["OPEN", "ACKNOWLEDGED", "ESCALATED"]));
  if (f.mine === "1") where.push(eq(schema.alerts.assigneeId, actor.id));
  const rows = await db
    .select({
      a: schema.alerts,
      refNo: schema.applications.refNo,
      appStatus: schema.applications.status,
      institutionId: schema.applications.institutionId,
      assignedOfficerId: schema.applications.assignedOfficerId,
      institution: schema.institutions.name,
      findingRef: schema.findings.refNo,
      evidence: schema.findings.evidence,
      ruleCode: schema.findings.ruleCode,
      documentName: schema.documents.originalName,
      field: schema.findings.field,
      unresolvedCount: schema.findings.id,
    })
    .from(schema.alerts)
    .innerJoin(schema.applications, eq(schema.applications.id, schema.alerts.applicationId))
    .innerJoin(schema.institutions, eq(schema.institutions.id, schema.applications.institutionId))
    .leftJoin(schema.findings, eq(schema.findings.id, schema.alerts.findingId))
    .leftJoin(schema.documents, eq(schema.documents.id, schema.findings.documentId))
    .where(and(...where))
    .orderBy(desc(schema.alerts.createdAt));
  // Row-level authorization: same rule as application visibility.
  const visible = rows.filter((r) => canViewApplication(actor, { institutionId: r.institutionId, status: r.appStatus, assignedOfficerId: r.assignedOfficerId }));
  const ids = visible.map((r) => r.a.id);
  const events = ids.length
    ? await db.select().from(schema.alertEvents).where(inArray(schema.alertEvents.alertId, ids)).orderBy(desc(schema.alertEvents.createdAt))
    : [];
  const assignees = await db.select({ id: schema.users.id, name: schema.users.name }).from(schema.users);
  const sevRank: Record<string, number> = { CRITICAL: 0, HIGH: 1, MEDIUM: 2, LOW: 3 };
  return visible
    .map((r) => ({
      ...r.a,
      refNoApp: r.refNo,
      appStatus: r.appStatus,
      institution: r.institution,
      findingRef: r.findingRef,
      evidence: r.evidence,
      ruleCode: r.ruleCode,
      documentName: r.documentName,
      field: r.field,
      assigneeName: assignees.find((u) => u.id === r.a.assigneeId)?.name ?? null,
      events: events.filter((e) => e.alertId === r.a.id),
    }))
    .sort((x, y) => (sevRank[x.severity] ?? 9) - (sevRank[y.severity] ?? 9));
}

const AlertActionInput = z.object({
  alertId: z.string().min(1),
  action: z.enum(["ACKNOWLEDGE", "ASSIGN", "COMMENT", "ESCALATE", "RESOLVE"]),
  comment: z.string().trim().max(1000).default(""),
  assigneeId: z.string().optional(),
});

export async function alertAction(actor: Actor, raw: unknown) {
  const input = AlertActionInput.parse(raw);
  const db = getDb();
  const [row] = await db
    .select({ a: schema.alerts, app: schema.applications })
    .from(schema.alerts)
    .innerJoin(schema.applications, eq(schema.applications.id, schema.alerts.applicationId))
    .where(eq(schema.alerts.id, input.alertId));
  if (!row || !canViewApplication(actor, row.app)) throw new NotFoundError("Alert not found.");
  // Institutions may comment on their own alerts; managing alerts is an official action.
  if (input.action !== "COMMENT") assertCan(actor, "alert.manage");
  if ((input.action === "RESOLVE" || input.action === "ESCALATE" || input.action === "COMMENT") && input.comment.length < 3) {
    throw new AppError("Add a comment explaining this action.");
  }
  const patch: Partial<typeof schema.alerts.$inferInsert> = { updatedAt: new Date() };
  if (input.action === "ACKNOWLEDGE") patch.status = "ACKNOWLEDGED";
  if (input.action === "ESCALATE") patch.status = "ESCALATED";
  if (input.action === "RESOLVE") patch.status = "RESOLVED";
  if (input.action === "ASSIGN") {
    if (!input.assigneeId) throw new AppError("Choose an assignee.");
    const [u] = await db.select().from(schema.users).where(and(eq(schema.users.id, input.assigneeId), eq(schema.users.active, true)));
    if (!u || u.role === "INSTITUTION") throw new AppError("Alerts can only be assigned to active officers or administrators.");
    patch.assigneeId = u.id;
    if (row.a.status === "OPEN") patch.status = "ACKNOWLEDGED";
  }
  await db.update(schema.alerts).set(patch).where(eq(schema.alerts.id, row.a.id));
  await db.insert(schema.alertEvents).values({ alertId: row.a.id, actorId: actor.id, actorLabel: actor.name, action: input.action, comment: input.comment });
  await audit(db, {
    actor,
    action: `alert.${input.action.toLowerCase()}`,
    entityType: "alert",
    entityId: row.a.id,
    entityRef: row.a.refNo,
    previousState: row.a.status,
    newState: patch.status ?? row.a.status,
    reason: input.comment,
  });
}

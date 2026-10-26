// Official scrutiny: queue, human review of findings, case actions, decisions, assignment,
// document verification. Machine findings, officer-reviewed findings, externally verified
// facts and official decisions are stored separately and never conflated.
import { and, asc, desc, eq, inArray, isNull, like, or, sql, type SQL } from "drizzle-orm";
import { z } from "zod";
import { getDb, schema } from "../db";
import { audit, newCorrelationId } from "../audit";
import { assertCan, assertTransition, assertViewApplication, type Actor } from "../authz";
import { AppError, NotFoundError, WorkflowError } from "../errors";
import { computePriority } from "../validation/engine";
import { QUEUE_STATUSES, REVIEW_STATUSES, type ReviewStatus } from "@/lib/constants";
import { loadApplication, setStatus, shortCode } from "./common";
import { getVerificationAdapter, MANUAL_RESULTS } from "../verification";

// ── Queue ──

export const QueueFilters = z.object({
  q: z.string().trim().max(100).optional(),
  status: z.string().optional(),
  category: z.string().optional(),
  priority: z.enum(["LOW", "MEDIUM", "HIGH"]).optional(),
  officer: z.string().optional(), // user id | "unassigned"
  verification: z.enum(["pending", "all_verified", "issues"]).optional(),
  from: z.string().optional(),
  to: z.string().optional(),
  sort: z.enum(["submitted", "priority", "updated", "ref"]).default("priority"),
  dir: z.enum(["asc", "desc"]).default("desc"),
  page: z.coerce.number().int().min(1).default(1),
});
export type QueueFiltersT = z.infer<typeof QueueFilters>;
export const PAGE_SIZE = 10;

export async function getQueue(actor: Actor, raw: unknown) {
  assertCan(actor, "queue.view");
  const f = QueueFilters.parse(raw);
  const db = getDb();
  const A = schema.applications;
  const where: SQL[] = [inArray(A.status, QUEUE_STATUSES)];
  if (actor.role === "OFFICER") where.push(or(isNull(A.assignedOfficerId), eq(A.assignedOfficerId, actor.id))!);
  if (f.q) where.push(or(like(A.refNo, `%${f.q}%`), like(schema.institutions.name, `%${f.q}%`))!);
  if (f.status && (QUEUE_STATUSES as string[]).includes(f.status)) where.push(eq(A.status, f.status));
  if (f.category) where.push(eq(schema.categories.code, f.category));
  if (f.priority) where.push(eq(A.reviewPriority, f.priority));
  if (f.officer === "unassigned") where.push(isNull(A.assignedOfficerId));
  else if (f.officer) where.push(eq(A.assignedOfficerId, f.officer));
  if (f.from) where.push(sql`${A.submittedAt} >= ${new Date(f.from).getTime()}`);
  if (f.to) where.push(sql`${A.submittedAt} <= ${new Date(f.to).getTime() + 86_399_999}`);

  const officer = db.$with("o").as(db.select({ id: schema.users.id, name: schema.users.name }).from(schema.users));
  const order =
    f.sort === "submitted" ? A.submittedAt : f.sort === "updated" ? A.updatedAt : f.sort === "ref" ? A.refNo : A.priorityScore;
  const rows = await db
    .with(officer)
    .select({
      id: A.id,
      refNo: A.refNo,
      status: A.status,
      institution: schema.institutions.name,
      category: schema.categories.name,
      categoryCode: schema.categories.code,
      submittedAt: A.submittedAt,
      updatedAt: A.updatedAt,
      reviewPriority: A.reviewPriority,
      priorityScore: A.priorityScore,
      assignedOfficerId: A.assignedOfficerId,
      officerName: officer.name,
    })
    .from(A)
    .innerJoin(schema.institutions, eq(schema.institutions.id, A.institutionId))
    .innerJoin(schema.categories, eq(schema.categories.id, A.categoryId))
    .leftJoin(officer, eq(officer.id, A.assignedOfficerId))
    .where(and(...where))
    .orderBy(f.dir === "asc" ? asc(order) : desc(order));

  // Per-application counts from the latest completed run + documents.
  const ids = rows.map((r) => r.id);
  const counts = new Map<string, { critical: number; missing: number; unresolved: number; docsPending: number; docsIssues: number; docsTotal: number; openRect: number }>();
  if (ids.length) {
    const runIds = await latestRunIds(ids);
    const fs = runIds.length
      ? await db
          .select({ applicationId: schema.findings.applicationId, severity: schema.findings.severity, ruleCode: schema.findings.ruleCode, result: schema.findings.result, reviewStatus: schema.findings.reviewStatus })
          .from(schema.findings)
          .where(inArray(schema.findings.runId, runIds))
      : [];
    const docs = await db
      .select({ applicationId: schema.documents.applicationId, v: schema.documents.verificationStatus })
      .from(schema.documents)
      .where(and(inArray(schema.documents.applicationId, ids), eq(schema.documents.status, "ACTIVE")));
    const rect = await db
      .select({ applicationId: schema.rectificationRequests.applicationId })
      .from(schema.rectificationRequests)
      .where(and(inArray(schema.rectificationRequests.applicationId, ids), inArray(schema.rectificationRequests.status, ["OPEN", "RESPONDED"])));
    for (const id of ids) {
      const af = fs.filter((x) => x.applicationId === id);
      const ad = docs.filter((x) => x.applicationId === id);
      counts.set(id, {
        critical: af.filter((x) => x.severity === "CRITICAL" && !["DISMISSED", "MANUALLY_VERIFIED"].includes(x.reviewStatus)).length,
        missing: af.filter((x) => x.result === "INFORMATION_MISSING").length,
        unresolved: af.filter((x) => x.reviewStatus === "OPEN" || x.reviewStatus === "ADDITIONAL_EVIDENCE" || x.reviewStatus === "EXTERNAL_PENDING").length,
        docsPending: ad.filter((x) => ["VERIFICATION_PENDING", "MANUAL_REVIEW_REQUIRED", "SOURCE_UNAVAILABLE", "UNABLE_TO_DETERMINE"].includes(x.v)).length,
        docsIssues: ad.filter((x) => ["MISMATCH_DETECTED", "EXPIRED"].includes(x.v)).length,
        docsTotal: ad.length,
        openRect: rect.filter((x) => x.applicationId === id).length,
      });
    }
  }
  let enriched = rows.map((r) => {
    const c = counts.get(r.id) ?? { critical: 0, missing: 0, unresolved: 0, docsPending: 0, docsIssues: 0, docsTotal: 0, openRect: 0 };
    const docVerification = c.docsIssues > 0 ? "issues" : c.docsPending > 0 || c.docsTotal === 0 ? "pending" : "all_verified";
    const daysWaiting = r.submittedAt ? Math.floor((Date.now() - r.submittedAt.getTime()) / 86_400_000) : 0;
    return { ...r, ...c, docVerification, daysWaiting };
  });
  if (f.verification) enriched = enriched.filter((r) => r.docVerification === f.verification);
  const total = enriched.length;
  const pageRows = enriched.slice((f.page - 1) * PAGE_SIZE, f.page * PAGE_SIZE);
  return { rows: pageRows, total, page: f.page, pageCount: Math.max(1, Math.ceil(total / PAGE_SIZE)), filters: f };
}

/** Latest COMPLETED validation run id for each application. */
export async function latestRunIds(applicationIds: string[]): Promise<string[]> {
  if (applicationIds.length === 0) return [];
  const runs = await getDb()
    .select({ id: schema.validationRuns.id, applicationId: schema.validationRuns.applicationId, startedAt: schema.validationRuns.startedAt })
    .from(schema.validationRuns)
    .where(and(inArray(schema.validationRuns.applicationId, applicationIds), eq(schema.validationRuns.status, "COMPLETED")));
  const best = new Map<string, { id: string; t: number }>();
  for (const r of runs) {
    const t = r.startedAt.getTime();
    const cur = best.get(r.applicationId);
    if (!cur || t > cur.t) best.set(r.applicationId, { id: r.id, t });
  }
  return [...best.values()].map((b) => b.id);
}

// ── Human review of findings ──

const ReviewInput = z.object({
  findingId: z.string().min(1),
  status: z.enum(["CONFIRMED", "DISMISSED", "ADDITIONAL_EVIDENCE", "EXTERNAL_PENDING", "MANUALLY_VERIFIED"]),
  reason: z.string().trim().min(5, "Give a reason (at least 5 characters)").max(1000),
});

export async function reviewFinding(actor: Actor, raw: unknown) {
  assertCan(actor, "review.record");
  const input = ReviewInput.parse(raw);
  const db = getDb();
  const [finding] = await db.select().from(schema.findings).where(eq(schema.findings.id, input.findingId));
  if (!finding) throw new NotFoundError("Finding not found.");
  const app = await loadApplication(finding.applicationId);
  assertViewApplication(actor, app);
  if (["APPROVED", "REJECTED", "WITHDRAWN"].includes(app.status)) throw new WorkflowError("A final decision is already recorded for this application.");
  const correlationId = newCorrelationId();

  await db
    .update(schema.findings)
    .set({ reviewStatus: input.status, reviewedById: actor.id, reviewedAt: new Date(), reviewReason: input.reason })
    .where(eq(schema.findings.id, finding.id));
  await db.insert(schema.reviewObservations).values({
    applicationId: app.id,
    findingId: finding.id,
    reviewerId: actor.id,
    action: `FINDING_${input.status}`,
    reason: input.reason,
  });
  await audit(db, {
    actor,
    action: "finding.reviewed",
    entityType: "finding",
    entityId: finding.id,
    entityRef: finding.refNo,
    previousState: finding.reviewStatus,
    newState: input.status,
    reason: input.reason,
    correlationId,
    metadata: { application: app.refNo },
  });

  // Resolve linked alerts when the officer clears the finding.
  if (input.status === "DISMISSED" || input.status === "MANUALLY_VERIFIED") {
    const linked = await db.select().from(schema.alerts).where(and(eq(schema.alerts.findingId, finding.id)));
    for (const a of linked.filter((x) => x.status !== "RESOLVED")) {
      await db.update(schema.alerts).set({ status: "RESOLVED", updatedAt: new Date() }).where(eq(schema.alerts.id, a.id));
      await db.insert(schema.alertEvents).values({ alertId: a.id, actorId: actor.id, actorLabel: actor.name, action: "RESOLVED", comment: `Finding ${REVIEW_STATUSES[input.status as ReviewStatus].toLowerCase()}: ${input.reason}` });
    }
  }

  // First review action moves a submitted case into review.
  if (app.status === "SUBMITTED") await setStatus(db, app, "UNDER_REVIEW", actor, "Officer started review", correlationId);
  if (!app.assignedOfficerId && actor.role === "OFFICER") {
    await db.update(schema.applications).set({ assignedOfficerId: actor.id }).where(eq(schema.applications.id, app.id));
    await audit(db, { actor, action: "application.self_assigned", entityType: "application", entityId: app.id, entityRef: app.refNo, correlationId });
  }
  await recomputePriority(app.id);
}

export async function recomputePriority(applicationId: string) {
  const db = getDb();
  const [run] = await db
    .select({ id: schema.validationRuns.id })
    .from(schema.validationRuns)
    .where(and(eq(schema.validationRuns.applicationId, applicationId), eq(schema.validationRuns.status, "COMPLETED")))
    .orderBy(desc(schema.validationRuns.startedAt))
    .limit(1);
  if (!run) return;
  const fs = await db
    .select({ severity: schema.findings.severity, result: schema.findings.result, ruleId: schema.findings.ruleId, reviewStatus: schema.findings.reviewStatus })
    .from(schema.findings)
    .where(eq(schema.findings.runId, run.id));
  const ruleIds = [...new Set(fs.map((f) => f.ruleId).filter(Boolean))] as string[];
  const rules = ruleIds.length ? await db.select({ id: schema.validationRules.id, type: schema.validationRules.type }).from(schema.validationRules).where(inArray(schema.validationRules.id, ruleIds)) : [];
  const pr = computePriority(fs.map((f) => ({ ...f, ruleType: rules.find((r) => r.id === f.ruleId)?.type ?? "" })));
  await db
    .update(schema.applications)
    .set({ reviewPriority: pr.level, priorityScore: pr.score, priorityFactors: JSON.stringify(pr.factors), updatedAt: new Date() })
    .where(eq(schema.applications.id, applicationId));
}

export async function addObservation(actor: Actor, applicationId: string, text: string) {
  assertCan(actor, "review.record");
  const reason = z.string().trim().min(3).max(2000).parse(text);
  const app = await loadApplication(applicationId);
  assertViewApplication(actor, app);
  const db = getDb();
  await db.insert(schema.reviewObservations).values({ applicationId, reviewerId: actor.id, action: "OBSERVATION", reason });
  await audit(db, { actor, action: "review.observation_added", entityType: "application", entityId: app.id, entityRef: app.refNo });
}

// ── Case actions (workflow) ──

const CaseAction = z.object({
  action: z.enum(["START_REVIEW", "REQUEST_CLARIFICATION", "MARK_EXTERNAL_PENDING", "RECOMMEND_INSPECTION", "RETURN_TO_REVIEW"]),
  reason: z.string().trim().min(5, "Give a reason (at least 5 characters)").max(2000),
});

const ACTION_TARGET = {
  START_REVIEW: "UNDER_REVIEW",
  REQUEST_CLARIFICATION: "CLARIFICATION_REQUESTED",
  MARK_EXTERNAL_PENDING: "PENDING_EXTERNAL_VERIFICATION",
  RECOMMEND_INSPECTION: "INSPECTION_RECOMMENDED",
  RETURN_TO_REVIEW: "UNDER_REVIEW",
} as const;

export async function caseAction(actor: Actor, applicationId: string, raw: unknown) {
  assertCan(actor, "review.updateCaseStatus");
  const input = CaseAction.parse(raw);
  const app = await loadApplication(applicationId);
  assertViewApplication(actor, app);
  assertTransition(input.action, app.status);
  const db = getDb();
  const correlationId = newCorrelationId();
  if (input.action === "REQUEST_CLARIFICATION") {
    await db.insert(schema.rectificationRequests).values({ applicationId, requestedById: actor.id, message: input.reason });
    await audit(db, { actor, action: "rectification.requested", entityType: "application", entityId: app.id, entityRef: app.refNo, reason: input.reason, correlationId });
  }
  await db.insert(schema.reviewObservations).values({ applicationId, reviewerId: actor.id, action: input.action, reason: input.reason });
  await setStatus(db, app, ACTION_TARGET[input.action], actor, input.reason, correlationId);
  if (!app.assignedOfficerId && actor.role === "OFFICER") {
    await db.update(schema.applications).set({ assignedOfficerId: actor.id }).where(eq(schema.applications.id, app.id));
  }
}

// ── Official decision (authorized demo authority only) ──

export async function recordDecision(actor: Actor, applicationId: string, raw: unknown) {
  assertCan(actor, "decision.record");
  const input = z
    .object({ decision: z.enum(["APPROVED", "REJECTED"]), reason: z.string().trim().min(10, "Record the basis for the decision (10+ characters)").max(2000) })
    .parse(raw);
  const app = await loadApplication(applicationId);
  assertViewApplication(actor, app);
  assertTransition("RECORD_DECISION", app.status);
  const db = getDb();
  const correlationId = newCorrelationId();
  await db.insert(schema.officialDecisions).values({ applicationId, decision: input.decision, decidedById: actor.id, reason: input.reason });
  await setStatus(db, app, input.decision, actor, `Official decision recorded by authorized user: ${input.reason}`, correlationId);
  await audit(db, { actor, action: "decision.recorded", entityType: "application", entityId: app.id, entityRef: app.refNo, newState: input.decision, reason: input.reason, correlationId });
}

export async function recordCertificate(actor: Actor, applicationId: string, raw: unknown) {
  assertCan(actor, "certificate.record");
  const input = z.object({ issuingAuthority: z.string().trim().min(3).max(200) }).parse(raw);
  const app = await loadApplication(applicationId);
  assertViewApplication(actor, app);
  if (app.status !== "APPROVED") throw new WorkflowError("A certificate record can only follow an APPROVED official decision.");
  const db = getDb();
  const certificateRef = `DEMO-CERT-${new Date().getFullYear()}-${shortCode(6)}`;
  await db.insert(schema.certificateRecords).values({ applicationId, certificateRef, issuingAuthority: input.issuingAuthority, recordedById: actor.id, isDemo: true });
  await audit(db, { actor, action: "certificate.recorded", entityType: "application", entityId: app.id, entityRef: app.refNo, newState: certificateRef });
  return certificateRef;
}

// ── Assignment ──

export async function assignApplications(actor: Actor, applicationIds: string[], officerId: string | null) {
  assertCan(actor, "application.assign");
  if (applicationIds.length === 0) throw new AppError("Select at least one application.");
  const db = getDb();
  if (officerId) {
    const [o] = await db.select().from(schema.users).where(and(eq(schema.users.id, officerId), eq(schema.users.role, "OFFICER"), eq(schema.users.active, true)));
    if (!o) throw new AppError("Select an active scrutiny officer.");
  }
  const apps = await db.select().from(schema.applications).where(inArray(schema.applications.id, applicationIds));
  const correlationId = newCorrelationId();
  for (const app of apps) {
    if (!(QUEUE_STATUSES as string[]).includes(app.status)) continue;
    await db.update(schema.applications).set({ assignedOfficerId: officerId, updatedAt: new Date() }).where(eq(schema.applications.id, app.id));
    await audit(db, { actor, action: "application.assigned", entityType: "application", entityId: app.id, entityRef: app.refNo, previousState: app.assignedOfficerId ?? "unassigned", newState: officerId ?? "unassigned", correlationId });
  }
}

export async function listOfficers() {
  return getDb().select({ id: schema.users.id, name: schema.users.name }).from(schema.users).where(and(eq(schema.users.role, "OFFICER"), eq(schema.users.active, true)));
}

// ── Document verification ──

export async function runSourceVerification(actor: Actor, documentId: string) {
  assertCan(actor, "verification.run");
  const db = getDb();
  const [doc] = await db.select().from(schema.documents).where(eq(schema.documents.id, documentId));
  if (!doc) throw new NotFoundError();
  const app = await loadApplication(doc.applicationId);
  assertViewApplication(actor, app);
  const fields = await db.select().from(schema.extractedFields).where(eq(schema.extractedFields.documentId, doc.id));
  const adapter = getVerificationAdapter(doc.docTypeCode);
  const res = await adapter.verify({
    docTypeCode: doc.docTypeCode,
    documentNumber: fields.find((f) => f.field === "document_number")?.value ?? null,
    institutionId: fields.find((f) => f.field === "institution_id")?.value ?? null,
    expiryDate: fields.find((f) => f.field === "expiry_date")?.value ?? null,
  });
  await db.insert(schema.documentVerifications).values({
    documentId: doc.id,
    sourceCode: adapter.code,
    sourceName: adapter.name,
    sourceType: adapter.sourceType,
    method: res.method,
    result: res.result,
    returnedFields: JSON.stringify(res.returnedFields),
    evidenceRef: res.evidenceRef,
    initiatedBy: `${actor.name} (${actor.role.toLowerCase()})`,
    notes: res.notes,
  });
  await db.update(schema.documents).set({ verificationStatus: res.result }).where(eq(schema.documents.id, doc.id));
  await audit(db, { actor, action: "verification.source_checked", entityType: "document", entityId: doc.id, entityRef: app.refNo, newState: res.result, metadata: { source: adapter.code, sourceType: adapter.sourceType } });
  return res;
}

export async function recordManualVerification(actor: Actor, documentId: string, raw: unknown) {
  assertCan(actor, "verification.run");
  const input = z
    .object({ result: z.enum(MANUAL_RESULTS), notes: z.string().trim().min(5, "Describe what was checked (5+ characters)").max(1000) })
    .parse(raw);
  const db = getDb();
  const [doc] = await db.select().from(schema.documents).where(eq(schema.documents.id, documentId));
  if (!doc) throw new NotFoundError();
  const app = await loadApplication(doc.applicationId);
  assertViewApplication(actor, app);
  await db.insert(schema.documentVerifications).values({
    documentId: doc.id,
    sourceCode: "MANUAL",
    sourceName: "Manual verification by authorized personnel",
    sourceType: "MANUAL",
    method: "Manual inspection",
    result: input.result,
    initiatedBy: `${actor.name} (${actor.role.toLowerCase()})`,
    notes: input.notes,
  });
  await db.update(schema.documents).set({ verificationStatus: input.result }).where(eq(schema.documents.id, doc.id));
  await audit(db, { actor, action: "verification.manual_recorded", entityType: "document", entityId: doc.id, entityRef: app.refNo, newState: input.result, reason: input.notes });
}

import { and, asc, desc, eq, inArray, ne } from "drizzle-orm";
import { z } from "zod";
import { getDb, schema } from "../db";
import { audit, newCorrelationId } from "../audit";
import { assertCan, assertInstitutionEditable, assertViewApplication, type Actor } from "../authz";
import { AppError, NotFoundError, WorkflowError } from "../errors";
import { appRef, loadApplication, setStatus } from "./common";

const optInt = (max: number) =>
  z.preprocess(
    (v) => (v === "" || v === null || v === undefined ? null : Number(v)),
    z.number({ invalid_type_error: "Enter a whole number" }).int("Enter a whole number").min(0).max(max).nullable(),
  );

export const ApplicationInput = z.object({
  categoryCode: z.string().min(1, "Select an application category"),
  academicYear: z.string().regex(/^\d{4}-\d{2}$/, "Use the format 2026-27"),
  declaredInstitutionName: z.string().trim().min(3, "Institution name is required").max(200),
  declaredInstitutionRef: z.string().trim().min(3, "Institution reference ID is required").max(50),
  address: z.string().trim().max(300).default(""),
  state: z.string().trim().max(80).default(""),
  affiliatedUniversity: z.string().trim().max(200).default(""),
  programmeName: z.string().trim().max(300).default(""),
  approvedIntake: optInt(10000),
  proposedIntake: optInt(10000),
  previousApprovalRef: z.string().trim().max(80).default(""),
  accreditationDetails: z.string().trim().max(500).default(""),
  contactName: z.string().trim().max(120).default(""),
  contactEmail: z.union([z.literal(""), z.string().trim().email("Enter a valid email")]).default(""),
  contactPhone: z.string().trim().max(30).default(""),
  paymentReference: z.string().trim().max(60).default(""),
  paymentAmount: optInt(100_000_000),
});
export type ApplicationInputT = z.infer<typeof ApplicationInput>;

export async function createApplication(actor: Actor, raw: unknown) {
  assertCan(actor, "application.create");
  if (!actor.institutionId) throw new AppError("Your account is not linked to an institution.");
  const input = ApplicationInput.parse(raw);
  const db = getDb();
  const [cat] = await db
    .select()
    .from(schema.categories)
    .where(and(eq(schema.categories.code, input.categoryCode), eq(schema.categories.active, true)))
    .limit(1);
  if (!cat) throw new AppError("Unknown or inactive application category.");
  const [inst] = await db.select({ isSynthetic: schema.institutions.isSynthetic }).from(schema.institutions).where(eq(schema.institutions.id, actor.institutionId)).limit(1);
  const { categoryCode: _c, ...fields } = input;
  const correlationId = newCorrelationId();
  const refNo = appRef();
  const [app] = await db
    .insert(schema.applications)
    .values({
      ...fields,
      refNo,
      institutionId: actor.institutionId,
      categoryId: cat.id,
      status: "DRAFT",
      createdById: actor.id,
      isSynthetic: inst?.isSynthetic ?? true,
    })
    .returning();
  await db.insert(schema.statusHistory).values({ applicationId: app.id, fromStatus: null, toStatus: "DRAFT", actorId: actor.id, reason: "Application created" });
  await audit(db, { actor, action: "application.created", entityType: "application", entityId: app.id, entityRef: refNo, newState: "DRAFT", correlationId, metadata: { category: cat.code } });
  return app;
}

export async function updateApplication(actor: Actor, id: string, raw: unknown) {
  assertCan(actor, "application.edit");
  const app = await loadApplication(id);
  assertViewApplication(actor, app);
  assertInstitutionEditable(app);
  const input = ApplicationInput.omit({ categoryCode: true }).parse(raw);
  const db = getDb();
  await db
    .update(schema.applications)
    .set({ ...input, updatedAt: new Date(), documentsChangedAt: new Date() })
    .where(eq(schema.applications.id, id));
  await audit(db, { actor, action: "application.updated", entityType: "application", entityId: id, entityRef: app.refNo });
}

/** Institution's own applications (history view). */
export async function listOwnApplications(actor: Actor) {
  if (actor.role !== "INSTITUTION" || !actor.institutionId) return [];
  return getDb()
    .select({
      id: schema.applications.id,
      refNo: schema.applications.refNo,
      status: schema.applications.status,
      academicYear: schema.applications.academicYear,
      category: schema.categories.name,
      createdAt: schema.applications.createdAt,
      updatedAt: schema.applications.updatedAt,
      submittedAt: schema.applications.submittedAt,
      reviewPriority: schema.applications.reviewPriority,
    })
    .from(schema.applications)
    .innerJoin(schema.categories, eq(schema.categories.id, schema.applications.categoryId))
    .where(eq(schema.applications.institutionId, actor.institutionId))
    .orderBy(desc(schema.applications.updatedAt));
}

export async function getApplicationDetail(actor: Actor, id: string) {
  const db = getDb();
  const app = await loadApplication(id);
  assertViewApplication(actor, app);
  const [institution] = await db.select().from(schema.institutions).where(eq(schema.institutions.id, app.institutionId));
  const [category] = await db.select().from(schema.categories).where(eq(schema.categories.id, app.categoryId));
  const checklist = await db
    .select({
      docTypeCode: schema.checklistItems.docTypeCode,
      mandatory: schema.checklistItems.mandatory,
      label: schema.documentTypes.label,
      hasExpiry: schema.documentTypes.hasExpiry,
      isInfrastructure: schema.documentTypes.isInfrastructure,
    })
    .from(schema.checklistItems)
    .innerJoin(schema.documentTypes, eq(schema.documentTypes.code, schema.checklistItems.docTypeCode))
    .where(eq(schema.checklistItems.categoryId, app.categoryId))
    .orderBy(asc(schema.checklistItems.sortOrder));
  const docs = await db
    .select()
    .from(schema.documents)
    .where(and(eq(schema.documents.applicationId, id), ne(schema.documents.status, "REMOVED")))
    .orderBy(asc(schema.documents.uploadedAt));
  const docIds = docs.map((d) => d.id);
  const pages = docIds.length
    ? await db.select().from(schema.documentPages).where(inArray(schema.documentPages.documentId, docIds)).orderBy(asc(schema.documentPages.pageNumber))
    : [];
  const fields = docIds.length ? await db.select().from(schema.extractedFields).where(inArray(schema.extractedFields.documentId, docIds)) : [];
  const verifications = docIds.length
    ? await db.select().from(schema.documentVerifications).where(inArray(schema.documentVerifications.documentId, docIds)).orderBy(desc(schema.documentVerifications.createdAt))
    : [];
  const [latestRun] = await db
    .select()
    .from(schema.validationRuns)
    .where(and(eq(schema.validationRuns.applicationId, id), eq(schema.validationRuns.status, "COMPLETED")))
    .orderBy(desc(schema.validationRuns.startedAt))
    .limit(1);
  const findingRows = latestRun
    ? await db.select().from(schema.findings).where(eq(schema.findings.runId, latestRun.id))
    : [];
  const history = await db
    .select({ h: schema.statusHistory, actorName: schema.users.name })
    .from(schema.statusHistory)
    .leftJoin(schema.users, eq(schema.users.id, schema.statusHistory.actorId))
    .where(eq(schema.statusHistory.applicationId, id))
    .orderBy(desc(schema.statusHistory.createdAt));
  const rectifications = await db.select().from(schema.rectificationRequests).where(eq(schema.rectificationRequests.applicationId, id)).orderBy(desc(schema.rectificationRequests.createdAt));
  const observations = await db
    .select({ o: schema.reviewObservations, reviewer: schema.users.name })
    .from(schema.reviewObservations)
    .innerJoin(schema.users, eq(schema.users.id, schema.reviewObservations.reviewerId))
    .where(eq(schema.reviewObservations.applicationId, id))
    .orderBy(desc(schema.reviewObservations.createdAt));
  const decisions = await db
    .select({ d: schema.officialDecisions, by: schema.users.name })
    .from(schema.officialDecisions)
    .innerJoin(schema.users, eq(schema.users.id, schema.officialDecisions.decidedById))
    .where(eq(schema.officialDecisions.applicationId, id));
  const certificates = await db.select().from(schema.certificateRecords).where(eq(schema.certificateRecords.applicationId, id));
  const runs = await db
    .select({ id: schema.validationRuns.id, startedAt: schema.validationRuns.startedAt, aiMode: schema.validationRuns.aiMode, findingCount: schema.validationRuns.findingCount, rulesetVersion: schema.validationRuns.rulesetVersion })
    .from(schema.validationRuns)
    .where(eq(schema.validationRuns.applicationId, id))
    .orderBy(desc(schema.validationRuns.startedAt));
  const officer = app.assignedOfficerId
    ? (await db.select({ name: schema.users.name }).from(schema.users).where(eq(schema.users.id, app.assignedOfficerId)))[0]
    : undefined;

  const sevOrder: Record<string, number> = { CRITICAL: 0, HIGH: 1, MEDIUM: 2, LOW: 3, INFO: 4 };
  findingRows.sort((a, b) => (sevOrder[a.severity] ?? 9) - (sevOrder[b.severity] ?? 9));

  return {
    app,
    institution,
    category,
    checklist,
    officerName: officer?.name ?? null,
    documents: docs.map((d) => ({
      ...d,
      pages: pages.filter((p) => p.documentId === d.id),
      fields: fields.filter((f) => f.documentId === d.id),
      verifications: verifications.filter((v) => v.documentId === d.id),
    })),
    latestRun: latestRun ?? null,
    findings: findingRows,
    runs,
    history: history.map((r) => ({ ...r.h, actorName: r.actorName })),
    rectifications,
    observations: observations.map((r) => ({ ...r.o, reviewer: r.reviewer })),
    decisions: decisions.map((r) => ({ ...r.d, by: r.by })),
    certificates,
    validationIsCurrent: Boolean(
      latestRun && (!app.documentsChangedAt || app.documentsChangedAt.getTime() <= latestRun.startedAt.getTime()),
    ),
  };
}

export async function submitApplication(actor: Actor, id: string, declarationAccepted: boolean) {
  assertCan(actor, "application.submit");
  const app = await loadApplication(id);
  assertViewApplication(actor, app);
  assertInstitutionEditable(app);
  if (!declarationAccepted) throw new AppError("You must accept the declaration before submitting.");
  const detail = await getApplicationDetail(actor, id);
  if (!detail.latestRun) throw new WorkflowError("Run AI-assisted validation before submitting.");
  if (!detail.validationIsCurrent) throw new WorkflowError("The application or its documents changed after the last validation. Re-run validation before submitting.");
  const criticalOpen = detail.findings.filter((f) => f.severity === "CRITICAL" && f.reviewStatus === "OPEN");
  if (criticalOpen.length > 0) {
    throw new WorkflowError(`Submission is blocked while ${criticalOpen.length} critical finding(s) remain (for example missing mandatory documents). Resolve them and re-validate.`);
  }
  const db = getDb();
  const correlationId = newCorrelationId();
  const wasClarification = app.status === "CLARIFICATION_REQUESTED";
  await db.update(schema.applications).set({ declarationAccepted: true }).where(eq(schema.applications.id, id));
  await setStatus(db, app, "SUBMITTED", actor, wasClarification ? "Resubmitted after clarification" : "Submitted by institution with declaration", correlationId);
  if (wasClarification) {
    await db
      .update(schema.rectificationRequests)
      .set({ status: "CLOSED" })
      .where(and(eq(schema.rectificationRequests.applicationId, id), eq(schema.rectificationRequests.status, "RESPONDED")));
  }
  await audit(db, { actor, action: "application.submitted", entityType: "application", entityId: id, entityRef: app.refNo, correlationId });
}

export async function respondToRectification(actor: Actor, rectificationId: string, response: string) {
  if (actor.role !== "INSTITUTION") throw new NotFoundError();
  const text = z.string().trim().min(5, "Write a short response").max(2000).parse(response);
  const db = getDb();
  const [r] = await db.select().from(schema.rectificationRequests).where(eq(schema.rectificationRequests.id, rectificationId));
  if (!r) throw new NotFoundError();
  const app = await loadApplication(r.applicationId);
  assertViewApplication(actor, app);
  if (r.status !== "OPEN") throw new WorkflowError("This request has already been answered.");
  await db
    .update(schema.rectificationRequests)
    .set({ status: "RESPONDED", response: text, respondedAt: new Date() })
    .where(eq(schema.rectificationRequests.id, r.id));
  await audit(db, { actor, action: "rectification.responded", entityType: "application", entityId: app.id, entityRef: app.refNo });
}

export async function withdrawApplication(actor: Actor, id: string, reason: string) {
  assertCan(actor, "application.edit");
  const app = await loadApplication(id);
  assertViewApplication(actor, app);
  assertInstitutionEditable(app);
  await setStatus(getDb(), app, "WITHDRAWN", actor, reason || "Withdrawn by institution");
}

export async function listActiveCategories() {
  const db = getDb();
  const cats = await db.select().from(schema.categories).where(eq(schema.categories.active, true)).orderBy(asc(schema.categories.name));
  const items = await db
    .select({ categoryId: schema.checklistItems.categoryId, label: schema.documentTypes.label, mandatory: schema.checklistItems.mandatory, sortOrder: schema.checklistItems.sortOrder })
    .from(schema.checklistItems)
    .innerJoin(schema.documentTypes, eq(schema.documentTypes.code, schema.checklistItems.docTypeCode))
    .orderBy(asc(schema.checklistItems.sortOrder));
  return cats.map((c) => ({ ...c, checklist: items.filter((i) => i.categoryId === c.id) }));
}

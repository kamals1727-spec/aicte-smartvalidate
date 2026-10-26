// AICTE SmartValidate — independent prototype. NOT an official AICTE system.
// Database schema (Drizzle ORM, SQLite / libSQL). The same schema runs on a local SQLite
// file and on a hosted libSQL (Turso) database. Enum-like columns are plain text; the
// allowed values live in src/lib/constants.ts.
import { index, integer, real, sqliteTable, text, uniqueIndex, blob } from "drizzle-orm/sqlite-core";
import { randomUUID } from "node:crypto";

const id = () =>
  text("id")
    .primaryKey()
    .$defaultFn(() => randomUUID());
const createdAt = () =>
  integer("created_at", { mode: "timestamp_ms" })
    .notNull()
    .$defaultFn(() => new Date());
const ts = (name: string) => integer(name, { mode: "timestamp_ms" });

export const institutions = sqliteTable("institutions", {
  id: id(),
  refId: text("ref_id").notNull().unique(),
  name: text("name").notNull(),
  address: text("address").notNull(),
  city: text("city").notNull(),
  state: text("state").notNull(),
  affiliatedUniversity: text("affiliated_university").notNull(),
  approvalStatus: text("approval_status").notNull(),
  contactEmail: text("contact_email").notNull(),
  contactPhone: text("contact_phone").notNull(),
  isSynthetic: integer("is_synthetic", { mode: "boolean" }).notNull().default(true),
  createdAt: createdAt(),
});

export const users = sqliteTable(
  "users",
  {
    id: id(),
    email: text("email").notNull().unique(),
    name: text("name").notNull(),
    passwordHash: text("password_hash").notNull(),
    role: text("role").notNull(), // INSTITUTION | OFFICER | ADMIN
    active: integer("active", { mode: "boolean" }).notNull().default(true),
    institutionId: text("institution_id").references(() => institutions.id),
    lastLoginAt: ts("last_login_at"),
    createdAt: createdAt(),
  },
  (t) => [index("users_role_idx").on(t.role), index("users_inst_idx").on(t.institutionId)],
);

export const documentTypes = sqliteTable("document_types", {
  code: text("code").primaryKey(),
  label: text("label").notNull(),
  hasExpiry: integer("has_expiry", { mode: "boolean" }).notNull().default(false),
  isInfrastructure: integer("is_infrastructure", { mode: "boolean" }).notNull().default(false),
  description: text("description").notNull().default(""),
});

export const categories = sqliteTable("application_categories", {
  id: id(),
  code: text("code").notNull().unique(),
  name: text("name").notNull(),
  description: text("description").notNull(),
  active: integer("active", { mode: "boolean" }).notNull().default(true),
  requiresPayment: integer("requires_payment", { mode: "boolean" }).notNull().default(true),
  createdAt: createdAt(),
});

export const checklistItems = sqliteTable(
  "checklist_items",
  {
    id: id(),
    categoryId: text("category_id")
      .notNull()
      .references(() => categories.id, { onDelete: "cascade" }),
    docTypeCode: text("doc_type_code")
      .notNull()
      .references(() => documentTypes.code),
    mandatory: integer("mandatory", { mode: "boolean" }).notNull().default(true),
    sortOrder: integer("sort_order").notNull().default(0),
  },
  (t) => [uniqueIndex("checklist_cat_doc_uq").on(t.categoryId, t.docTypeCode)],
);

export const rulesetVersions = sqliteTable("ruleset_versions", {
  id: id(),
  version: text("version").notNull().unique(),
  active: integer("active", { mode: "boolean" }).notNull().default(false),
  notes: text("notes").notNull().default(""),
  createdAt: createdAt(),
});

export const validationRules = sqliteTable(
  "validation_rules",
  {
    id: id(),
    ruleCode: text("rule_code").notNull(),
    rulesetVersionId: text("ruleset_version_id")
      .notNull()
      .references(() => rulesetVersions.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    description: text("description").notNull(),
    type: text("type").notNull(),
    severity: text("severity").notNull(),
    params: text("params").notNull().default("{}"),
    categories: text("categories").notNull().default("*"),
    sourceReference: text("source_reference")
      .notNull()
      .default("DEMO RULE — illustrative only, not an official AICTE regulation"),
    active: integer("active", { mode: "boolean" }).notNull().default(true),
    effectiveDate: integer("effective_date", { mode: "timestamp_ms" })
      .notNull()
      .$defaultFn(() => new Date()),
    updatedAt: integer("updated_at", { mode: "timestamp_ms" })
      .notNull()
      .$defaultFn(() => new Date()),
  },
  (t) => [uniqueIndex("rules_version_code_uq").on(t.rulesetVersionId, t.ruleCode)],
);

export const applications = sqliteTable(
  "applications",
  {
    id: id(),
    refNo: text("ref_no").notNull().unique(),
    institutionId: text("institution_id")
      .notNull()
      .references(() => institutions.id),
    categoryId: text("category_id")
      .notNull()
      .references(() => categories.id),
    status: text("status").notNull().default("DRAFT"),
    academicYear: text("academic_year").notNull(),
    declaredInstitutionName: text("declared_institution_name").notNull(),
    declaredInstitutionRef: text("declared_institution_ref").notNull(),
    address: text("address").notNull().default(""),
    state: text("state").notNull().default(""),
    affiliatedUniversity: text("affiliated_university").notNull().default(""),
    programmeName: text("programme_name").notNull().default(""),
    approvedIntake: integer("approved_intake"),
    proposedIntake: integer("proposed_intake"),
    previousApprovalRef: text("previous_approval_ref").notNull().default(""),
    accreditationDetails: text("accreditation_details").notNull().default(""),
    contactName: text("contact_name").notNull().default(""),
    contactEmail: text("contact_email").notNull().default(""),
    contactPhone: text("contact_phone").notNull().default(""),
    paymentReference: text("payment_reference").notNull().default(""),
    paymentAmount: integer("payment_amount"),
    declarationAccepted: integer("declaration_accepted", { mode: "boolean" }).notNull().default(false),
    reviewPriority: text("review_priority").notNull().default("LOW"),
    priorityScore: integer("priority_score").notNull().default(0),
    priorityFactors: text("priority_factors").notNull().default("[]"),
    isSynthetic: integer("is_synthetic", { mode: "boolean" }).notNull().default(true),
    submittedAt: ts("submitted_at"),
    createdById: text("created_by_id")
      .notNull()
      .references(() => users.id),
    assignedOfficerId: text("assigned_officer_id").references(() => users.id),
    documentsChangedAt: ts("documents_changed_at"),
    lastValidatedAt: ts("last_validated_at"),
    createdAt: createdAt(),
    updatedAt: integer("updated_at", { mode: "timestamp_ms" })
      .notNull()
      .$defaultFn(() => new Date()),
  },
  (t) => [
    index("apps_inst_idx").on(t.institutionId),
    index("apps_status_idx").on(t.status),
    index("apps_officer_idx").on(t.assignedOfficerId),
  ],
);

export const statusHistory = sqliteTable(
  "application_status_history",
  {
    id: id(),
    applicationId: text("application_id")
      .notNull()
      .references(() => applications.id, { onDelete: "cascade" }),
    fromStatus: text("from_status"),
    toStatus: text("to_status").notNull(),
    actorId: text("actor_id").references(() => users.id),
    reason: text("reason").notNull().default(""),
    createdAt: createdAt(),
  },
  (t) => [index("status_hist_app_idx").on(t.applicationId)],
);

export const documents = sqliteTable(
  "uploaded_documents",
  {
    id: id(),
    applicationId: text("application_id")
      .notNull()
      .references(() => applications.id, { onDelete: "cascade" }),
    docTypeCode: text("doc_type_code").notNull(),
    originalName: text("original_name").notNull(),
    mimeType: text("mime_type").notNull(),
    sizeBytes: integer("size_bytes").notNull(),
    sha256: text("sha256").notNull(),
    storageKey: text("storage_key").notNull(),
    storageDriver: text("storage_driver").notNull(),
    caption: text("caption").notNull().default(""),
    status: text("status").notNull().default("ACTIVE"), // ACTIVE | REPLACED | REMOVED
    replacesId: text("replaces_id"),
    extractionStatus: text("extraction_status").notNull().default("PENDING"),
    extractionError: text("extraction_error"),
    pageCount: integer("page_count").notNull().default(0),
    verificationStatus: text("verification_status").notNull().default("VERIFICATION_PENDING"),
    uploadedById: text("uploaded_by_id")
      .notNull()
      .references(() => users.id),
    uploadedAt: createdAt(),
  },
  (t) => [index("docs_app_idx").on(t.applicationId), index("docs_sha_idx").on(t.sha256)],
);

export const storedBlobs = sqliteTable("stored_blobs", {
  key: text("key").primaryKey(),
  data: blob("data", { mode: "buffer" }).notNull(),
  createdAt: createdAt(),
});

export const documentPages = sqliteTable(
  "document_pages",
  {
    id: id(),
    documentId: text("document_id")
      .notNull()
      .references(() => documents.id, { onDelete: "cascade" }),
    pageNumber: integer("page_number").notNull(),
    text: text("text").notNull(),
    method: text("method").notNull(), // text_layer | ocr | none
    ocrConfidence: real("ocr_confidence"),
  },
  (t) => [uniqueIndex("pages_doc_page_uq").on(t.documentId, t.pageNumber)],
);

export const extractedFields = sqliteTable(
  "extracted_document_fields",
  {
    id: id(),
    documentId: text("document_id")
      .notNull()
      .references(() => documents.id, { onDelete: "cascade" }),
    field: text("field").notNull(),
    value: text("value").notNull(),
    page: integer("page"),
    evidence: text("evidence").notNull().default(""),
    source: text("source").notNull(), // parser | ai_live | ai_mock
  },
  (t) => [index("fields_doc_idx").on(t.documentId)],
);

export const validationRuns = sqliteTable(
  "validation_runs",
  {
    id: id(),
    applicationId: text("application_id")
      .notNull()
      .references(() => applications.id, { onDelete: "cascade" }),
    rulesetVersionId: text("ruleset_version_id")
      .notNull()
      .references(() => rulesetVersions.id),
    rulesetVersion: text("ruleset_version_label").notNull(),
    triggeredById: text("triggered_by_id"),
    status: text("status").notNull(), // COMPLETED | FAILED
    aiMode: text("ai_mode").notNull(), // LIVE | DEMO | DEGRADED
    aiProvider: text("ai_provider").notNull(),
    aiModel: text("ai_model").notNull().default(""),
    summary: text("summary").notNull().default(""),
    summarySource: text("summary_source").notNull().default(""),
    recommendations: text("recommendations").notNull().default("[]"),
    correlationId: text("correlation_id").notNull(),
    findingCount: integer("finding_count").notNull().default(0),
    criticalCount: integer("critical_count").notNull().default(0),
    durationMs: integer("duration_ms").notNull().default(0),
    startedAt: createdAt(),
    finishedAt: ts("finished_at"),
  },
  (t) => [index("runs_app_idx").on(t.applicationId)],
);

export const findings = sqliteTable(
  "validation_findings",
  {
    id: id(),
    refNo: text("ref_no").notNull().unique(),
    runId: text("run_id")
      .notNull()
      .references(() => validationRuns.id, { onDelete: "cascade" }),
    applicationId: text("application_id")
      .notNull()
      .references(() => applications.id, { onDelete: "cascade" }),
    ruleId: text("rule_id"),
    ruleCode: text("rule_code").notNull(),
    category: text("category").notNull(),
    severity: text("severity").notNull(),
    result: text("result").notNull(),
    documentId: text("document_id"),
    field: text("field"),
    page: integer("page"),
    actualValue: text("actual_value").notNull().default(""),
    expectedValue: text("expected_value").notNull().default(""),
    explanation: text("explanation").notNull(),
    recommendedAction: text("recommended_action").notNull(),
    evidence: text("evidence").notNull().default(""),
    humanReviewRequired: integer("human_review_required", { mode: "boolean" }).notNull().default(true),
    source: text("source").notNull(), // deterministic | ai_live | ai_mock
    aiExplanation: text("ai_explanation").notNull().default(""),
    aiExplanationSource: text("ai_explanation_source").notNull().default(""),
    reviewStatus: text("review_status").notNull().default("OPEN"),
    reviewedById: text("reviewed_by_id"),
    reviewedAt: ts("reviewed_at"),
    reviewReason: text("review_reason").notNull().default(""),
    createdAt: createdAt(),
  },
  (t) => [index("findings_app_idx").on(t.applicationId), index("findings_run_idx").on(t.runId)],
);

export const reviewObservations = sqliteTable(
  "review_observations",
  {
    id: id(),
    applicationId: text("application_id")
      .notNull()
      .references(() => applications.id, { onDelete: "cascade" }),
    findingId: text("finding_id"),
    reviewerId: text("reviewer_id")
      .notNull()
      .references(() => users.id),
    action: text("action").notNull(),
    reason: text("reason").notNull(),
    createdAt: createdAt(),
  },
  (t) => [index("obs_app_idx").on(t.applicationId)],
);

export const aiRecords = sqliteTable(
  "ai_analysis_records",
  {
    id: id(),
    applicationId: text("application_id"),
    runId: text("run_id"),
    documentId: text("document_id"),
    task: text("task").notNull(), // document_analysis | findings_summary | health_check
    provider: text("provider").notNull(),
    model: text("model").notNull().default(""),
    promptVersion: text("prompt_version").notNull(),
    cacheKey: text("cache_key").notNull(),
    status: text("status").notNull(), // success | mock | failed_validation | error | cache_hit
    output: text("output").notNull().default(""),
    errorCode: text("error_code").notNull().default(""),
    latencyMs: integer("latency_ms").notNull().default(0),
    inputTokens: integer("input_tokens"),
    outputTokens: integer("output_tokens"),
    correlationId: text("correlation_id").notNull().default(""),
    createdAt: createdAt(),
  },
  (t) => [index("ai_cache_idx").on(t.cacheKey), index("ai_created_idx").on(t.createdAt)],
);

export const verificationSources = sqliteTable("verification_sources", {
  id: id(),
  code: text("code").notNull().unique(),
  name: text("name").notNull(),
  sourceType: text("source_type").notNull(), // DEMO_SOURCE | MANUAL | NOT_CONFIGURED
  description: text("description").notNull(),
  enabled: integer("enabled", { mode: "boolean" }).notNull().default(true),
  createdAt: createdAt(),
});

export const documentVerifications = sqliteTable(
  "document_verifications",
  {
    id: id(),
    documentId: text("document_id")
      .notNull()
      .references(() => documents.id, { onDelete: "cascade" }),
    sourceCode: text("source_code").notNull(),
    sourceName: text("source_name").notNull(),
    sourceType: text("source_type").notNull(),
    method: text("method").notNull(),
    result: text("result").notNull(),
    returnedFields: text("returned_fields").notNull().default("{}"),
    evidenceRef: text("evidence_ref").notNull().default(""),
    initiatedBy: text("initiated_by").notNull(),
    notes: text("notes").notNull().default(""),
    createdAt: createdAt(),
  },
  (t) => [index("verif_doc_idx").on(t.documentId)],
);

export const alerts = sqliteTable(
  "alerts",
  {
    id: id(),
    refNo: text("ref_no").notNull().unique(),
    applicationId: text("application_id")
      .notNull()
      .references(() => applications.id, { onDelete: "cascade" }),
    findingId: text("finding_id"),
    severity: text("severity").notNull(),
    category: text("category").notNull(),
    title: text("title").notNull(),
    whyItMatters: text("why_it_matters").notNull(),
    recommendedAction: text("recommended_action").notNull(),
    responsibleParty: text("responsible_party").notNull(), // INSTITUTION | OFFICER
    status: text("status").notNull().default("OPEN"), // OPEN | ACKNOWLEDGED | ESCALATED | RESOLVED
    assigneeId: text("assignee_id").references(() => users.id),
    createdAt: createdAt(),
    updatedAt: integer("updated_at", { mode: "timestamp_ms" })
      .notNull()
      .$defaultFn(() => new Date()),
  },
  (t) => [index("alerts_app_idx").on(t.applicationId), index("alerts_status_idx").on(t.status)],
);

export const alertEvents = sqliteTable("alert_events", {
  id: id(),
  alertId: text("alert_id")
    .notNull()
    .references(() => alerts.id, { onDelete: "cascade" }),
  actorId: text("actor_id"),
  actorLabel: text("actor_label").notNull(),
  action: text("action").notNull(),
  comment: text("comment").notNull().default(""),
  createdAt: createdAt(),
});

export const rectificationRequests = sqliteTable("rectification_requests", {
  id: id(),
  applicationId: text("application_id")
    .notNull()
    .references(() => applications.id, { onDelete: "cascade" }),
  requestedById: text("requested_by_id")
    .notNull()
    .references(() => users.id),
  message: text("message").notNull(),
  status: text("status").notNull().default("OPEN"), // OPEN | RESPONDED | CLOSED
  response: text("response").notNull().default(""),
  respondedAt: ts("responded_at"),
  createdAt: createdAt(),
});

export const payments = sqliteTable("payment_records", {
  id: id(),
  transactionRef: text("transaction_ref").notNull().unique(),
  institutionId: text("institution_id")
    .notNull()
    .references(() => institutions.id),
  amount: integer("amount").notNull(),
  paidAt: integer("paid_at", { mode: "timestamp_ms" }).notNull(),
  ledgerStatus: text("ledger_status").notNull(), // SUCCESS | FAILED | PENDING
  source: text("source").notNull().default("SYNTHETIC_LEDGER"),
  createdAt: createdAt(),
});

export const officialDecisions = sqliteTable("official_decisions", {
  id: id(),
  applicationId: text("application_id")
    .notNull()
    .references(() => applications.id, { onDelete: "cascade" }),
  decision: text("decision").notNull(), // APPROVED | REJECTED
  decidedById: text("decided_by_id")
    .notNull()
    .references(() => users.id),
  reason: text("reason").notNull(),
  createdAt: createdAt(),
});

export const certificateRecords = sqliteTable("certificate_records", {
  id: id(),
  applicationId: text("application_id")
    .notNull()
    .references(() => applications.id, { onDelete: "cascade" }),
  certificateRef: text("certificate_ref").notNull().unique(),
  issuingAuthority: text("issuing_authority").notNull(),
  recordedById: text("recorded_by_id")
    .notNull()
    .references(() => users.id),
  isDemo: integer("is_demo", { mode: "boolean" }).notNull().default(true),
  createdAt: createdAt(),
});

export const auditLogs = sqliteTable(
  "audit_logs",
  {
    id: id(),
    createdAt: createdAt(),
    actorId: text("actor_id"),
    actorLabel: text("actor_label").notNull(),
    action: text("action").notNull(),
    entityType: text("entity_type").notNull(),
    entityId: text("entity_id").notNull().default(""),
    entityRef: text("entity_ref").notNull().default(""),
    previousState: text("previous_state").notNull().default(""),
    newState: text("new_state").notNull().default(""),
    reason: text("reason").notNull().default(""),
    correlationId: text("correlation_id").notNull().default(""),
    metadata: text("metadata").notNull().default("{}"),
  },
  (t) => [index("audit_created_idx").on(t.createdAt), index("audit_entity_idx").on(t.entityType, t.entityId)],
);

// Append-only enforcement at the database level (see migration 0001): UPDATE and DELETE
// on audit_logs raise an error, so even application code cannot rewrite history.

export type User = typeof users.$inferSelect;
export type Institution = typeof institutions.$inferSelect;
export type Application = typeof applications.$inferSelect;
export type UploadedDocument = typeof documents.$inferSelect;
export type Finding = typeof findings.$inferSelect;
export type ValidationRule = typeof validationRules.$inferSelect;
export type Alert = typeof alerts.$inferSelect;

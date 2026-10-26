// Orchestrates a validation run:
//   deterministic rules FIRST → AI (or labelled demo output) to explain/extract → persist
//   run + ruleset version + findings + AI records → alerts → review priority → status.
import { and, eq, inArray, ne } from "drizzle-orm";
import { getDb, schema } from "../db";
import { audit, newCorrelationId } from "../audit";
import { assertCan, assertViewApplication, type Actor } from "../authz";
import { AppError } from "../errors";
import { computePriority, runRules, type EngineDocument, type EngineRule, type FindingDraft } from "../validation/engine";
import { analyzeDocument, summarizeFindings, type AiCallContext } from "../ai/service";
import { resolveAiConfig } from "../ai/config";
import type { ParsedField } from "../extraction/fields";
import type { Severity } from "@/lib/constants";
import { INSTITUTION_EDITABLE } from "@/lib/constants";
import { loadApplication, setStatus, shortCode } from "./common";

export interface RunOptions {
  /** test seam: override AI completion + config */
  ai?: Pick<AiCallContext, "complete" | "config">;
  today?: Date;
}

const ALERT_WHY: Record<string, string> = {
  REQUIRED_DOCUMENT: "Scrutiny cannot proceed without the documents the category checklist requires.",
  DOCUMENT_EXPIRY: "An expired certificate may mean the underlying approval or safety condition is no longer valid.",
  FIELD_MATCH: "Identifier/name mismatches can indicate a wrong file, a typo, or a document belonging to another entity.",
  INSTITUTION_RECORD_MATCH: "The application must match the institution's authorized record.",
  DUPLICATE_FILE: "Duplicate files can hide a missing document or indicate re-used evidence.",
  PAYMENT_MATCH: "Unreconciled fees block processing; this is tracked separately from document authenticity.",
  DATE_CONSISTENCY: "Impossible date combinations are a potential anomaly that needs human verification.",
  EXTRACTION_QUALITY: "Automated checks are incomplete for unreadable documents.",
  INTAKE_CONSISTENCY: "Intake figures drive capacity requirements for the category.",
  AI_OBSERVATION: "An AI-assisted observation flagged a potential inconsistency for human review.",
};

export async function runValidation(actor: Actor, applicationId: string, opts: RunOptions = {}) {
  assertCan(actor, "application.validate");
  const db = getDb();
  const app = await loadApplication(applicationId);
  assertViewApplication(actor, app);
  if (actor.role === "INSTITUTION" && !(INSTITUTION_EDITABLE as string[]).includes(app.status)) {
    throw new AppError("This application is with AICTE scrutiny; validation can only be re-run by the reviewing officer.");
  }
  const t0 = Date.now();
  const correlationId = newCorrelationId();
  const today = opts.today ?? new Date();

  const [ruleset] = await db.select().from(schema.rulesetVersions).where(eq(schema.rulesetVersions.active, true)).limit(1);
  if (!ruleset) throw new AppError("No active ruleset is configured. An administrator must activate one.");
  const rules = await db
    .select()
    .from(schema.validationRules)
    .where(and(eq(schema.validationRules.rulesetVersionId, ruleset.id), eq(schema.validationRules.active, true)));
  const [category] = await db.select().from(schema.categories).where(eq(schema.categories.id, app.categoryId));
  const [institution] = await db.select().from(schema.institutions).where(eq(schema.institutions.id, app.institutionId));
  const checklist = await db
    .select({ docTypeCode: schema.checklistItems.docTypeCode, mandatory: schema.checklistItems.mandatory, label: schema.documentTypes.label })
    .from(schema.checklistItems)
    .innerJoin(schema.documentTypes, eq(schema.documentTypes.code, schema.checklistItems.docTypeCode))
    .where(eq(schema.checklistItems.categoryId, app.categoryId));
  const docTypes = await db.select().from(schema.documentTypes);
  const docs = await db
    .select()
    .from(schema.documents)
    .where(and(eq(schema.documents.applicationId, app.id), eq(schema.documents.status, "ACTIVE")));
  const docIds = docs.map((d) => d.id);
  const pages = docIds.length ? await db.select().from(schema.documentPages).where(inArray(schema.documentPages.documentId, docIds)) : [];
  const parserFields = docIds.length
    ? await db.select().from(schema.extractedFields).where(and(inArray(schema.extractedFields.documentId, docIds), eq(schema.extractedFields.source, "parser")))
    : [];

  // Hashes used by OTHER institutions (only existence is used — no details leak).
  const hashes = docs.map((d) => d.sha256);
  const elsewhere = hashes.length
    ? await db
        .select({ sha256: schema.documents.sha256 })
        .from(schema.documents)
        .innerJoin(schema.applications, eq(schema.applications.id, schema.documents.applicationId))
        .where(and(inArray(schema.documents.sha256, hashes), ne(schema.applications.institutionId, app.institutionId), ne(schema.documents.status, "REMOVED")))
    : [];

  const [ledger] = app.paymentReference
    ? await db
        .select({ amount: schema.payments.amount, ledgerStatus: schema.payments.ledgerStatus, refId: schema.institutions.refId })
        .from(schema.payments)
        .innerJoin(schema.institutions, eq(schema.institutions.id, schema.payments.institutionId))
        .where(eq(schema.payments.transactionRef, app.paymentReference.trim()))
        .limit(1)
    : [];

  const engineDocs: EngineDocument[] = docs.map((d) => {
    const dt = docTypes.find((t) => t.code === d.docTypeCode);
    return {
      id: d.id,
      docTypeCode: d.docTypeCode,
      docTypeLabel: dt?.label ?? d.docTypeCode,
      hasExpiry: dt?.hasExpiry ?? false,
      originalName: d.originalName,
      sha256: d.sha256,
      extractionStatus: d.extractionStatus,
      pages: pages.filter((p) => p.documentId === d.id).sort((a, b) => a.pageNumber - b.pageNumber),
      parsed: parserFields.filter((f) => f.documentId === d.id).map((f) => ({ field: f.field, value: f.value, page: f.page ?? 1, evidence: f.evidence })),
    };
  });

  const engineRules: EngineRule[] = rules.map((r) => ({
    id: r.id,
    ruleCode: r.ruleCode,
    type: r.type,
    title: r.title,
    severity: r.severity as Severity,
    params: JSON.parse(r.params || "{}"),
    categories: r.categories,
  }));

  // 1) Deterministic checks.
  const drafts: FindingDraft[] = runRules({
    today,
    categoryCode: category.code,
    requiresPayment: category.requiresPayment,
    application: app,
    institution: { refId: institution.refId, name: institution.name },
    checklist,
    documents: engineDocs,
    hashesUsedElsewhere: new Set(elsewhere.map((e) => e.sha256)),
    payment: ledger ? { found: true, amount: ledger.amount, institutionRefId: ledger.refId, ledgerStatus: ledger.ledgerStatus } : { found: false },
    rules: engineRules,
  });

  // Create the run row first so AI records can reference it.
  const cfg = opts.ai?.config ?? resolveAiConfig();
  const [run] = await db
    .insert(schema.validationRuns)
    .values({
      applicationId: app.id,
      rulesetVersionId: ruleset.id,
      rulesetVersion: ruleset.version,
      triggeredById: actor.id,
      status: "RUNNING",
      aiMode: cfg.configured ? "LIVE" : "DEMO",
      aiProvider: cfg.provider,
      aiModel: cfg.model,
      correlationId,
    })
    .returning();
  try {
    const ctxBase: AiCallContext = { applicationId: app.id, runId: run.id, correlationId, ...opts.ai };

    // 2) AI document analysis (live, or labelled demo output) — supplements, never replaces, rules.
    const aiObsRule = engineRules.find((r) => r.type === "AI_OBSERVATION");
    let degraded = false;
    const appFacts: Record<string, string> = {
      institution_name: app.declaredInstitutionName,
      institution_id: app.declaredInstitutionRef,
      academic_year: app.academicYear,
      programme: app.programmeName,
      payment_reference: app.paymentReference,
      category: category.name,
    };
    for (const d of engineDocs) {
      const outcome = await analyzeDocument(
        {
          documentSha256: d.sha256,
          rulesetVersion: ruleset.version,
          declaredDocType: d.docTypeCode,
          declaredDocLabel: d.docTypeLabel,
          application: appFacts,
          pages: d.pages.map((p) => ({ pageNumber: p.pageNumber, text: p.text })),
          parsed: d.parsed as ParsedField[],
        },
        { ...ctxBase, documentId: d.id },
      );
      if (outcome.errorCode) degraded = true;
      // Replace previous AI-extracted fields for this document.
      await db.delete(schema.extractedFields).where(and(eq(schema.extractedFields.documentId, d.id), ne(schema.extractedFields.source, "parser")));
      if (outcome.source === "ai_live" && outcome.output.extracted_fields.length > 0) {
        await db.insert(schema.extractedFields).values(
          outcome.output.extracted_fields.map((f) => ({ documentId: d.id, field: f.field, value: f.value, page: f.page || null, evidence: f.evidence, source: "ai_live" })),
        );
      }
      if (aiObsRule) {
        for (const o of outcome.output.observations) {
          drafts.push({
            ruleId: aiObsRule.id,
            ruleCode: aiObsRule.ruleCode,
            ruleType: "AI_OBSERVATION",
            category: aiObsRule.title,
            severity: aiObsRule.severity, // severity comes from the configured rule, not the model
            result: "MANUAL_REVIEW_REQUIRED",
            documentId: d.id,
            field: o.category,
            page: null,
            actualValue: o.evidence,
            expectedValue: "Consistent with application data",
            explanation: `Potential anomaly — human verification required. ${o.description}`,
            recommendedAction: o.recommended_action,
            evidence: o.evidence,
            humanReviewRequired: true,
            source: outcome.source,
          } as FindingDraft & { source: string });
        }
      }
    }

    // 3) Persist findings with reference numbers.
    const rows = drafts.map((f) => ({
      refNo: `FND-${shortCode(7)}`,
      runId: run.id,
      applicationId: app.id,
      ruleId: f.ruleId,
      ruleCode: f.ruleCode,
      category: f.category,
      severity: f.severity,
      result: f.result,
      documentId: f.documentId,
      field: f.field,
      page: f.page,
      actualValue: f.actualValue,
      expectedValue: f.expectedValue,
      explanation: f.explanation,
      recommendedAction: f.recommendedAction,
      evidence: f.evidence,
      humanReviewRequired: f.humanReviewRequired,
      source: (f as FindingDraft & { source?: string }).source ?? "deterministic",
      _type: f.ruleType,
    }));

    // 4) AI summary + plain-language explanations of each finding.
    const summary = await summarizeFindings(
      {
        applicationRef: app.refNo,
        category: category.name,
        findings: rows.map((r) => ({
          ref: r.refNo,
          type: r._type,
          severity: r.severity,
          result: r.result,
          field: r.field ?? "",
          expected: r.expectedValue,
          actual: r.actualValue,
          explanation: r.explanation,
        })),
      },
      ctxBase,
    );
    if (summary.errorCode) degraded = true;
    const explanationByRef = new Map(summary.output.finding_explanations.map((e) => [e.finding_ref, e.explanation]));

    if (rows.length > 0) {
      await db.insert(schema.findings).values(
        rows.map(({ _type, ...r }) => ({
          ...r,
          aiExplanation: explanationByRef.get(r.refNo) ?? "",
          aiExplanationSource: explanationByRef.has(r.refNo) ? summary.source : "",
        })),
      );
    }

    const criticalCount = rows.filter((r) => r.severity === "CRITICAL").length;
    const durationMs = Date.now() - t0;
    const aiMode = !cfg.configured ? "DEMO" : degraded ? "DEGRADED" : "LIVE";
    await db
      .update(schema.validationRuns)
      .set({
        status: "COMPLETED",
        aiMode,
        summary: summary.output.summary,
        summarySource: summary.source,
        recommendations: JSON.stringify(summary.output.reviewer_recommendations),
        findingCount: rows.length,
        criticalCount,
        durationMs,
        finishedAt: new Date(),
      })
      .where(eq(schema.validationRuns.id, run.id));

    // 5) Alerts: supersede machine alerts from previous runs, raise new ones for CRITICAL/HIGH.
    const oldAlerts = await db
      .select()
      .from(schema.alerts)
      .where(and(eq(schema.alerts.applicationId, app.id), ne(schema.alerts.status, "RESOLVED")));
    for (const a of oldAlerts) {
      await db.update(schema.alerts).set({ status: "RESOLVED", updatedAt: new Date() }).where(eq(schema.alerts.id, a.id));
      await db.insert(schema.alertEvents).values({ alertId: a.id, actorId: null, actorLabel: "system", action: "SUPERSEDED", comment: `Superseded by validation run ${run.id.slice(0, 8)}` });
    }
    const inserted = rows.length ? await db.select().from(schema.findings).where(eq(schema.findings.runId, run.id)) : [];
    for (const f of inserted.filter((x) => x.severity === "CRITICAL" || x.severity === "HIGH")) {
      const type = rows.find((r) => r.refNo === f.refNo)?._type ?? "";
      const institutionFixable = ["REQUIRED_DOCUMENT", "REQUIRED_FIELD", "DOCUMENT_EXPIRY", "PAYMENT_MATCH", "INTAKE_CONSISTENCY", "INSTITUTION_RECORD_MATCH"].includes(type);
      const [alert] = await db
        .insert(schema.alerts)
        .values({
          refNo: `ALT-${shortCode(6)}`,
          applicationId: app.id,
          findingId: f.id,
          severity: f.severity,
          category: f.category,
          title: f.explanation.slice(0, 160),
          whyItMatters: ALERT_WHY[type] ?? "Requires human review under the configured ruleset.",
          recommendedAction: f.recommendedAction,
          responsibleParty: institutionFixable ? "INSTITUTION" : "OFFICER",
        })
        .returning();
      await db.insert(schema.alertEvents).values({ alertId: alert.id, actorId: null, actorLabel: "system", action: "CREATED", comment: `Raised by rule ${f.ruleCode}` });
    }

    // 6) Review priority (documented factors, not a fraud probability).
    const pr = computePriority(rows.map((r) => ({ severity: r.severity, result: r.result, ruleType: r._type })));
    await db
      .update(schema.applications)
      .set({ reviewPriority: pr.level, priorityScore: pr.score, priorityFactors: JSON.stringify(pr.factors), lastValidatedAt: new Date(), updatedAt: new Date() })
      .where(eq(schema.applications.id, app.id));

    // 7) Institution-side status reflects the actual validation result (never "compliant").
    if ((INSTITUTION_EDITABLE as string[]).includes(app.status) && app.status !== "CLARIFICATION_REQUESTED") {
      const blocking = rows.some((r) => r.severity === "CRITICAL" || r.severity === "HIGH");
      await setStatus(db, app, blocking ? "RECTIFICATION_REQUIRED" : "READY_FOR_SCRUTINY", "system", `Validation run: ${rows.length} finding(s), ${criticalCount} critical`, correlationId);
    }

    await audit(db, {
      actor,
      action: "validation.run",
      entityType: "application",
      entityId: app.id,
      entityRef: app.refNo,
      newState: aiMode,
      correlationId,
      metadata: { runId: run.id, ruleset: ruleset.version, findings: rows.length, critical: criticalCount, aiProvider: cfg.provider, aiModel: cfg.model, durationMs },
    });
    if (aiMode === "DEGRADED") {
      await audit(db, { actor: "system", action: "ai.degraded", entityType: "validation_run", entityId: run.id, entityRef: app.refNo, reason: "Live AI call failed; demo output used and labelled", correlationId });
    }

  return { runId: run.id, findings: rows.length, criticalCount, aiMode, durationMs };
  } catch (err) {
    await db.update(schema.validationRuns).set({ status: "FAILED", finishedAt: new Date(), durationMs: Date.now() - t0 }).where(eq(schema.validationRuns.id, run.id));
    await audit(db, { actor: "system", action: "validation.failed", entityType: "application", entityId: app.id, entityRef: app.refNo, reason: err instanceof Error ? err.message.slice(0, 200) : "unknown", correlationId });
    throw err;
  }
}

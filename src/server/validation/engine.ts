// Deterministic rule engine. PURE: no DB, no AI, no clock (today is passed in).
// Every finding carries the rule that produced it, the evidence, expected vs actual,
// and a result that distinguishes "not satisfied" from "unable to determine".
import type { FindingResult, Severity } from "@/lib/constants";
import { nameSimilarity, normaliseRef, parseDate, type ParsedField } from "../extraction/fields";

export interface EngineRule {
  id: string;
  ruleCode: string;
  type: string;
  title: string;
  severity: Severity;
  params: Record<string, unknown>;
  categories: string; // "*" or comma list of category codes
}

export interface EngineDocument {
  id: string;
  docTypeCode: string;
  docTypeLabel: string;
  hasExpiry: boolean;
  originalName: string;
  sha256: string;
  extractionStatus: string;
  pages: { pageNumber: number; text: string; method: string; ocrConfidence: number | null }[];
  parsed: ParsedField[];
}

export interface EngineInput {
  today: Date;
  categoryCode: string;
  requiresPayment: boolean;
  application: {
    declaredInstitutionName: string;
    declaredInstitutionRef: string;
    academicYear: string;
    programmeName: string;
    approvedIntake: number | null;
    proposedIntake: number | null;
    contactName: string;
    contactEmail: string;
    paymentReference: string;
    paymentAmount: number | null;
    [k: string]: unknown;
  };
  institution: { refId: string; name: string };
  checklist: { docTypeCode: string; label: string; mandatory: boolean }[];
  documents: EngineDocument[];
  /** sha256 values that appear in OTHER institutions' applications (no details exposed). */
  hashesUsedElsewhere: Set<string>;
  payment: { found: false } | { found: true; amount: number; institutionRefId: string; ledgerStatus: string };
  rules: EngineRule[];
}

export interface FindingDraft {
  ruleId: string;
  ruleCode: string;
  ruleType: string;
  category: string;
  severity: Severity;
  result: FindingResult;
  documentId: string | null;
  field: string | null;
  page: number | null;
  actualValue: string;
  expectedValue: string;
  explanation: string;
  recommendedAction: string;
  evidence: string;
  humanReviewRequired: boolean;
}

const FIELD_LABELS: Record<string, string> = {
  declaredInstitutionName: "Institution name",
  declaredInstitutionRef: "Institution reference ID",
  academicYear: "Academic year",
  programmeName: "Programme / course details",
  contactName: "Authorized contact name",
  contactEmail: "Authorized contact email",
  paymentReference: "Payment / transaction reference",
  approvedIntake: "Approved intake",
  proposedIntake: "Proposed intake",
  previousApprovalRef: "Previous approval / EoA reference",
  address: "Institution address",
};

function applies(rule: EngineRule, categoryCode: string): boolean {
  if (rule.categories.trim() === "*" || rule.categories.trim() === "") return true;
  return rule.categories
    .split(",")
    .map((s) => s.trim())
    .includes(categoryCode);
}

function field(doc: EngineDocument, name: string): ParsedField | undefined {
  return doc.parsed.find((f) => f.field === name);
}

function fmt(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export function runRules(input: EngineInput): FindingDraft[] {
  const out: FindingDraft[] = [];
  const add = (rule: EngineRule, f: Omit<FindingDraft, "ruleId" | "ruleCode" | "ruleType" | "category" | "severity"> & { severity?: Severity }) =>
    out.push({
      ruleId: rule.id,
      ruleCode: rule.ruleCode,
      ruleType: rule.type,
      category: rule.title,
      severity: f.severity ?? rule.severity,
      ...f,
    });

  for (const rule of input.rules) {
    if (!applies(rule, input.categoryCode)) continue; // "Not applicable" → no finding
    switch (rule.type) {
      case "REQUIRED_FIELD": {
        const fields = (rule.params.fields as string[] | undefined) ?? [];
        for (const f of fields) {
          const v = input.application[f];
          if (v === null || v === undefined || (typeof v === "string" && v.trim() === "")) {
            add(rule, {
              result: "INFORMATION_MISSING",
              documentId: null,
              field: f,
              page: null,
              actualValue: "(empty)",
              expectedValue: `${FIELD_LABELS[f] ?? f} provided`,
              explanation: `Required field "${FIELD_LABELS[f] ?? f}" is empty.`,
              recommendedAction: `Fill in "${FIELD_LABELS[f] ?? f}" in the application form.`,
              evidence: "Application form",
              humanReviewRequired: false,
            });
          }
        }
        break;
      }

      case "REQUIRED_DOCUMENT": {
        for (const item of input.checklist.filter((c) => c.mandatory)) {
          const present = input.documents.some((d) => d.docTypeCode === item.docTypeCode);
          if (!present) {
            add(rule, {
              result: "INFORMATION_MISSING",
              documentId: null,
              field: item.docTypeCode,
              page: null,
              actualValue: "Not uploaded",
              expectedValue: item.label,
              explanation: `Mandatory document "${item.label}" is missing for this application category (per the configured checklist).`,
              recommendedAction: `Upload "${item.label}", or explain in a clarification response why it does not apply.`,
              evidence: "Category checklist vs uploaded documents",
              humanReviewRequired: false,
            });
          }
        }
        break;
      }

      case "DOCUMENT_EXPIRY": {
        for (const doc of input.documents.filter((d) => d.hasExpiry)) {
          const exp = field(doc, "expiry_date");
          const parsed = exp ? parseDate(exp.value) : null;
          if (!exp || !parsed) {
            add(rule, {
              severity: (rule.params.undeterminedSeverity as Severity) ?? "LOW",
              result: "UNABLE_TO_DETERMINE",
              documentId: doc.id,
              field: "expiry_date",
              page: exp?.page ?? null,
              actualValue: exp ? `Unreadable date "${exp.value}"` : "No expiry/validity date found",
              expectedValue: "A readable validity date in the future",
              explanation: `Could not determine the validity of "${doc.docTypeLabel}". This is not proof of expiry.`,
              recommendedAction: "Reviewer to check the validity date manually on the original document.",
              evidence: exp?.evidence ?? "Extracted text contained no recognisable validity date",
              humanReviewRequired: true,
            });
          } else if (parsed.getTime() < input.today.getTime()) {
            add(rule, {
              result: "NOT_SATISFIED",
              documentId: doc.id,
              field: "expiry_date",
              page: exp.page,
              actualValue: fmt(parsed),
              expectedValue: `On or after ${fmt(input.today)}`,
              explanation: `"${doc.docTypeLabel}" appears to have expired on ${fmt(parsed)}.`,
              recommendedAction: "Upload a currently valid certificate, or request manual verification.",
              evidence: exp.evidence,
              humanReviewRequired: true,
            });
          }
        }
        break;
      }

      case "DATE_CONSISTENCY": {
        for (const doc of input.documents) {
          const iss = field(doc, "issue_date");
          const exp = field(doc, "expiry_date");
          const di = iss ? parseDate(iss.value) : null;
          const de = exp ? parseDate(exp.value) : null;
          if (di && de && di.getTime() > de.getTime()) {
            add(rule, {
              result: "NOT_SATISFIED",
              documentId: doc.id,
              field: "issue_date",
              page: iss!.page,
              actualValue: `Issued ${fmt(di)}, valid until ${fmt(de)}`,
              expectedValue: "Issue date before expiry date",
              explanation: `"${doc.docTypeLabel}" has an issue date after its expiry date.`,
              recommendedAction: "Potential anomaly — human verification required against the original document.",
              evidence: `${iss!.evidence} | ${exp!.evidence}`,
              humanReviewRequired: true,
            });
          } else if (di && di.getTime() > input.today.getTime() + 86_400_000) {
            add(rule, {
              severity: (rule.params.futureIssueSeverity as Severity) ?? rule.severity,
              result: "NOT_SATISFIED",
              documentId: doc.id,
              field: "issue_date",
              page: iss!.page,
              actualValue: fmt(di),
              expectedValue: `On or before ${fmt(input.today)}`,
              explanation: `"${doc.docTypeLabel}" carries an issue date in the future.`,
              recommendedAction: "Potential anomaly — human verification required.",
              evidence: iss!.evidence,
              humanReviewRequired: true,
            });
          }
        }
        break;
      }

      case "FIELD_MATCH": {
        const which = (rule.params.field as string) ?? "institution_name";
        const minSim = Number(rule.params.minSimilarity ?? 0.8);
        for (const doc of input.documents) {
          const f = field(doc, which);
          if (!f) continue; // absence of the field is not evidence of a mismatch
          if (which === "institution_name") {
            const sim = nameSimilarity(f.value, input.application.declaredInstitutionName);
            if (sim < minSim) {
              add(rule, {
                result: "NOT_SATISFIED",
                documentId: doc.id,
                field: "institution_name",
                page: f.page,
                actualValue: f.value,
                expectedValue: input.application.declaredInstitutionName,
                explanation: `Institution name on "${doc.docTypeLabel}" differs from the application (token similarity ${sim.toFixed(2)} < ${minSim}).`,
                recommendedAction: "Request clarification or verify against an authorized institutional record.",
                evidence: f.evidence,
                humanReviewRequired: true,
              });
            }
          } else if (which === "institution_id") {
            if (normaliseRef(f.value) !== normaliseRef(input.application.declaredInstitutionRef)) {
              add(rule, {
                result: "NOT_SATISFIED",
                documentId: doc.id,
                field: "institution_id",
                page: f.page,
                actualValue: f.value,
                expectedValue: input.application.declaredInstitutionRef,
                explanation: `Institution ID on "${doc.docTypeLabel}" does not match the application.`,
                recommendedAction: "Check whether the document belongs to this institution; request clarification.",
                evidence: f.evidence,
                humanReviewRequired: true,
              });
            }
          }
        }
        break;
      }

      case "INSTITUTION_RECORD_MATCH": {
        if (normaliseRef(input.application.declaredInstitutionRef) !== normaliseRef(input.institution.refId)) {
          add(rule, {
            result: "NOT_SATISFIED",
            documentId: null,
            field: "declaredInstitutionRef",
            page: null,
            actualValue: input.application.declaredInstitutionRef,
            expectedValue: input.institution.refId,
            explanation: "The institution reference in the application does not match the institution record in the demo database.",
            recommendedAction: "Correct the institution reference ID.",
            evidence: "Application form vs institution record (synthetic)",
            humanReviewRequired: false,
          });
        }
        const sim = nameSimilarity(input.application.declaredInstitutionName, input.institution.name);
        if (sim < 0.8) {
          add(rule, {
            result: "NOT_SATISFIED",
            documentId: null,
            field: "declaredInstitutionName",
            page: null,
            actualValue: input.application.declaredInstitutionName,
            expectedValue: input.institution.name,
            explanation: "The institution name in the application differs from the institution record in the demo database.",
            recommendedAction: "Correct the institution name or request a record update.",
            evidence: "Application form vs institution record (synthetic)",
            humanReviewRequired: true,
          });
        }
        break;
      }

      case "DUPLICATE_FILE": {
        const byHash = new Map<string, EngineDocument[]>();
        for (const d of input.documents) byHash.set(d.sha256, [...(byHash.get(d.sha256) ?? []), d]);
        for (const [hash, docs] of byHash) {
          if (docs.length > 1) {
            for (const d of docs.slice(1)) {
              add(rule, {
                result: "NOT_SATISFIED",
                documentId: d.id,
                field: "sha256",
                page: null,
                actualValue: `Identical to "${docs[0].originalName}" (${docs[0].docTypeLabel})`,
                expectedValue: "Each uploaded file distinct",
                explanation: `The same file (SHA-256 ${hash.slice(0, 12)}…) was uploaded more than once in this application.`,
                recommendedAction: "Check whether the duplicate upload was intentional; replace it with the correct document.",
                evidence: `SHA-256 ${hash}`,
                humanReviewRequired: true,
              });
            }
          }
          if (input.hashesUsedElsewhere.has(hash)) {
            add(rule, {
              severity: (rule.params.crossInstitutionSeverity as Severity) ?? "HIGH",
              result: "MANUAL_REVIEW_REQUIRED",
              documentId: docs[0].id,
              field: "sha256",
              page: null,
              actualValue: "Byte-identical file found in another institution's application",
              expectedValue: "Document unique to this institution",
              explanation: "An identical file was submitted by a different institution. Potential anomaly — human verification required.",
              recommendedAction: "Officer to compare both submissions; do not draw conclusions without verification.",
              evidence: `SHA-256 ${hash}`,
              humanReviewRequired: true,
            });
          }
        }
        break;
      }

      case "EXTRACTION_QUALITY": {
        const minConf = Number(rule.params.minOcrConfidence ?? 60);
        const skip = (rule.params.skipDocTypes as string[] | undefined) ?? [];
        for (const doc of input.documents.filter((d) => !skip.includes(d.docTypeCode))) {
          const lowConf = doc.pages.filter((p) => p.method === "ocr" && (p.ocrConfidence ?? 0) < minConf);
          if (doc.extractionStatus === "FAILED" || doc.extractionStatus === "PARTIAL" || lowConf.length > 0) {
            add(rule, {
              result: "UNABLE_TO_DETERMINE",
              documentId: doc.id,
              field: null,
              page: lowConf[0]?.pageNumber ?? null,
              actualValue:
                doc.extractionStatus === "FAILED"
                  ? "No text extracted"
                  : lowConf.length > 0
                    ? `OCR engine confidence ${Math.round(lowConf[0].ocrConfidence ?? 0)} (< ${minConf}) — engine score, not a calibrated probability`
                    : "Some pages unreadable",
              expectedValue: "Readable text on all pages",
              explanation: `Automated checks on "${doc.docTypeLabel}" are incomplete because text extraction was ${doc.extractionStatus === "FAILED" ? "unsuccessful" : "partial"}.`,
              recommendedAction: "Upload a clearer scan or a text-based PDF; reviewer to read the document manually.",
              evidence: `Extraction status: ${doc.extractionStatus}`,
              humanReviewRequired: true,
            });
          }
        }
        break;
      }

      case "PAYMENT_MATCH": {
        if (!input.requiresPayment) break;
        const ref = input.application.paymentReference.trim();
        if (!ref) break; // covered by REQUIRED_FIELD
        if (!input.payment.found) {
          add(rule, {
            result: "NOT_SATISFIED",
            documentId: null,
            field: "paymentReference",
            page: null,
            actualValue: `${ref} — not found`,
            expectedValue: "Reference present in the payment ledger",
            explanation: "The payment reference was not found in the synthetic payment ledger.",
            recommendedAction: "Verify the transaction reference; upload the fee receipt.",
            evidence: "Synthetic payment ledger (demo source — not a government account)",
            humanReviewRequired: true,
          });
          break;
        }
        const p = input.payment;
        const problems: string[] = [];
        if (p.ledgerStatus !== "SUCCESS") problems.push(`ledger status ${p.ledgerStatus}`);
        if (input.application.paymentAmount !== null && p.amount !== input.application.paymentAmount)
          problems.push(`amount ₹${p.amount} in ledger vs ₹${input.application.paymentAmount} declared`);
        if (normaliseRef(p.institutionRefId) !== normaliseRef(input.institution.refId)) problems.push("payment belongs to a different institution");
        const receipt = input.documents.find((d) => d.docTypeCode === "FEE_RECEIPT");
        const rRef = receipt ? field(receipt, "transaction_reference") : undefined;
        if (rRef && normaliseRef(rRef.value) !== normaliseRef(ref)) problems.push(`receipt shows ${rRef.value}`);
        if (problems.length > 0) {
          add(rule, {
            result: "NOT_SATISFIED",
            documentId: rRef ? receipt!.id : null,
            field: "paymentReference",
            page: rRef?.page ?? null,
            actualValue: problems.join("; "),
            expectedValue: "Ledger entry SUCCESS, same amount, same institution, matching receipt",
            explanation: "Payment details could not be reconciled with the synthetic ledger.",
            recommendedAction: "Reconcile the payment; this is separate from document authentication and approval status.",
            evidence: rRef?.evidence ?? "Synthetic payment ledger",
            humanReviewRequired: true,
          });
        }
        break;
      }

      case "INTAKE_CONSISTENCY": {
        const a = input.application.approvedIntake;
        const p = input.application.proposedIntake;
        if (a === null || p === null) {
          add(rule, {
            result: "INFORMATION_MISSING",
            documentId: null,
            field: "proposedIntake",
            page: null,
            actualValue: `approved=${a ?? "—"}, proposed=${p ?? "—"}`,
            expectedValue: "Both approved and proposed intake provided",
            explanation: "Intake figures are required for this category.",
            recommendedAction: "Enter approved and proposed intake.",
            evidence: "Application form",
            humanReviewRequired: false,
          });
        } else if (p <= a) {
          add(rule, {
            result: "NOT_SATISFIED",
            documentId: null,
            field: "proposedIntake",
            page: null,
            actualValue: `proposed ${p} ≤ approved ${a}`,
            expectedValue: "Proposed intake greater than approved intake for an increase request",
            explanation: "The proposed intake does not exceed the approved intake, which is inconsistent with an intake-increase application.",
            recommendedAction: "Correct the intake figures or choose the appropriate category.",
            evidence: "Application form",
            humanReviewRequired: false,
          });
        }
        break;
      }

      case "MANUAL_VERIFICATION": {
        if (input.documents.length > 0) {
          add(rule, {
            result: "MANUAL_REVIEW_REQUIRED",
            documentId: null,
            field: null,
            page: null,
            actualValue: `${input.documents.length} document(s) uploaded`,
            expectedValue: "Signatures, seals and issuing authorities verified",
            explanation: "Signatures, seals and the original issuing authorities cannot be verified automatically by this prototype.",
            recommendedAction: "Officer to verify manually or through an authorized verification source.",
            evidence: "No authorized verification integration configured",
            humanReviewRequired: true,
          });
        }
        break;
      }

      default:
        break; // AI_OBSERVATION and unknown types are handled outside the engine
    }
  }
  return out;
}

/** Transparent, documented review-priority score (NOT a probability of fraud). */
export function computePriority(findings: { severity: string; result: string; ruleType: string; reviewStatus?: string }[]): {
  score: number;
  level: "LOW" | "MEDIUM" | "HIGH";
  factors: { factor: string; points: number }[];
} {
  const open = findings.filter((f) => !f.reviewStatus || !["DISMISSED", "MANUALLY_VERIFIED"].includes(f.reviewStatus));
  const factors: { factor: string; points: number }[] = [];
  const count = (pred: (f: (typeof open)[number]) => boolean) => open.filter(pred).length;
  const missing = count((f) => f.ruleType === "REQUIRED_DOCUMENT" || f.ruleType === "REQUIRED_FIELD");
  const expired = count((f) => f.ruleType === "DOCUMENT_EXPIRY" && f.result === "NOT_SATISFIED");
  const mismatch = count((f) => ["FIELD_MATCH", "INSTITUTION_RECORD_MATCH", "DATE_CONSISTENCY", "PAYMENT_MATCH"].includes(f.ruleType));
  const dup = count((f) => f.ruleType === "DUPLICATE_FILE");
  const high = count((f) => f.severity === "CRITICAL" || f.severity === "HIGH");
  if (high) factors.push({ factor: `${high} unresolved critical/high finding(s) × 10`, points: high * 10 });
  if (missing) factors.push({ factor: `${missing} missing mandatory item(s) × 8`, points: missing * 8 });
  if (expired) factors.push({ factor: `${expired} expired document(s) × 8`, points: expired * 8 });
  if (mismatch) factors.push({ factor: `${mismatch} unresolved mismatch(es) × 6`, points: mismatch * 6 });
  if (dup) factors.push({ factor: `${dup} duplicate file(s) × 5`, points: dup * 5 });
  const score = factors.reduce((s, f) => s + f.points, 0);
  return { score, level: score >= 40 ? "HIGH" : score >= 15 ? "MEDIUM" : "LOW", factors };
}

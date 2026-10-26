// Shared constants and labels (safe for client and server).

export const ROLES = ["INSTITUTION", "OFFICER", "ADMIN"] as const;
export type Role = (typeof ROLES)[number];
export const ROLE_LABELS: Record<Role, string> = {
  INSTITUTION: "Institution User",
  OFFICER: "AICTE Scrutiny Officer (demo)",
  ADMIN: "AICTE Administrator (demo)",
};

export const APP_STATUSES = [
  "DRAFT",
  "RECTIFICATION_REQUIRED",
  "READY_FOR_SCRUTINY",
  "SUBMITTED",
  "UNDER_REVIEW",
  "CLARIFICATION_REQUESTED",
  "PENDING_EXTERNAL_VERIFICATION",
  "INSPECTION_RECOMMENDED",
  "APPROVED",
  "REJECTED",
  "WITHDRAWN",
] as const;
export type AppStatus = (typeof APP_STATUSES)[number];

export const STATUS_LABELS: Record<AppStatus, string> = {
  DRAFT: "Draft",
  RECTIFICATION_REQUIRED: "Rectification required",
  READY_FOR_SCRUTINY: "Ready for official scrutiny",
  SUBMITTED: "Submitted",
  UNDER_REVIEW: "Under review",
  CLARIFICATION_REQUESTED: "Clarification requested",
  PENDING_EXTERNAL_VERIFICATION: "Pending external verification",
  INSPECTION_RECOMMENDED: "Inspection recommended",
  APPROVED: "Approved by authorized authority",
  REJECTED: "Rejected by authorized authority",
  WITHDRAWN: "Withdrawn",
};

export type Tone = "neutral" | "info" | "success" | "warning" | "danger" | "navy";
export const STATUS_TONE: Record<AppStatus, Tone> = {
  DRAFT: "neutral",
  RECTIFICATION_REQUIRED: "danger",
  READY_FOR_SCRUTINY: "info",
  SUBMITTED: "navy",
  UNDER_REVIEW: "warning",
  CLARIFICATION_REQUESTED: "warning",
  PENDING_EXTERNAL_VERIFICATION: "warning",
  INSPECTION_RECOMMENDED: "warning",
  APPROVED: "success",
  REJECTED: "danger",
  WITHDRAWN: "neutral",
};

/** Statuses in which the institution may still edit, upload and validate. */
export const INSTITUTION_EDITABLE: AppStatus[] = ["DRAFT", "RECTIFICATION_REQUIRED", "READY_FOR_SCRUTINY", "CLARIFICATION_REQUESTED"];
/** Statuses that appear in the official scrutiny queue. */
export const QUEUE_STATUSES: AppStatus[] = [
  "SUBMITTED",
  "UNDER_REVIEW",
  "CLARIFICATION_REQUESTED",
  "PENDING_EXTERNAL_VERIFICATION",
  "INSPECTION_RECOMMENDED",
  "APPROVED",
  "REJECTED",
];
export const FINAL_STATUSES: AppStatus[] = ["APPROVED", "REJECTED", "WITHDRAWN"];

export const SEVERITIES = ["CRITICAL", "HIGH", "MEDIUM", "LOW", "INFO"] as const;
export type Severity = (typeof SEVERITIES)[number];
export const SEVERITY_TONE: Record<Severity, Tone> = {
  CRITICAL: "danger",
  HIGH: "danger",
  MEDIUM: "warning",
  LOW: "info",
  INFO: "neutral",
};
export const SEVERITY_RANK: Record<Severity, number> = { CRITICAL: 5, HIGH: 4, MEDIUM: 3, LOW: 2, INFO: 1 };

export const FINDING_RESULTS = {
  NOT_SATISFIED: "Requirement not satisfied",
  INFORMATION_MISSING: "Information missing",
  UNABLE_TO_DETERMINE: "Unable to determine",
  MANUAL_REVIEW_REQUIRED: "Manual review required",
} as const;
export type FindingResult = keyof typeof FINDING_RESULTS;

export const REVIEW_STATUSES = {
  OPEN: "Machine-generated — not yet reviewed",
  CONFIRMED: "Confirmed deficiency (officer)",
  DISMISSED: "Dismissed (officer)",
  ADDITIONAL_EVIDENCE: "Additional evidence required",
  EXTERNAL_PENDING: "External verification pending",
  MANUALLY_VERIFIED: "Manual verification completed",
} as const;
export type ReviewStatus = keyof typeof REVIEW_STATUSES;
export const REVIEW_TONE: Record<ReviewStatus, Tone> = {
  OPEN: "neutral",
  CONFIRMED: "danger",
  DISMISSED: "success",
  ADDITIONAL_EVIDENCE: "warning",
  EXTERNAL_PENDING: "warning",
  MANUALLY_VERIFIED: "success",
};

export const FINDING_SOURCE_LABELS: Record<string, string> = {
  deterministic: "Deterministic rule",
  ai_live: "AI observation (live model)",
  ai_mock: "DEMO MODE — simulated AI output, not real analysis",
};

export const VERIFICATION_STATUSES = {
  VERIFIED_BY_SOURCE: "Verified by authorized source",
  VERIFIED_DEMO_SOURCE: "Matched synthetic demo source (not an official authority)",
  MISMATCH_DETECTED: "Mismatch detected",
  EXPIRED: "Expired",
  VERIFICATION_PENDING: "Verification pending",
  SOURCE_UNAVAILABLE: "Source unavailable",
  MANUAL_REVIEW_REQUIRED: "Manual review required",
  MANUALLY_VERIFIED: "Manual verification completed",
  UNABLE_TO_DETERMINE: "Unable to determine",
} as const;
export type VerificationStatus = keyof typeof VERIFICATION_STATUSES;
export const VERIFICATION_TONE: Record<VerificationStatus, Tone> = {
  VERIFIED_BY_SOURCE: "success",
  VERIFIED_DEMO_SOURCE: "info",
  MISMATCH_DETECTED: "danger",
  EXPIRED: "danger",
  VERIFICATION_PENDING: "warning",
  SOURCE_UNAVAILABLE: "neutral",
  MANUAL_REVIEW_REQUIRED: "warning",
  MANUALLY_VERIFIED: "success",
  UNABLE_TO_DETERMINE: "neutral",
};

export const ALERT_STATUSES = ["OPEN", "ACKNOWLEDGED", "ESCALATED", "RESOLVED"] as const;
export type AlertStatus = (typeof ALERT_STATUSES)[number];

export const RULE_TYPES = {
  REQUIRED_FIELD: "Required field",
  REQUIRED_DOCUMENT: "Required document (from category checklist)",
  DOCUMENT_EXPIRY: "Document expiry",
  DATE_CONSISTENCY: "Date consistency",
  FIELD_MATCH: "Value comparison (application vs document)",
  INSTITUTION_RECORD_MATCH: "Comparison with institution record",
  DUPLICATE_FILE: "Duplicate file (SHA-256)",
  EXTRACTION_QUALITY: "Extraction / OCR completeness",
  PAYMENT_MATCH: "Payment reconciliation (synthetic ledger)",
  INTAKE_CONSISTENCY: "Threshold / conditional (intake)",
  MANUAL_VERIFICATION: "Manual verification requirement",
  AI_OBSERVATION: "AI observation (severity fixed by this rule, not by the model)",
} as const;
export type RuleType = keyof typeof RULE_TYPES;

export const ALLOWED_MIME = ["application/pdf", "image/png", "image/jpeg"] as const;

export const DEMO_DISCLAIMER =
  "Independent prototype for a hackathon demonstration. Not an official AICTE portal. All institutions, documents, payments and verification sources are synthetic.";

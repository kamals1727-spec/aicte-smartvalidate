// Document verification adapters.
// The prototype has NO connection to any real issuing authority. It ships:
//   • DemoRegistryAdapter  — a synthetic in-code registry (clearly labelled "Demo source")
//   • NotConfiguredAdapter — for document types with no authorized integration
//   • Manual verification  — recorded by an authorized officer (see services/review.ts)
// To add a real integration (authorized API, DigiLocker-style repository, QR/digital
// signature check), implement VerificationAdapter and register it in ADAPTERS_BY_DOCTYPE.
// See docs/INTEGRATIONS.md. Credentials for such adapters must live in server env vars.
import { normaliseRef, parseDate } from "../extraction/fields";
import type { VerificationStatus } from "@/lib/constants";

export interface VerificationRequest {
  docTypeCode: string;
  documentNumber: string | null;
  institutionId: string | null;
  expiryDate: string | null;
}

export interface VerificationResponse {
  result: VerificationStatus;
  method: string;
  returnedFields: Record<string, string>;
  evidenceRef: string;
  notes: string;
}

export interface VerificationAdapter {
  code: string;
  name: string;
  sourceType: "DEMO_SOURCE" | "AUTHORIZED_API" | "NOT_CONFIGURED";
  verify(req: VerificationRequest): Promise<VerificationResponse>;
}

export const MANUAL_RESULTS = ["MANUALLY_VERIFIED", "MISMATCH_DETECTED", "EXPIRED", "MANUAL_REVIEW_REQUIRED", "UNABLE_TO_DETERMINE"] as const;

/** Synthetic registry — every entry is fake and exists only to demonstrate the workflow. */
const DEMO_REGISTRY: Record<string, { institutionId: string; docTypeCode: string; validUntil: string; issuer: string }> = {
  "ACC-DEMO-2026-0101": { institutionId: "DEMO-INST-0001", docTypeCode: "ACCREDITATION_CERT", validUntil: "2028-06-14", issuer: "Demo Accreditation Board (synthetic)" },
  "ACC-DEMO-2021-0077": { institutionId: "DEMO-INST-0001", docTypeCode: "ACCREDITATION_CERT", validUntil: "2024-01-09", issuer: "Demo Accreditation Board (synthetic)" },
  "NOC-DEMO-2026-0050": { institutionId: "DEMO-INST-0001", docTypeCode: "NOC", validUntil: "2029-03-01", issuer: "Demo State Dept. of Technical Education (synthetic)" },
  "NOC-DEMO-2026-0042": { institutionId: "DEMO-INST-0099", docTypeCode: "NOC", validUntil: "2029-03-01", issuer: "Demo State Dept. of Technical Education (synthetic)" },
  "FIRE-DEMO-2026-0311": { institutionId: "DEMO-INST-0001", docTypeCode: "FIRE_SAFETY_CERT", validUntil: "2027-02-10", issuer: "Demo Fire Services (synthetic)" },
  "AFF-DEMO-2026-0005": { institutionId: "DEMO-INST-0001", docTypeCode: "AFFIDAVIT", validUntil: "2099-12-31", issuer: "Demo Notary (synthetic)" },
};

export const DemoRegistryAdapter: VerificationAdapter = {
  code: "DEMO_REGISTRY",
  name: "Demo source — synthetic certificate registry (NOT an issuing authority)",
  sourceType: "DEMO_SOURCE",
  async verify(req): Promise<VerificationResponse> {
    const evidenceRef = `demo-registry-lookup:${new Date().toISOString()}`;
    if (!req.documentNumber) {
      return { result: "UNABLE_TO_DETERMINE", method: "Reference-number lookup (demo)", returnedFields: {}, evidenceRef, notes: "No document number could be read from the document." };
    }
    const key = Object.keys(DEMO_REGISTRY).find((k) => normaliseRef(k) === normaliseRef(req.documentNumber!));
    if (!key) {
      return { result: "MISMATCH_DETECTED", method: "Reference-number lookup (demo)", returnedFields: { lookedUp: req.documentNumber }, evidenceRef, notes: "Reference number not present in the synthetic registry." };
    }
    const e = DEMO_REGISTRY[key];
    const returned = { documentNumber: key, institutionId: e.institutionId, validUntil: e.validUntil, issuer: e.issuer };
    if (req.institutionId && normaliseRef(req.institutionId) !== normaliseRef(e.institutionId)) {
      return { result: "MISMATCH_DETECTED", method: "Reference-number lookup (demo)", returnedFields: returned, evidenceRef, notes: "Registry entry belongs to a different institution ID." };
    }
    const until = parseDate(e.validUntil);
    if (until && until.getTime() < Date.now()) {
      return { result: "EXPIRED", method: "Reference-number lookup (demo)", returnedFields: returned, evidenceRef, notes: "Registry shows the document as expired." };
    }
    return { result: "VERIFIED_DEMO_SOURCE", method: "Reference-number lookup (demo)", returnedFields: returned, evidenceRef, notes: "Matched the SYNTHETIC demo registry. No real issuing authority was contacted." };
  },
};

export const NotConfiguredAdapter: VerificationAdapter = {
  code: "NOT_CONFIGURED",
  name: "Integration not configured",
  sourceType: "NOT_CONFIGURED",
  async verify() {
    return {
      result: "SOURCE_UNAVAILABLE",
      method: "None",
      returnedFields: {},
      evidenceRef: "",
      notes: "No authorized verification source is configured for this document type. Use manual verification.",
    };
  },
};

const ADAPTERS_BY_DOCTYPE: Record<string, VerificationAdapter> = {
  ACCREDITATION_CERT: DemoRegistryAdapter,
  NOC: DemoRegistryAdapter,
  FIRE_SAFETY_CERT: DemoRegistryAdapter,
  AFFIDAVIT: DemoRegistryAdapter,
};

export function getVerificationAdapter(docTypeCode: string): VerificationAdapter {
  return ADAPTERS_BY_DOCTYPE[docTypeCode] ?? NotConfiguredAdapter;
}

export const ALL_ADAPTERS = [DemoRegistryAdapter, NotConfiguredAdapter];

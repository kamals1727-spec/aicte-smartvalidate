import { describe, expect, it } from "vitest";
import { computePriority, runRules, type EngineDocument, type EngineInput, type EngineRule } from "@/server/validation/engine";
import { nameSimilarity, parseDate, parseFields } from "@/server/extraction/fields";

const rule = (type: string, severity: EngineRule["severity"] = "HIGH", params: Record<string, unknown> = {}, categories = "*"): EngineRule => ({
  id: `r-${type}`,
  ruleCode: `R-${type}`,
  type,
  title: type,
  severity,
  params,
  categories,
});

const doc = (id: string, type: string, text: string, o: Partial<EngineDocument> = {}): EngineDocument => {
  const pages = [{ pageNumber: 1, text, method: "text_layer", ocrConfidence: null }];
  return { id, docTypeCode: type, docTypeLabel: type, hasExpiry: ["ACC", "NOC"].includes(type), originalName: `${id}.pdf`, sha256: `hash-${id}`, extractionStatus: "DONE", pages, parsed: parseFields(pages), ...o };
};

function input(over: Partial<EngineInput> = {}): EngineInput {
  return {
    today: new Date("2026-10-25T00:00:00Z"),
    categoryCode: "EOA",
    requiresPayment: true,
    application: {
      declaredInstitutionName: "Synthetic Institute of Technology, Chennai",
      declaredInstitutionRef: "DEMO-INST-0001",
      academicYear: "2026-27",
      programmeName: "B.E.",
      approvedIntake: 60,
      proposedIntake: 120,
      contactName: "A",
      contactEmail: "a@b.test",
      paymentReference: "TXN-1",
      paymentAmount: 150000,
    },
    institution: { refId: "DEMO-INST-0001", name: "Synthetic Institute of Technology, Chennai" },
    checklist: [
      { docTypeCode: "ACC", label: "Accreditation certificate", mandatory: true },
      { docTypeCode: "NOC", label: "NOC", mandatory: true },
      { docTypeCode: "PHOTO", label: "Photo", mandatory: false },
    ],
    documents: [],
    hashesUsedElsewhere: new Set(),
    payment: { found: true, amount: 150000, institutionRefId: "DEMO-INST-0001", ledgerStatus: "SUCCESS" },
    rules: [],
    ...over,
  };
}

const NAME = "Institution Name: Synthetic Institute of Technology, Chennai\nInstitution ID: DEMO-INST-0001";

describe("deterministic rule engine", () => {
  it("flags missing mandatory documents only (optional ones are ignored)", () => {
    const f = runRules(input({ rules: [rule("REQUIRED_DOCUMENT", "CRITICAL")], documents: [doc("a", "ACC", NAME)] }));
    expect(f).toHaveLength(1);
    expect(f[0]).toMatchObject({ severity: "CRITICAL", result: "INFORMATION_MISSING", expectedValue: "NOC" });
  });

  it("detects expired certificates and treats unreadable dates as 'unable to determine', not expired", () => {
    const expired = doc("e", "ACC", `${NAME}\nValid Until: 09/01/2024`);
    const valid = doc("v", "NOC", `${NAME}\nValid Until: 01/03/2029`);
    const unknown = doc("u", "ACC", `${NAME}\nValid Until: sometime soon`);
    const f = runRules(input({ rules: [rule("DOCUMENT_EXPIRY", "HIGH", { undeterminedSeverity: "LOW" })], documents: [expired, valid, unknown] }));
    expect(f.find((x) => x.documentId === "e")).toMatchObject({ result: "NOT_SATISFIED", severity: "HIGH", actualValue: "2024-01-09" });
    expect(f.find((x) => x.documentId === "u")).toMatchObject({ result: "UNABLE_TO_DETERMINE", severity: "LOW" });
    expect(f.find((x) => x.documentId === "v")).toBeUndefined();
  });

  it("detects institution name and ID mismatches with evidence", () => {
    const d = doc("m", "NOC", "Institution Name: Unrelated Demo Trust, Madurai\nInstitution ID: DEMO-INST-0099");
    const f = runRules(input({ rules: [rule("FIELD_MATCH", "HIGH", { field: "institution_name", minSimilarity: 0.8 }), rule("FIELD_MATCH", "HIGH", { field: "institution_id" })], documents: [d] }));
    expect(f).toHaveLength(2);
    expect(f.map((x) => x.field).sort()).toEqual(["institution_id", "institution_name"]);
    expect(f.every((x) => x.evidence.startsWith("Institution"))).toBe(true);
  });

  it("does not flag a mismatch when the field is simply absent", () => {
    const f = runRules(input({ rules: [rule("FIELD_MATCH", "HIGH", { field: "institution_id" })], documents: [doc("x", "NOC", "No identifiers here")] }));
    expect(f).toHaveLength(0);
  });

  it("detects byte-identical duplicates within an application and reuse by another institution", () => {
    const a = doc("a", "ACC", NAME, { sha256: "same" });
    const b = doc("b", "NOC", NAME, { sha256: "same" });
    const f = runRules(input({ rules: [rule("DUPLICATE_FILE", "MEDIUM", { crossInstitutionSeverity: "HIGH" })], documents: [a, b], hashesUsedElsewhere: new Set(["same"]) }));
    expect(f.find((x) => x.result === "NOT_SATISFIED")?.documentId).toBe("b");
    expect(f.find((x) => x.result === "MANUAL_REVIEW_REQUIRED")?.severity).toBe("HIGH");
  });

  it("reconciles payments against the ledger", () => {
    const f = runRules(input({ rules: [rule("PAYMENT_MATCH")], payment: { found: true, amount: 75000, institutionRefId: "DEMO-INST-0001", ledgerStatus: "SUCCESS" } }));
    expect(f[0].actualValue).toContain("75000");
    const nf = runRules(input({ rules: [rule("PAYMENT_MATCH")], payment: { found: false } }));
    expect(nf[0].actualValue).toContain("not found");
  });

  it("skips rules not applicable to the category", () => {
    const f = runRules(input({ categoryCode: "EOA", rules: [rule("INTAKE_CONSISTENCY", "MEDIUM", {}, "INCREASE_INTAKE")] }));
    expect(f).toHaveLength(0);
    const g = runRules(input({ categoryCode: "INCREASE_INTAKE", rules: [rule("INTAKE_CONSISTENCY", "MEDIUM", {}, "INCREASE_INTAKE")], application: { ...input().application, approvedIntake: 120, proposedIntake: 60 } }));
    expect(g).toHaveLength(1);
  });

  it("computes a transparent review priority that ignores dismissed findings", () => {
    const p = computePriority([
      { severity: "CRITICAL", result: "INFORMATION_MISSING", ruleType: "REQUIRED_DOCUMENT" },
      { severity: "HIGH", result: "NOT_SATISFIED", ruleType: "DOCUMENT_EXPIRY", reviewStatus: "DISMISSED" },
    ]);
    expect(p.score).toBe(18);
    expect(p.level).toBe("MEDIUM");
    expect(p.factors.length).toBeGreaterThan(0);
  });
});

describe("field parsing", () => {
  it("parses common Indian date formats and rejects impossible dates", () => {
    expect(parseDate("14/06/2028")?.toISOString().slice(0, 10)).toBe("2028-06-14");
    expect(parseDate("2028-06-14")?.toISOString().slice(0, 10)).toBe("2028-06-14");
    expect(parseDate("14 June 2028")?.toISOString().slice(0, 10)).toBe("2028-06-14");
    expect(parseDate("31/02/2028")).toBeNull();
    expect(parseDate("next year")).toBeNull();
  });
  it("extracts labelled fields with page and evidence", () => {
    const f = parseFields([{ pageNumber: 2, text: "Certificate No: ACC-1\nValid Until: 01/01/2030\nTransaction Reference: TXN-9\nAmount Paid: INR 1,50,000" }]);
    expect(f.find((x) => x.field === "document_number")).toMatchObject({ value: "ACC-1", page: 2 });
    expect(f.find((x) => x.field === "transaction_reference")?.value).toBe("TXN-9");
    expect(f.find((x) => x.field === "amount")?.value).toBe("1,50,000");
  });
  it("name similarity tolerates punctuation but not different institutions", () => {
    expect(nameSimilarity("Synthetic Institute of Technology, Chennai", "SYNTHETIC INSTITUTE OF TECHNOLOGY CHENNAI")).toBe(1);
    expect(nameSimilarity("Synthetic Institute of Technology, Chennai", "Unrelated Demo Trust")).toBeLessThan(0.3);
  });
});

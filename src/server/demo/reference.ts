// Reference data: document types, application categories + checklists, and the DEMO
// ruleset. These are illustrative configurations for the prototype — NOT official AICTE
// requirements. Administrators can change checklists and rules in the UI.
import { getDb, schema } from "../db";

export const DOC_TYPES = [
  { code: "AFFIDAVIT", label: "Affidavit / undertaking", hasExpiry: false, isInfrastructure: false, description: "Notarised undertaking by the institution (demo)." },
  { code: "ACCREDITATION_CERT", label: "Accreditation certificate", hasExpiry: true, isInfrastructure: false, description: "Accreditation status certificate (demo)." },
  { code: "NOC", label: "No Objection Certificate (State / University)", hasExpiry: true, isInfrastructure: false, description: "NOC from the state government or affiliating university (demo)." },
  { code: "FIRE_SAFETY_CERT", label: "Fire safety certificate", hasExpiry: true, isInfrastructure: true, description: "Fire safety clearance for buildings (demo)." },
  { code: "BUILDING_CERT", label: "Building completion / stability certificate", hasExpiry: false, isInfrastructure: true, description: "Structural stability / completion certificate (demo)." },
  { code: "LAND_DOCUMENT", label: "Land documents", hasExpiry: false, isInfrastructure: true, description: "Land ownership / lease documents (demo)." },
  { code: "LAB_PHOTO", label: "Laboratory / infrastructure photographs", hasExpiry: false, isInfrastructure: true, description: "Photographs of labs and equipment with captions (demo)." },
  { code: "FACULTY_LIST", label: "Faculty details", hasExpiry: false, isInfrastructure: false, description: "Faculty roster for the programmes (demo)." },
  { code: "FEE_RECEIPT", label: "Application fee receipt", hasExpiry: false, isInfrastructure: false, description: "Receipt for the processing fee (demo ledger)." },
  { code: "PREVIOUS_EOA", label: "Previous approval / EoA letter", hasExpiry: false, isInfrastructure: false, description: "Previous approval letter reference (demo)." },
] as const;

export const CATEGORIES: { code: string; name: string; description: string; requiresPayment: boolean; checklist: [string, boolean][] }[] = [
  {
    code: "NEW_INSTITUTION",
    name: "New Institution Application",
    description: "Approval request for a new technical institution (demo category).",
    requiresPayment: true,
    checklist: [["AFFIDAVIT", true], ["LAND_DOCUMENT", true], ["BUILDING_CERT", true], ["FIRE_SAFETY_CERT", true], ["LAB_PHOTO", true], ["FEE_RECEIPT", true], ["FACULTY_LIST", false]],
  },
  {
    code: "EOA",
    name: "Extension of Approval (EoA)",
    description: "Continuation of approval for an existing institution (demo category).",
    requiresPayment: true,
    checklist: [["AFFIDAVIT", true], ["ACCREDITATION_CERT", true], ["NOC", true], ["FIRE_SAFETY_CERT", true], ["FEE_RECEIPT", true], ["PREVIOUS_EOA", false]],
  },
  {
    code: "ADD_COURSES",
    name: "Addition of Courses / Programmes",
    description: "Adding new programmes or courses (demo category).",
    requiresPayment: true,
    checklist: [["AFFIDAVIT", true], ["NOC", true], ["FACULTY_LIST", true], ["LAB_PHOTO", true], ["FEE_RECEIPT", true]],
  },
  {
    code: "INCREASE_INTAKE",
    name: "Increase in Approved Intake",
    description: "Increasing sanctioned intake for an existing programme (demo category).",
    requiresPayment: true,
    checklist: [["AFFIDAVIT", true], ["ACCREDITATION_CERT", true], ["FACULTY_LIST", true], ["BUILDING_CERT", false], ["FEE_RECEIPT", true]],
  },
  {
    code: "OTHER_CHANGES",
    name: "Other Approval-Related Changes",
    description: "Name/address/other changes (demo category).",
    requiresPayment: false,
    checklist: [["AFFIDAVIT", true]],
  },
];

const PAID = "NEW_INSTITUTION,EOA,ADD_COURSES,INCREASE_INTAKE";

export const DEMO_RULES: { ruleCode: string; title: string; description: string; type: string; severity: string; params: object; categories: string }[] = [
  { ruleCode: "R-FLD-001", title: "Mandatory application fields", description: "Core identity and contact fields must be completed.", type: "REQUIRED_FIELD", severity: "HIGH", params: { fields: ["declaredInstitutionName", "declaredInstitutionRef", "academicYear", "contactName", "contactEmail"] }, categories: "*" },
  { ruleCode: "R-FLD-002", title: "Payment reference required", description: "Fee-bearing categories must quote a payment reference.", type: "REQUIRED_FIELD", severity: "HIGH", params: { fields: ["paymentReference"] }, categories: PAID },
  { ruleCode: "R-FLD-003", title: "Programme details required", description: "Programme/course details must be given for programme-related categories.", type: "REQUIRED_FIELD", severity: "MEDIUM", params: { fields: ["programmeName"] }, categories: "NEW_INSTITUTION,ADD_COURSES,INCREASE_INTAKE" },
  { ruleCode: "R-FLD-004", title: "Previous approval reference", description: "EoA applications should quote the previous approval reference.", type: "REQUIRED_FIELD", severity: "MEDIUM", params: { fields: ["previousApprovalRef"] }, categories: "EOA" },
  { ruleCode: "R-DOC-001", title: "Mandatory documents (category checklist)", description: "Every document marked mandatory in the configured checklist must be uploaded.", type: "REQUIRED_DOCUMENT", severity: "CRITICAL", params: {}, categories: "*" },
  { ruleCode: "R-EXP-001", title: "Document validity / expiry", description: "Certificates with a validity date must not be expired on the validation date.", type: "DOCUMENT_EXPIRY", severity: "HIGH", params: { undeterminedSeverity: "LOW" }, categories: "*" },
  { ruleCode: "R-DAT-001", title: "Date consistency", description: "Issue dates must precede expiry dates and must not be in the future.", type: "DATE_CONSISTENCY", severity: "HIGH", params: { futureIssueSeverity: "MEDIUM" }, categories: "*" },
  { ruleCode: "R-MAT-001", title: "Institution name on documents", description: "Institution name on documents should match the application (token similarity threshold).", type: "FIELD_MATCH", severity: "HIGH", params: { field: "institution_name", minSimilarity: 0.8 }, categories: "*" },
  { ruleCode: "R-MAT-002", title: "Institution ID on documents", description: "Institution ID on documents must match the application.", type: "FIELD_MATCH", severity: "HIGH", params: { field: "institution_id" }, categories: "*" },
  { ruleCode: "R-INS-001", title: "Match with institution record", description: "Declared name and reference must match the institution record.", type: "INSTITUTION_RECORD_MATCH", severity: "HIGH", params: {}, categories: "*" },
  { ruleCode: "R-DUP-001", title: "Duplicate files", description: "Byte-identical files (SHA-256) uploaded more than once.", type: "DUPLICATE_FILE", severity: "MEDIUM", params: { crossInstitutionSeverity: "HIGH" }, categories: "*" },
  { ruleCode: "R-OCR-001", title: "Extraction completeness", description: "Documents whose text could not be extracted reliably need manual reading.", type: "EXTRACTION_QUALITY", severity: "MEDIUM", params: { minOcrConfidence: 60, skipDocTypes: ["LAB_PHOTO"] }, categories: "*" },
  { ruleCode: "R-PAY-001", title: "Payment reconciliation", description: "Payment reference, amount and institution must reconcile with the (synthetic) ledger.", type: "PAYMENT_MATCH", severity: "HIGH", params: {}, categories: PAID },
  { ruleCode: "R-INT-001", title: "Intake consistency", description: "For intake increases, proposed intake must exceed approved intake.", type: "INTAKE_CONSISTENCY", severity: "MEDIUM", params: {}, categories: "INCREASE_INTAKE" },
  { ruleCode: "R-MAN-001", title: "Manual authenticity verification", description: "Signatures, seals and issuers always require human verification.", type: "MANUAL_VERIFICATION", severity: "INFO", params: {}, categories: "*" },
  { ruleCode: "R-AI-001", title: "AI-assisted observation", description: "Observations raised by the AI layer. Severity is fixed here, never chosen by the model.", type: "AI_OBSERVATION", severity: "MEDIUM", params: {}, categories: "*" },
];

export async function seedReference() {
  const db = getDb();
  await db.insert(schema.documentTypes).values(DOC_TYPES.map((d) => ({ ...d })));
  for (const c of CATEGORIES) {
    const [cat] = await db.insert(schema.categories).values({ code: c.code, name: c.name, description: c.description, requiresPayment: c.requiresPayment }).returning();
    await db.insert(schema.checklistItems).values(c.checklist.map(([code, mandatory], i) => ({ categoryId: cat.id, docTypeCode: code, mandatory, sortOrder: i })));
  }
  const [rs] = await db.insert(schema.rulesetVersions).values({ version: "demo-2026.1", active: true, notes: "Initial DEMO ruleset — illustrative only, not official AICTE regulations." }).returning();
  await db.insert(schema.validationRules).values(DEMO_RULES.map((r) => ({ ...r, params: JSON.stringify(r.params), rulesetVersionId: rs.id })));
  await db.insert(schema.verificationSources).values([
    { code: "DEMO_REGISTRY", name: "Demo source — synthetic certificate registry", sourceType: "DEMO_SOURCE", description: "In-code synthetic registry used to demonstrate the adapter workflow. Not an issuing authority." },
    { code: "SYNTHETIC_LEDGER", name: "Synthetic payment ledger", sourceType: "DEMO_SOURCE", description: "Demo payment ledger. Not connected to any government account." },
    { code: "MANUAL", name: "Manual verification", sourceType: "MANUAL", description: "Verification recorded by authorized personnel." },
    { code: "OFFICIAL_API", name: "Official issuing-authority integration", sourceType: "NOT_CONFIGURED", description: "Integration not configured — requires authorized access." },
  ]);
}

// Synthetic demonstration dataset. Every institution, document, payment and decision here
// is fake. The data is produced by running the REAL services (upload → extraction/OCR →
// validation → submission → officer review), so it is internally consistent.
import bcrypt from "bcryptjs";
import { readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import { eq } from "drizzle-orm";
import { getDb, schema } from "../db";
import type { Actor } from "../authz";
import { createApplication } from "../services/applications";
import { uploadDocument } from "../services/documents";
import { runValidation } from "../services/validation";
import { submitApplication } from "../services/applications";
import { assignApplications, caseAction, recordCertificate, recordDecision, reviewFinding, runSourceVerification, recordManualVerification } from "../services/review";
import { resolveAiConfig } from "../ai/config";
import { makeTextPdf } from "./pdf";
import { encodePng } from "../extraction/png";

export const DEMO_PASSWORDS = {
  INSTITUTION: "Institution@2026",
  OFFICER: "Officer@2026",
  ADMIN: "Admin@2026",
};

export const INSTITUTIONS = [
  { refId: "DEMO-INST-0001", name: "Synthetic Institute of Technology, Chennai", city: "Chennai", state: "Tamil Nadu", address: "12 Demo Road, Guindy, Chennai 600025", affiliatedUniversity: "Demo Technical University", approvalStatus: "Approved (synthetic record)" },
  { refId: "DEMO-INST-0002", name: "Synthetic College of Engineering, Coimbatore", city: "Coimbatore", state: "Tamil Nadu", address: "45 Sample Avenue, Coimbatore 641004", affiliatedUniversity: "Demo Technical University", approvalStatus: "Approved (synthetic record)" },
  { refId: "DEMO-INST-0003", name: "Sample Polytechnic Institute, Pune", city: "Pune", state: "Maharashtra", address: "7 Example Lane, Pune 411005", affiliatedUniversity: "Example State Board of Technical Education", approvalStatus: "Approved (synthetic record)" },
  { refId: "DEMO-INST-0004", name: "Demo Institute of Management and Technology, Lucknow", city: "Lucknow", state: "Uttar Pradesh", address: "88 Prototype Marg, Lucknow 226010", affiliatedUniversity: "Placeholder University", approvalStatus: "Approval under process (synthetic record)" },
  { refId: "DEMO-INST-0005", name: "Example School of Architecture, Bhopal", city: "Bhopal", state: "Madhya Pradesh", address: "3 Illustrative Street, Bhopal 462003", affiliatedUniversity: "Placeholder University", approvalStatus: "Approved (synthetic record)" },
];

type Inst = (typeof INSTITUTIONS)[number];

function doc(inst: Inst, type: string, o: { expired?: boolean; wrongName?: string; wrongId?: string; num?: string } = {}): { name: string; bytes: Buffer } {
  const name = o.wrongName ?? inst.name;
  const id = o.wrongId ?? inst.refId;
  const head = [`Institution Name: ${name}`, `Institution ID: ${id}`];
  const titleMap: Record<string, string> = {
    AFFIDAVIT: "Affidavit / Undertaking",
    ACCREDITATION_CERT: "Accreditation Certificate",
    NOC: "No Objection Certificate",
    FIRE_SAFETY_CERT: "Fire Safety Certificate",
    BUILDING_CERT: "Building Completion and Stability Certificate",
    LAND_DOCUMENT: "Land Registration Record",
    FACULTY_LIST: "Faculty Details",
    FEE_RECEIPT: "Application Fee Receipt",
    PREVIOUS_EOA: "Previous Approval Letter",
  };
  const body: Record<string, string[]> = {
    AFFIDAVIT: [`Affidavit Reference: AFF-${inst.refId.slice(-4)}-2026`, "Date of Issue: 20/07/2026", "The institution undertakes that the submitted information is true (synthetic)."],
    ACCREDITATION_CERT: o.expired
      ? [`Certificate No: ${o.num ?? `ACC-${inst.refId.slice(-4)}-2021`}`, "Issued By: Demo Accreditation Board (synthetic)", "Date of Issue: 10/01/2021", "Valid Until: 09/01/2024"]
      : [`Certificate No: ${o.num ?? `ACC-${inst.refId.slice(-4)}-2026`}`, "Issued By: Demo Accreditation Board (synthetic)", "Date of Issue: 15/06/2025", "Valid Until: 14/06/2028"],
    NOC: [`NOC Reference: ${o.num ?? `NOC-${inst.refId.slice(-4)}-2026`}`, "Issued By: Demo State Department of Technical Education (synthetic)", "Date of Issue: 02/03/2026", "Valid Until: 01/03/2029"],
    FIRE_SAFETY_CERT: [`Certificate No: FIRE-${inst.refId.slice(-4)}-2026`, "Issued By: Demo Fire Services (synthetic)", "Date of Issue: 11/02/2026", o.expired ? "Valid Until: 10/02/2025" : "Valid Until: 10/02/2028"],
    BUILDING_CERT: [`Certificate No: BLD-${inst.refId.slice(-4)}-2025`, "Issued By: Demo Municipal Corporation (synthetic)", "Date of Issue: 05/05/2025"],
    LAND_DOCUMENT: [`Document Reference: LAND-${inst.refId.slice(-4)}-2019`, "Survey No: 123/4 (synthetic)", "Area: 10 acres (synthetic)"],
    FACULTY_LIST: ["Total faculty: 64 (synthetic)", "Professors: 8, Associate Professors: 16, Assistant Professors: 40"],
    FEE_RECEIPT: [`Transaction Reference: TXN-${inst.refId.slice(-4)}-${o.num ?? "01"}`, "Amount Paid: INR 150000", "Payment Date: 05/08/2026", "Payment Status: SUCCESS (synthetic ledger)"],
    PREVIOUS_EOA: ["Previous Approval Reference: EOA-DEMO-2025-11", "Academic Year: 2025-26"],
  };
  return { name: `${type.toLowerCase()}_${inst.refId.slice(-4)}.pdf`, bytes: makeTextPdf(titleMap[type] ?? type, [...head, ...(body[type] ?? [])]) };
}

/** A synthetic "photo": coloured blocks, no text. */
function labPhoto(seed: number): Buffer {
  const w = 320, h = 200;
  const data = new Uint8Array(w * h * 3);
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 3;
      const block = (Math.floor(x / 40) + Math.floor(y / 40) + seed) % 4;
      data[i] = [70, 120, 200, 230][block];
      data[i + 1] = [90, 160, 210, 230][block];
      data[i + 2] = [140, 120, 160, 235][block];
    }
  return encodePng(w, h, 3, data);
}

/** Nearly blank "scan" — OCR will find no usable text (demonstrates incomplete extraction). */
function blankScan(): Buffer {
  const w = 600, h = 800;
  const data = new Uint8Array(w * h).fill(250);
  for (let i = 0; i < 400; i++) data[(i * 7919) % data.length] = 120;
  return encodePng(w, h, 1, data);
}

export async function seedScenarios(opts: { password?: string; log?: (s: string) => void; samplesDir?: string } = {}) {
  const log = opts.log ?? (() => {});
  const db = getDb();
  const insts = await db.insert(schema.institutions).values(INSTITUTIONS.map((i) => ({ ...i, contactEmail: `office@${i.refId.toLowerCase()}.demo.test`, contactPhone: "+91-00000-00000" }))).returning();
  const byRef = (r: string) => insts.find((i) => i.refId === r)!;
  const pw = (role: keyof typeof DEMO_PASSWORDS) => bcrypt.hash(opts.password ?? DEMO_PASSWORDS[role], 10);

  const mkUser = async (email: string, name: string, role: Actor["role"], institutionId: string | null) => {
    const [u] = await db.insert(schema.users).values({ email, name, role, institutionId, passwordHash: await pw(role) }).returning();
    return { id: u.id, name: u.name, email: u.email, role, institutionId } as Actor;
  };
  const instUsers: Actor[] = [];
  for (let i = 0; i < insts.length; i++) {
    instUsers.push(await mkUser(`inst${i + 1}@demo.smartvalidate.test`, `${INSTITUTIONS[i].name.split(",")[0]} (Nodal Officer)`, "INSTITUTION", insts[i].id));
  }
  const officer1 = await mkUser("officer1@demo.smartvalidate.test", "Officer Anand (demo)", "OFFICER", null);
  const officer2 = await mkUser("officer2@demo.smartvalidate.test", "Officer Divya (demo)", "OFFICER", null);
  const admin = await mkUser("admin@demo.smartvalidate.test", "Admin Rao (demo)", "ADMIN", null);
  log("users created");

  // Synthetic payment ledger.
  const ledger: [string, string, number, string][] = [
    ["TXN-DEMO-778812", "DEMO-INST-0001", 150000, "SUCCESS"],
    ["TXN-0001-02", "DEMO-INST-0001", 150000, "SUCCESS"],
    ["TXN-0002-01", "DEMO-INST-0002", 150000, "SUCCESS"],
    ["TXN-0002-02", "DEMO-INST-0002", 150000, "SUCCESS"],
    ["TXN-0002-03", "DEMO-INST-0002", 150000, "SUCCESS"],
    ["TXN-0003-01", "DEMO-INST-0003", 150000, "SUCCESS"],
    ["TXN-0003-02", "DEMO-INST-0003", 150000, "SUCCESS"],
    ["TXN-0003-03", "DEMO-INST-0003", 150000, "SUCCESS"],
    ["TXN-0004-01", "DEMO-INST-0004", 150000, "SUCCESS"],
    ["TXN-0004-02", "DEMO-INST-0004", 75000, "SUCCESS"], // amount discrepancy scenario
    ["TXN-0005-01", "DEMO-INST-0005", 150000, "SUCCESS"],
    ["TXN-0005-02", "DEMO-INST-0005", 150000, "SUCCESS"],
    ["TXN-0001-03", "DEMO-INST-0001", 150000, "SUCCESS"],
  ];
  await db.insert(schema.payments).values(ledger.map(([t, r, amount, s], i) => ({ transactionRef: t, institutionId: byRef(r).id, amount, paidAt: new Date(Date.now() - (20 + i * 3) * 86_400_000), ledgerStatus: s })));

  const ai = { config: resolveAiConfig({ AI_PROVIDER: "mock" }) }; // never spend API quota while seeding

  const baseFields = (inst: Inst, user: Actor, cat: string, pay: string, extra: Record<string, unknown> = {}) => ({
    categoryCode: cat,
    academicYear: "2026-27",
    declaredInstitutionName: inst.name,
    declaredInstitutionRef: inst.refId,
    address: inst.address,
    state: inst.state,
    affiliatedUniversity: inst.affiliatedUniversity,
    programmeName: "B.E. Computer Science and Engineering",
    approvedIntake: 120,
    proposedIntake: 180,
    previousApprovalRef: "EOA-DEMO-2025-11",
    accreditationDetails: "Accredited (synthetic)",
    contactName: user.name,
    contactEmail: user.email,
    contactPhone: "+91-00000-00000",
    paymentReference: pay,
    paymentAmount: 150000,
    ...extra,
  });

  type Up = { type: string; file: { name: string; bytes: Buffer }; caption?: string };
  const build = async (user: Actor, fields: ReturnType<typeof baseFields>, uploads: Up[], daysAgo: number) => {
    const app = await createApplication(user, fields);
    for (const u of uploads) {
      await uploadDocument(user, { applicationId: app.id, docTypeCode: u.type, caption: u.caption, fileName: u.file.name, bytes: u.file.bytes });
    }
    if (uploads.length) await runValidation(user, app.id, { ai });
    // Spread creation dates over the past weeks for realistic trends.
    const created = new Date(Date.now() - daysAgo * 86_400_000);
    await db.update(schema.applications).set({ createdAt: created }).where(eq(schema.applications.id, app.id));
    return app;
  };
  const submit = async (user: Actor, appId: string, daysAgo: number) => {
    await submitApplication(user, appId, true);
    await db.update(schema.applications).set({ submittedAt: new Date(Date.now() - daysAgo * 86_400_000) }).where(eq(schema.applications.id, appId));
  };
  const findingsOf = (appId: string) => db.select().from(schema.findings).where(eq(schema.findings.applicationId, appId));
  const docsOf = (appId: string) => db.select().from(schema.documents).where(eq(schema.documents.applicationId, appId));

  const [I1, I2, I3, I4, I5] = INSTITUTIONS;
  const [U1, U2, U3, U4, U5] = instUsers;
  const fullEoa = (inst: Inst, pay: string, o: { scanFire?: Buffer } = {}): Up[] => [
    { type: "AFFIDAVIT", file: doc(inst, "AFFIDAVIT") },
    { type: "ACCREDITATION_CERT", file: doc(inst, "ACCREDITATION_CERT") },
    { type: "NOC", file: doc(inst, "NOC") },
    { type: "FIRE_SAFETY_CERT", file: o.scanFire ? { name: "fire_safety_scanned.png", bytes: o.scanFire } : doc(inst, "FIRE_SAFETY_CERT") },
    { type: "FEE_RECEIPT", file: doc(inst, "FEE_RECEIPT", { num: pay.split("-").pop() }) },
  ];

  // 1. Complete EoA (with a real OCR'd scan when the sample is available) → submitted → under review.
  const samples = opts.samplesDir ?? path.resolve("samples");
  const scan = existsSync(path.join(samples, "06_fire_safety_scanned.png")) ? await readFile(path.join(samples, "06_fire_safety_scanned.png")) : undefined;
  const a1 = await build(U1, baseFields(I1, U1, "EOA", "TXN-0001-02"), fullEoa(I1, "TXN-0001-02", { scanFire: scan }), 40);
  await submit(U1, a1.id, 35);
  await assignApplications(admin, [a1.id], officer1.id);
  {
    const fs = await findingsOf(a1.id);
    const man = fs.find((f) => f.ruleCode === "R-MAN-001");
    if (man) await reviewFinding(officer1, { findingId: man.id, status: "MANUALLY_VERIFIED", reason: "Seals and signatures checked against originals during desk review (demo)." });
    for (const d of await docsOf(a1.id)) {
      if (d.docTypeCode === "FEE_RECEIPT") await recordManualVerification(officer1, d.id, { result: "MANUALLY_VERIFIED", notes: "Receipt matched synthetic ledger entry (demo)." });
      else await runSourceVerification(officer1, d.id);
    }
  }
  log("scenario 1: complete EoA under review");

  // 2. Missing mandatory documents (draft side → rectification required).
  await build(U1, baseFields(I1, U1, "ADD_COURSES", "TXN-0001-03"), [{ type: "AFFIDAVIT", file: doc(I1, "AFFIDAVIT") }, { type: "FEE_RECEIPT", file: doc(I1, "FEE_RECEIPT", { num: "03" }) }], 6);
  log("scenario 2: missing documents");

  // 3. Expired accreditation → submitted, awaiting scrutiny (unassigned).
  const a3 = await build(U2, baseFields(I2, U2, "EOA", "TXN-0002-01"), [...fullEoa(I2, "TXN-0002-01").filter((u) => u.type !== "ACCREDITATION_CERT"), { type: "ACCREDITATION_CERT", file: doc(I2, "ACCREDITATION_CERT", { expired: true }) }], 20);
  await submit(U2, a3.id, 18);
  log("scenario 3: expired certificate");

  // 4. Name / ID mismatch on NOC → submitted → officer confirms the mismatch.
  const a4 = await build(
    U2,
    baseFields(I2, U2, "EOA", "TXN-0002-02"),
    [...fullEoa(I2, "TXN-0002-02").filter((u) => u.type !== "NOC"), { type: "NOC", file: doc(I2, "NOC", { wrongName: "Synthetic College of Engineering and Science, Madurai", wrongId: "DEMO-INST-0099" }) }],
    25,
  );
  await submit(U2, a4.id, 22);
  await assignApplications(admin, [a4.id], officer2.id);
  {
    const mm = (await findingsOf(a4.id)).find((f) => f.ruleCode === "R-MAT-002");
    if (mm) await reviewFinding(officer2, { findingId: mm.id, status: "CONFIRMED", reason: "NOC institution ID belongs to a different (synthetic) institution." });
  }
  log("scenario 4: mismatch confirmed by officer");

  // 5. Exact duplicate document (same file uploaded twice) → submitted.
  const acc = doc(I3, "ACCREDITATION_CERT");
  const a5 = await build(
    U3,
    baseFields(I3, U3, "INCREASE_INTAKE", "TXN-0003-01"),
    [
      { type: "AFFIDAVIT", file: doc(I3, "AFFIDAVIT") },
      { type: "ACCREDITATION_CERT", file: acc },
      { type: "FACULTY_LIST", file: acc }, // wrong file — byte-identical duplicate
      { type: "FEE_RECEIPT", file: doc(I3, "FEE_RECEIPT", { num: "01" }) },
    ],
    30,
  );
  await submit(U3, a5.id, 28);
  log("scenario 5: duplicate file");

  // 6. Pending external-source verification.
  const a6 = await build(U3, baseFields(I3, U3, "EOA", "TXN-0003-02"), fullEoa(I3, "TXN-0003-02"), 33);
  await submit(U3, a6.id, 30);
  await assignApplications(admin, [a6.id], officer1.id);
  await caseAction(officer1, a6.id, { action: "MARK_EXTERNAL_PENDING", reason: "Awaiting confirmation from the (synthetic) state department for the NOC." });
  log("scenario 6: pending external verification");

  // 7. Incomplete OCR extraction (near-blank scan) → submitted.
  const a7 = await build(U4, baseFields(I4, U4, "OTHER_CHANGES", "", { paymentAmount: null, programmeName: "" }), [{ type: "AFFIDAVIT", file: { name: "affidavit_scan.png", bytes: blankScan() } }], 12);
  await submit(U4, a7.id, 10);
  log("scenario 7: incomplete OCR");

  // 8. New institution — infrastructure evidence (lab photographs) missing → rectification.
  await build(
    U4,
    baseFields(I4, U4, "NEW_INSTITUTION", "TXN-0004-01", { approvedIntake: null, proposedIntake: 60 }),
    [
      { type: "AFFIDAVIT", file: doc(I4, "AFFIDAVIT") },
      { type: "LAND_DOCUMENT", file: doc(I4, "LAND_DOCUMENT") },
      { type: "BUILDING_CERT", file: doc(I4, "BUILDING_CERT") },
      { type: "FIRE_SAFETY_CERT", file: doc(I4, "FIRE_SAFETY_CERT") },
      { type: "FEE_RECEIPT", file: doc(I4, "FEE_RECEIPT", { num: "01" }) },
    ],
    8,
  );
  log("scenario 8: infrastructure evidence missing");

  // 9. Payment discrepancy (ledger amount differs) → submitted → under review.
  const a9 = await build(U4, baseFields(I4, U4, "EOA", "TXN-0004-02"), fullEoa(I4, "TXN-0004-02"), 18);
  await submit(U4, a9.id, 15);
  await assignApplications(admin, [a9.id], officer2.id);
  await caseAction(officer2, a9.id, { action: "START_REVIEW", reason: "Payment reconciliation issue flagged by validation." });
  log("scenario 9: payment discrepancy");

  // 10. Awaiting institutional rectification (clarification requested by officer).
  const a10 = await build(
    U5,
    baseFields(I5, U5, "ADD_COURSES", "TXN-0005-01", { programmeName: "B.Arch (additional division)" }),
    [
      { type: "AFFIDAVIT", file: doc(I5, "AFFIDAVIT") },
      { type: "NOC", file: doc(I5, "NOC") },
      { type: "FACULTY_LIST", file: doc(I5, "FACULTY_LIST") },
      { type: "LAB_PHOTO", file: { name: "studio_photo_1.png", bytes: labPhoto(1) }, caption: "Design studio 1 (synthetic image)" },
      { type: "FEE_RECEIPT", file: doc(I5, "FEE_RECEIPT", { num: "01" }) },
    ],
    26,
  );
  await submit(U5, a10.id, 24);
  await assignApplications(admin, [a10.id], officer2.id);
  await caseAction(officer2, a10.id, { action: "REQUEST_CLARIFICATION", reason: "Studio photographs do not show the equipment listed. Upload labelled photographs of each studio and workshop." });
  log("scenario 10: clarification requested");

  // 11. Awaiting officer scrutiny (unassigned).
  const a11 = await build(U5, baseFields(I5, U5, "EOA", "TXN-0005-02"), fullEoa(I5, "TXN-0005-02"), 4);
  await submit(U5, a11.id, 2);
  log("scenario 11: awaiting scrutiny");

  // 12. Official decision recorded by the authorized demo administrator + demo certificate.
  const a12 = await build(U2, baseFields(I2, U2, "EOA", "TXN-0002-03"), fullEoa(I2, "TXN-0002-03"), 50);
  await submit(U2, a12.id, 45);
  await assignApplications(admin, [a12.id], officer1.id);
  for (const f of await findingsOf(a12.id)) {
    await reviewFinding(officer1, { findingId: f.id, status: f.severity === "INFO" ? "MANUALLY_VERIFIED" : "DISMISSED", reason: "Checked against originals during scrutiny (demo)." });
  }
  for (const d of await docsOf(a12.id)) await recordManualVerification(officer1, d.id, { result: "MANUALLY_VERIFIED", notes: "Original sighted (demo)." });
  await recordDecision(admin, a12.id, { decision: "APPROVED", reason: "All scrutiny findings resolved by the reviewing officer (demo decision by authorized demo user)." });
  await recordCertificate(admin, a12.id, { issuingAuthority: "AICTE (DEMO — not an official certificate)" });
  log("scenario 12: approved with demo certificate record");

  // 13. Rejected by authorized authority.
  const a13 = await build(U3, baseFields(I3, U3, "ADD_COURSES", "TXN-0003-03"), [{ type: "AFFIDAVIT", file: doc(I3, "AFFIDAVIT") }, { type: "NOC", file: doc(I3, "NOC", { expired: true, wrongName: "Unrelated Demo Trust" }) }, { type: "FACULTY_LIST", file: doc(I3, "FACULTY_LIST") }, { type: "LAB_PHOTO", file: { name: "lab.png", bytes: labPhoto(2) }, caption: "Electronics lab (synthetic image)" }, { type: "FEE_RECEIPT", file: doc(I3, "FEE_RECEIPT", { num: "03" }) }], 60);
  await submit(U3, a13.id, 55);
  await assignApplications(admin, [a13.id], officer2.id);
  await caseAction(officer2, a13.id, { action: "START_REVIEW", reason: "Reviewing NOC mismatch." });
  await recordDecision(admin, a13.id, { decision: "REJECTED", reason: "NOC belongs to a different entity; clarification not provided within the demo timeline (synthetic)." });
  log("scenario 13: rejected");

  // 14. Plain draft.
  await build(U1, baseFields(I1, U1, "OTHER_CHANGES", "", { paymentAmount: null }), [], 1);
  log("scenario 14: draft");

  return { users: { instUsers, officer1, officer2, admin } };
}

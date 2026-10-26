// Integration test of the core workflow against the real services and a real SQLite DB,
// in DEMO mode (no API key). Mirrors: login → create → upload → extract → validate →
// findings saved → submit → officer review → institution sees status → audit trail.
import { beforeAll, describe, expect, it } from "vitest";
import bcrypt from "bcryptjs";
import { eq } from "drizzle-orm";
import { freshDb } from "./helpers";
import { getClient, getDb, schema } from "@/server/db";
import type { Actor } from "@/server/authz";
import { createApplication, getApplicationDetail, submitApplication } from "@/server/services/applications";
import { getDocumentFile, uploadDocument } from "@/server/services/documents";
import { runValidation } from "@/server/services/validation";
import { getQueue, recordDecision, reviewFinding } from "@/server/services/review";
import { login } from "@/server/services/auth";
import { verifySession } from "@/server/auth/session";
import { getDashboard } from "@/server/services/dashboard";
import { makeTextPdf } from "@/server/demo/pdf";
import { ForbiddenError, NotFoundError, WorkflowError } from "@/server/errors";

let inst: Actor, other: Actor, officer: Actor, admin: Actor;
let instRec: { id: string; name: string; refId: string };

const cert = (title: string, lines: string[]) => makeTextPdf(title, ["Institution Name: Test Institute of Engineering", "Institution ID: TEST-0001", ...lines]);

beforeAll(async () => {
  await freshDb();
  const db = getDb();
  const [i1, i2] = await db
    .insert(schema.institutions)
    .values([
      { refId: "TEST-0001", name: "Test Institute of Engineering", address: "x", city: "x", state: "x", affiliatedUniversity: "x", approvalStatus: "x", contactEmail: "a@t.test", contactPhone: "0" },
      { refId: "TEST-0002", name: "Other Test College", address: "x", city: "x", state: "x", affiliatedUniversity: "x", approvalStatus: "x", contactEmail: "b@t.test", contactPhone: "0" },
    ])
    .returning();
  instRec = i1;
  const hash = await bcrypt.hash("Password@123", 4);
  const mk = async (email: string, role: Actor["role"], institutionId: string | null) => {
    const [u] = await db.insert(schema.users).values({ email, name: email.split("@")[0], role, institutionId, passwordHash: hash }).returning();
    return { id: u.id, name: u.name, email: u.email, role, institutionId } as Actor;
  };
  inst = await mk("inst@t.test", "INSTITUTION", i1.id);
  other = await mk("other@t.test", "INSTITUTION", i2.id);
  officer = await mk("officer@t.test", "OFFICER", null);
  admin = await mk("admin@t.test", "ADMIN", null);
  await db.insert(schema.payments).values({ transactionRef: "TXN-T-1", institutionId: i1.id, amount: 1000, paidAt: new Date(), ledgerStatus: "SUCCESS" });
});

describe("authentication", () => {
  it("issues a signed session for valid credentials and rejects bad ones", async () => {
    const { token, actor } = await login({ email: "inst@t.test", password: "Password@123" }, "test");
    expect((await verifySession(token))?.sub).toBe(actor.id);
    await expect(login({ email: "inst@t.test", password: "wrong" }, "test")).rejects.toThrow("Invalid email or password");
    expect(await verifySession("tampered.token.value")).toBeNull();
  });
});

describe("end-to-end workflow (DEMO mode)", () => {
  let appId = "";
  let expiredDocId = "";

  it("institution creates an application", async () => {
    const app = await createApplication(inst, {
      categoryCode: "EOA",
      academicYear: "2026-27",
      declaredInstitutionName: instRec.name,
      declaredInstitutionRef: instRec.refId,
      contactName: "Nodal",
      contactEmail: "inst@t.test",
      previousApprovalRef: "EOA-1",
      paymentReference: "TXN-T-1",
      paymentAmount: "1000",
    });
    appId = app.id;
    expect(app.status).toBe("DRAFT");
    expect(app.refNo).toMatch(/^SV-\d{4}-[A-Z0-9]{6}$/);
  });

  it("rejects non-PDF/image content regardless of file name", async () => {
    await expect(uploadDocument(inst, { applicationId: appId, docTypeCode: "AFFIDAVIT", fileName: "evil.pdf", bytes: Buffer.from("#!/bin/sh\nrm -rf /") })).rejects.toThrow("Unsupported file type");
  });

  it("uploads PDFs, stores them privately and extracts text", async () => {
    const up = (type: string, title: string, lines: string[]) => uploadDocument(inst, { applicationId: appId, docTypeCode: type, fileName: `${type}.pdf`, bytes: cert(title, lines) });
    await up("AFFIDAVIT", "Affidavit", ["Date of Issue: 01/07/2026"]);
    const exp = await up("ACCREDITATION_CERT", "Accreditation", ["Certificate No: ACC-T-1", "Valid Until: 09/01/2024"]);
    expiredDocId = exp.id;
    expect(exp.extractionStatus).toBe("DONE");
    await up("FIRE_SAFETY_CERT", "Fire", ["Valid Until: 10/02/2030"]);
    await up("FEE_RECEIPT", "Receipt", ["Transaction Reference: TXN-T-1", "Amount Paid: INR 1000"]);
    // NOC deliberately missing.
    const file = await getDocumentFile(inst, exp.id);
    expect(file.bytes.subarray(0, 5).toString()).toBe("%PDF-");
  });

  it("validation produces evidence-linked findings and blocks submission on critical ones", async () => {
    const r = await runValidation(inst, appId);
    expect(r.aiMode).toBe("DEMO");
    const d = await getApplicationDetail(inst, appId);
    const codes = d.findings.map((f) => f.ruleCode);
    expect(codes).toContain("R-DOC-001"); // missing NOC
    expect(codes).toContain("R-EXP-001"); // expired accreditation
    const expired = d.findings.find((f) => f.ruleCode === "R-EXP-001")!;
    expect(expired).toMatchObject({ documentId: expiredDocId, page: 1, source: "deterministic", aiExplanationSource: "ai_mock" });
    expect(expired.evidence).toContain("Valid Until: 09/01/2024");
    expect(d.latestRun?.rulesetVersion).toBe("demo-2026.1");
    expect(d.app.status).toBe("RECTIFICATION_REQUIRED");
    await expect(submitApplication(inst, appId, true)).rejects.toBeInstanceOf(WorkflowError);
  });

  it("after rectification and re-validation the institution can submit", async () => {
    await uploadDocument(inst, { applicationId: appId, docTypeCode: "NOC", fileName: "noc.pdf", bytes: cert("NOC", ["Valid Until: 01/03/2029"]) });
    await uploadDocument(inst, { applicationId: appId, docTypeCode: "ACCREDITATION_CERT", replaceDocumentId: expiredDocId, fileName: "acc2.pdf", bytes: cert("Accreditation", ["Valid Until: 01/01/2029"]) });
    await expect(submitApplication(inst, appId, true)).rejects.toThrow(/Re-run validation/); // stale validation
    await runValidation(inst, appId);
    await submitApplication(inst, appId, true);
    const d = await getApplicationDetail(inst, appId);
    expect(d.app.status).toBe("SUBMITTED");
    expect(d.findings.map((f) => f.ruleCode)).not.toContain("R-EXP-001");
  });

  it("officer sees it in the queue and records a review; institution sees the new status", async () => {
    const q = await getQueue(officer, {});
    expect(q.rows.map((r) => r.id)).toContain(appId);
    const d = await getApplicationDetail(officer, appId);
    const f = d.findings[0];
    await reviewFinding(officer, { findingId: f.id, status: "MANUALLY_VERIFIED", reason: "Checked originals." });
    const after = await getApplicationDetail(inst, appId);
    expect(after.app.status).toBe("UNDER_REVIEW");
    expect(after.findings.find((x) => x.id === f.id)?.reviewStatus).toBe("MANUALLY_VERIFIED");
    const audit = await getDb().select().from(schema.auditLogs).where(eq(schema.auditLogs.action, "finding.reviewed"));
    expect(audit).toHaveLength(1);
  });

  it("dashboard metrics come from the database", async () => {
    const d = await getDashboard(admin, {});
    expect(d.kpis.total).toBe(1);
    expect(d.kpis.pendingDecision).toBe(1);
  });

  describe("authorization boundaries", () => {
    it("another institution cannot read the application or its files (IDOR → 404)", async () => {
      await expect(getApplicationDetail(other, appId)).rejects.toBeInstanceOf(NotFoundError);
      await expect(getDocumentFile(other, expiredDocId)).rejects.toBeInstanceOf(NotFoundError);
    });
    it("officers cannot see drafts; institutions cannot record decisions", async () => {
      const draft = await createApplication(other, { categoryCode: "OTHER_CHANGES", academicYear: "2026-27", declaredInstitutionName: "Other Test College", declaredInstitutionRef: "TEST-0002" });
      await expect(getApplicationDetail(officer, draft.id)).rejects.toBeInstanceOf(NotFoundError);
      await expect(recordDecision(inst, appId, { decision: "APPROVED", reason: "I approve myself" })).rejects.toBeInstanceOf(ForbiddenError);
      await expect(recordDecision(officer, appId, { decision: "APPROVED", reason: "Officer cannot decide" })).rejects.toBeInstanceOf(ForbiddenError);
    });
    it("only an authorized admin records the official decision", async () => {
      await recordDecision(admin, appId, { decision: "APPROVED", reason: "All findings resolved in test." });
      expect((await getApplicationDetail(inst, appId)).app.status).toBe("APPROVED");
    });
  });

  it("the audit log is append-only at the database level", async () => {
    await expect(getClient().execute("UPDATE audit_logs SET action = 'tampered'")).rejects.toThrow(/append-only/);
    await expect(getClient().execute("DELETE FROM audit_logs")).rejects.toThrow(/append-only/);
  });
});

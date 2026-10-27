// Self-registration of a new applicant: creates a real institution + INSTITUTION user,
// can sign in, can start an application, and cannot escalate its role.
import { beforeAll, describe, expect, it } from "vitest";
import { ZodError } from "zod";
import { eq } from "drizzle-orm";
import { freshDb } from "./helpers";
import { getDb, schema } from "@/server/db";
import { login, register } from "@/server/services/auth";
import { verifySession } from "@/server/auth/session";
import { createApplication } from "@/server/services/applications";
import { AppError } from "@/server/errors";

const valid = {
  name: "Priya Applicant",
  email: "Priya@New-College.test",
  password: "NewApplicant@2026",
  confirmPassword: "NewApplicant@2026",
  institutionName: "New College of Engineering",
  address: "1 Campus Road, Madurai 625001",
  city: "Madurai",
  state: "Tamil Nadu",
  affiliatedUniversity: "Anna University",
  contactPhone: "+91 98765 43210",
};

beforeAll(async () => {
  await freshDb();
});

describe("register", () => {
  it("creates a non-synthetic institution and a linked INSTITUTION user", async () => {
    const { token, actor } = await register({ ...valid, role: "ADMIN" }, "client-a");
    expect(actor.role).toBe("INSTITUTION");
    expect((await verifySession(token))?.sub).toBe(actor.id);

    const db = getDb();
    const [u] = await db.select().from(schema.users).where(eq(schema.users.id, actor.id));
    expect(u.email).toBe("priya@new-college.test");
    expect(u.passwordHash).not.toContain(valid.password);
    const [inst] = await db.select().from(schema.institutions).where(eq(schema.institutions.id, u.institutionId!));
    expect(inst.name).toBe(valid.institutionName);
    expect(inst.isSynthetic).toBe(false);
    expect(inst.refId).toMatch(/^INST-[0-9A-F]{8}$/);

    const audits = await db.select().from(schema.auditLogs).where(eq(schema.auditLogs.actorId, actor.id));
    expect(audits.map((a) => a.action)).toEqual(expect.arrayContaining(["institution.registered", "user.registered"]));
  });

  it("lets the new applicant sign in and start a non-synthetic application", async () => {
    const { actor } = await login({ email: valid.email, password: valid.password }, "client-a");
    const [cat] = await getDb().select().from(schema.categories).limit(1);
    const app = await createApplication(actor, { categoryCode: cat.code, academicYear: "2026-27", declaredInstitutionName: valid.institutionName, declaredInstitutionRef: "INST-TEST" });
    expect(app.isSynthetic).toBe(false);
  });

  it("rejects a duplicate email", async () => {
    await expect(register({ ...valid, email: "PRIYA@new-college.test" }, "client-b")).rejects.toBeInstanceOf(AppError);
  });

  it("rejects mismatched passwords and short passwords", async () => {
    await expect(register({ ...valid, email: "x@t.test", confirmPassword: "Different@2026" }, "client-c")).rejects.toBeInstanceOf(ZodError);
    await expect(register({ ...valid, email: "y@t.test", password: "short", confirmPassword: "short" }, "client-c")).rejects.toBeInstanceOf(ZodError);
  });

  it("rate-limits repeated registrations from one client", async () => {
    for (let i = 0; i < 5; i++) await register({ ...valid, email: `bulk${i}@t.test` }, "client-d");
    await expect(register({ ...valid, email: "bulk5@t.test" }, "client-d")).rejects.toMatchObject({ code: "RATE_LIMITED" });
  });
});

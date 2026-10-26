import { asc, desc, eq, inArray } from "drizzle-orm";
import { getDb, schema } from "../db";
import { canViewInstitution, type Actor } from "../authz";
import { NotFoundError } from "../errors";
import { latestRunIds } from "./review";

export async function listInstitutions(actor: Actor, opts: { q?: string; state?: string; sort?: string; page?: number }) {
  const db = getDb();
  let rows = await db.select().from(schema.institutions).orderBy(asc(schema.institutions.name));
  rows = rows.filter((r) => canViewInstitution(actor, r.id));
  if (opts.q) {
    const q = opts.q.toLowerCase();
    rows = rows.filter((r) => r.name.toLowerCase().includes(q) || r.refId.toLowerCase().includes(q) || r.city.toLowerCase().includes(q));
  }
  if (opts.state) rows = rows.filter((r) => r.state === opts.state);
  const apps = rows.length
    ? await db
        .select({ id: schema.applications.id, institutionId: schema.applications.institutionId, createdAt: schema.applications.createdAt, status: schema.applications.status })
        .from(schema.applications)
        .where(inArray(schema.applications.institutionId, rows.map((r) => r.id)))
    : [];
  const runIds = await latestRunIds(apps.map((a) => a.id));
  const openFindings = runIds.length
    ? await db
        .select({ applicationId: schema.findings.applicationId, reviewStatus: schema.findings.reviewStatus, severity: schema.findings.severity })
        .from(schema.findings)
        .where(inArray(schema.findings.runId, runIds))
    : [];
  const docs = apps.length
    ? await db
        .select({ applicationId: schema.documents.applicationId, v: schema.documents.verificationStatus })
        .from(schema.documents)
        .where(inArray(schema.documents.applicationId, apps.map((a) => a.id)))
    : [];
  let out = rows.map((r) => {
    const ia = apps.filter((a) => a.institutionId === r.id);
    const appIds = new Set(ia.map((a) => a.id));
    const deficiencies = openFindings.filter((f) => appIds.has(f.applicationId) && !["DISMISSED", "MANUALLY_VERIFIED"].includes(f.reviewStatus) && f.severity !== "INFO").length;
    const idocs = docs.filter((d) => appIds.has(d.applicationId));
    const verified = idocs.filter((d) => ["VERIFIED_DEMO_SOURCE", "VERIFIED_BY_SOURCE", "MANUALLY_VERIFIED"].includes(d.v)).length;
    return {
      ...r,
      applicationCount: ia.length,
      lastApplication: ia.reduce<Date | null>((m, a) => (!m || a.createdAt > m ? a.createdAt : m), null),
      deficiencies,
      verification: idocs.length === 0 ? "No documents" : `${verified}/${idocs.length} verified`,
    };
  });
  if (opts.sort === "applications") out = out.sort((a, b) => b.applicationCount - a.applicationCount);
  if (opts.sort === "deficiencies") out = out.sort((a, b) => b.deficiencies - a.deficiencies);
  const pageSize = 10;
  const page = Math.max(1, opts.page ?? 1);
  return { rows: out.slice((page - 1) * pageSize, page * pageSize), total: out.length, page, pageCount: Math.max(1, Math.ceil(out.length / pageSize)), states: [...new Set(rows.map((r) => r.state))].sort() };
}

export async function getInstitution(actor: Actor, id: string) {
  if (!canViewInstitution(actor, id)) throw new NotFoundError("Institution not found.");
  const db = getDb();
  const [inst] = await db.select().from(schema.institutions).where(eq(schema.institutions.id, id));
  if (!inst) throw new NotFoundError("Institution not found.");
  const apps = await db
    .select({ id: schema.applications.id, refNo: schema.applications.refNo, status: schema.applications.status, category: schema.categories.name, updatedAt: schema.applications.updatedAt, assignedOfficerId: schema.applications.assignedOfficerId, institutionId: schema.applications.institutionId, reviewPriority: schema.applications.reviewPriority })
    .from(schema.applications)
    .innerJoin(schema.categories, eq(schema.categories.id, schema.applications.categoryId))
    .where(eq(schema.applications.institutionId, id))
    .orderBy(desc(schema.applications.updatedAt));
  return { inst, apps };
}

// All dashboard numbers are computed from database rows — nothing is hardcoded.
import { and, eq, gte, inArray, lte, type SQL } from "drizzle-orm";
import { z } from "zod";
import { getDb, schema } from "../db";
import { canViewApplication, type Actor } from "../authz";
import { STATUS_LABELS, type AppStatus } from "@/lib/constants";
import { latestRunIds } from "./review";

export const DashboardFilters = z.object({
  from: z.string().optional(),
  to: z.string().optional(),
  category: z.string().optional(),
  institution: z.string().optional(),
});

export async function getDashboard(actor: Actor, raw: unknown) {
  const f = DashboardFilters.parse(raw);
  const db = getDb();
  const A = schema.applications;
  const where: SQL[] = [];
  if (actor.role === "INSTITUTION") where.push(eq(A.institutionId, actor.institutionId ?? "__none__"));
  else if (f.institution) where.push(eq(A.institutionId, f.institution));
  if (f.category) where.push(eq(schema.categories.code, f.category));
  if (f.from) where.push(gte(A.createdAt, new Date(f.from)));
  if (f.to) where.push(lte(A.createdAt, new Date(new Date(f.to).getTime() + 86_399_999)));

  const allApps = await db
    .select({ app: A, category: schema.categories.name, categoryCode: schema.categories.code })
    .from(A)
    .innerJoin(schema.categories, eq(schema.categories.id, A.categoryId))
    .where(where.length ? and(...where) : undefined);
  const apps = allApps.filter((r) => canViewApplication(actor, r.app));
  const ids = apps.map((r) => r.app.id);

  const runIds = await latestRunIds(ids);
  const fs = runIds.length
    ? await db
        .select({ f: schema.findings, ruleType: schema.validationRules.type })
        .from(schema.findings)
        .leftJoin(schema.validationRules, eq(schema.validationRules.id, schema.findings.ruleId))
        .where(inArray(schema.findings.runId, runIds))
    : [];
  const docs = ids.length
    ? await db.select().from(schema.documents).where(and(inArray(schema.documents.applicationId, ids), eq(schema.documents.status, "ACTIVE")))
    : [];
  const alerts = ids.length
    ? await db.select().from(schema.alerts).where(and(inArray(schema.alerts.applicationId, ids), inArray(schema.alerts.status, ["OPEN", "ACKNOWLEDGED", "ESCALATED"])))
    : [];
  const docTypes = await db.select().from(schema.documentTypes);

  const startOfToday = new Date();
  startOfToday.setHours(0, 0, 0, 0);
  const sevenDaysAgo = Date.now() - 7 * 86_400_000;
  const st = (s: AppStatus | AppStatus[]) => apps.filter((r) => (Array.isArray(s) ? s : [s]).includes(r.app.status as AppStatus)).length;
  const appsWith = (pred: (x: (typeof fs)[number]) => boolean) => new Set(fs.filter(pred).map((x) => x.f.applicationId)).size;
  const openFinding = (x: (typeof fs)[number]) => !["DISMISSED", "MANUALLY_VERIFIED"].includes(x.f.reviewStatus);

  const kpis = {
    total: apps.length,
    newThisWeek: apps.filter((r) => r.app.createdAt.getTime() >= sevenDaysAgo).length,
    submittedToday: apps.filter((r) => r.app.submittedAt && r.app.submittedAt >= startOfToday).length,
    awaitingScrutiny: st(["SUBMITTED", "UNDER_REVIEW"]),
    awaitingRectification: st(["RECTIFICATION_REQUIRED", "CLARIFICATION_REQUESTED"]),
    withMissingDocs: appsWith((x) => x.ruleType === "REQUIRED_DOCUMENT" && openFinding(x)),
    expiredFindings: fs.filter((x) => x.ruleType === "DOCUMENT_EXPIRY" && x.f.result === "NOT_SATISFIED" && openFinding(x)).length,
    pendingVerification: new Set(docs.filter((d) => ["VERIFICATION_PENDING", "MANUAL_REVIEW_REQUIRED", "SOURCE_UNAVAILABLE"].includes(d.verificationStatus)).map((d) => d.applicationId)).size,
    verifiedDocsApps: ids.filter((id) => {
      const ad = docs.filter((d) => d.applicationId === id);
      return ad.length > 0 && ad.every((d) => ["VERIFIED_BY_SOURCE", "VERIFIED_DEMO_SOURCE", "MANUALLY_VERIFIED"].includes(d.verificationStatus));
    }).length,
    criticalAlerts: alerts.filter((a) => a.severity === "CRITICAL").length,
    withCritical: appsWith((x) => x.f.severity === "CRITICAL" && openFinding(x)),
    pendingDecision: st(["UNDER_REVIEW", "PENDING_EXTERNAL_VERIFICATION", "INSPECTION_RECOMMENDED"]),
    completed: st(["APPROVED", "REJECTED"]),
  };

  const countBy = <T,>(arr: T[], key: (t: T) => string) => {
    const m = new Map<string, number>();
    for (const x of arr) m.set(key(x), (m.get(key(x)) ?? 0) + 1);
    return [...m.entries()].map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value);
  };

  const missingDocs = countBy(
    fs.filter((x) => x.ruleType === "REQUIRED_DOCUMENT" && openFinding(x)),
    (x) => docTypes.find((d) => d.code === x.f.field)?.label ?? x.f.field ?? "Unknown",
  );
  const deficiencies = countBy(fs.filter(openFinding), (x) => x.f.category);

  // Processing trend: applications created vs submitted per week (last 8 weeks).
  const weeks: { name: string; created: number; submitted: number; decided: number }[] = [];
  const decisions = ids.length ? await db.select().from(schema.officialDecisions).where(inArray(schema.officialDecisions.applicationId, ids)) : [];
  for (let i = 7; i >= 0; i--) {
    const start = new Date(Date.now() - (i + 1) * 7 * 86_400_000);
    const end = new Date(Date.now() - i * 7 * 86_400_000);
    const inW = (d: Date | null) => d !== null && d >= start && d < end;
    weeks.push({
      name: end.toLocaleDateString("en-IN", { day: "2-digit", month: "short" }),
      created: apps.filter((r) => inW(r.app.createdAt)).length,
      submitted: apps.filter((r) => inW(r.app.submittedAt)).length,
      decided: decisions.filter((d) => inW(d.createdAt)).length,
    });
  }

  return {
    kpis,
    byStatus: countBy(apps, (r) => STATUS_LABELS[r.app.status as AppStatus] ?? r.app.status),
    byCategory: countBy(apps, (r) => r.category),
    byPriority: ["HIGH", "MEDIUM", "LOW"].map((p) => ({ name: `${p.charAt(0)}${p.slice(1).toLowerCase()} review priority`, value: apps.filter((r) => r.app.reviewPriority === p).length })),
    verificationOutcomes: countBy(docs, (d) => d.verificationStatus.replaceAll("_", " ").toLowerCase()),
    missingDocs,
    deficiencies: deficiencies.slice(0, 8),
    trend: weeks,
    recent: apps
      .sort((a, b) => b.app.updatedAt.getTime() - a.app.updatedAt.getTime())
      .slice(0, 6)
      .map((r) => ({ id: r.app.id, refNo: r.app.refNo, status: r.app.status, category: r.category, updatedAt: r.app.updatedAt, priority: r.app.reviewPriority })),
  };
}

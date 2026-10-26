// Payments come from a SYNTHETIC ledger. Nothing here verifies real government payments,
// and no card numbers / banking credentials are ever collected or stored.
import { desc, eq, inArray } from "drizzle-orm";
import { getDb, schema } from "../db";
import { canViewApplication, type Actor } from "../authz";
import { latestRunIds } from "./review";

export async function listPayments(actor: Actor) {
  const db = getDb();
  const apps = await db
    .select({ app: schema.applications, institution: schema.institutions.name, category: schema.categories.name, requiresPayment: schema.categories.requiresPayment })
    .from(schema.applications)
    .innerJoin(schema.institutions, eq(schema.institutions.id, schema.applications.institutionId))
    .innerJoin(schema.categories, eq(schema.categories.id, schema.applications.categoryId))
    .orderBy(desc(schema.applications.updatedAt));
  const visible = apps.filter((r) => r.requiresPayment && canViewApplication(actor, r.app));
  const refs = visible.map((r) => r.app.paymentReference).filter(Boolean);
  const ledger = refs.length
    ? await db
        .select({ p: schema.payments, refId: schema.institutions.refId })
        .from(schema.payments)
        .innerJoin(schema.institutions, eq(schema.institutions.id, schema.payments.institutionId))
        .where(inArray(schema.payments.transactionRef, refs))
    : [];
  const runIds = await latestRunIds(visible.map((r) => r.app.id));
  const paymentFindings = runIds.length
    ? await db.select().from(schema.findings).where(inArray(schema.findings.runId, runIds))
    : [];
  return visible.map((r) => {
    const l = ledger.find((x) => x.p.transactionRef === r.app.paymentReference);
    const obs = paymentFindings.filter((f) => f.applicationId === r.app.id && f.field === "paymentReference");
    let reconciliation: "MATCHED" | "MISMATCH" | "NOT_FOUND" | "NO_REFERENCE" = "NO_REFERENCE";
    if (r.app.paymentReference) {
      if (!l) reconciliation = "NOT_FOUND";
      else if (l.p.ledgerStatus !== "SUCCESS" || (r.app.paymentAmount !== null && l.p.amount !== r.app.paymentAmount) || l.p.institutionId !== r.app.institutionId) reconciliation = "MISMATCH";
      else reconciliation = "MATCHED";
    }
    return {
      applicationId: r.app.id,
      refNo: r.app.refNo,
      institution: r.institution,
      category: r.category,
      paymentReference: r.app.paymentReference,
      declaredAmount: r.app.paymentAmount,
      ledgerAmount: l?.p.amount ?? null,
      paidAt: l?.p.paidAt ?? null,
      ledgerStatus: l?.p.ledgerStatus ?? null,
      source: l ? "Synthetic ledger (demo)" : "—",
      reconciliation,
      observations: obs.map((o) => o.actualValue),
    };
  });
}

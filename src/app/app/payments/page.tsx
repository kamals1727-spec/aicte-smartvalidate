import Link from "next/link";
import { requireActorPage } from "@/server/auth/actor";
import { listPayments } from "@/server/services/payments";
import { Badge, EmptyState, PageHeader, Td, Th } from "@/components/ui";
import { formatDate, formatINR } from "@/lib/utils";

export const metadata = { title: "Payments" };

const RECON = {
  MATCHED: { label: "Reconciled with ledger", tone: "success" },
  MISMATCH: { label: "Mismatch", tone: "danger" },
  NOT_FOUND: { label: "Not found in ledger", tone: "danger" },
  NO_REFERENCE: { label: "No reference given", tone: "neutral" },
} as const;

export default async function Payments() {
  const actor = await requireActorPage();
  const rows = await listPayments(actor);
  const href = (id: string) => (actor.role === "INSTITUTION" ? `/app/applications/${id}` : `/app/review/${id}`);
  return (
    <>
      <PageHeader
        title="Payments and application fees"
        subtitle="Reconciled against a SYNTHETIC ledger. This prototype does not verify real government payments and never collects card or banking credentials. Payment status is tracked separately from document authenticity and approval."
      />
      {rows.length === 0 ? (
        <EmptyState title="No fee-bearing applications yet" />
      ) : (
        <div className="overflow-x-auto rounded-lg border border-line bg-white">
          <table className="w-full min-w-[960px]">
            <thead className="border-b border-line bg-paper">
              <tr>
                <Th>Application</Th>
                {actor.role !== "INSTITUTION" && <Th>Institution</Th>}
                <Th>Transaction reference</Th>
                <Th>Declared amount</Th>
                <Th>Ledger amount</Th>
                <Th>Payment date</Th>
                <Th>Ledger status</Th>
                <Th>Source</Th>
                <Th>Reconciliation</Th>
                <Th>Observations</Th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {rows.map((r) => (
                <tr key={r.applicationId}>
                  <Td>
                    <Link href={href(r.applicationId)} className="font-medium text-action hover:underline">
                      {r.refNo}
                    </Link>
                    <div className="text-xs text-muted">{r.category}</div>
                  </Td>
                  {actor.role !== "INSTITUTION" && <Td>{r.institution}</Td>}
                  <Td className="font-mono text-xs">{r.paymentReference || "—"}</Td>
                  <Td>{formatINR(r.declaredAmount)}</Td>
                  <Td>{formatINR(r.ledgerAmount)}</Td>
                  <Td>{formatDate(r.paidAt)}</Td>
                  <Td>{r.ledgerStatus ?? "—"}</Td>
                  <Td>{r.source}</Td>
                  <Td>
                    <Badge tone={RECON[r.reconciliation].tone}>{RECON[r.reconciliation].label}</Badge>
                  </Td>
                  <Td className="max-w-[260px] text-xs">{r.observations.join("; ") || "—"}</Td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}

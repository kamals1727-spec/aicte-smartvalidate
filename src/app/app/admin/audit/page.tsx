import Link from "next/link";
import { redirect } from "next/navigation";
import { requireActorPage } from "@/server/auth/actor";
import { listAudit } from "@/server/services/admin";
import { can } from "@/server/authz";
import { PageHeader, Td, Th, btnClass, inputClass } from "@/components/ui";
import { formatDate } from "@/lib/utils";

export const metadata = { title: "Audit trail" };

export default async function AuditPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const actor = await requireActorPage();
  if (!can(actor, "audit.view")) redirect("/app");
  const sp = await searchParams;
  const r = await listAudit(actor, { q: sp.q || undefined, entity: sp.entity || undefined, page: sp.page ?? 1 });
  const link = (page: number) => `/app/admin/audit?${new URLSearchParams({ ...(sp.q ? { q: sp.q } : {}), ...(sp.entity ? { entity: sp.entity } : {}), page: String(page) })}`;
  return (
    <>
      <PageHeader title="Audit trail" subtitle="Append-only. UPDATE and DELETE on this table are blocked by database triggers. Document contents and secrets are never logged." />
      <form method="get" className="mb-4 flex flex-wrap items-end gap-3 rounded-lg border border-line bg-white p-3">
        <label className="text-sm">
          <span className="mb-1 block text-xs text-muted">Search action, reference or actor</span>
          <input name="q" defaultValue={sp.q} className={inputClass} />
        </label>
        <label className="text-sm">
          <span className="mb-1 block text-xs text-muted">Entity</span>
          <select name="entity" defaultValue={sp.entity ?? ""} className={inputClass}>
            <option value="">All</option>
            {["application", "document", "finding", "validation_rule", "validation_run", "category", "user", "alert"].map((e) => (
              <option key={e} value={e}>
                {e.replace("_", " ")}
              </option>
            ))}
          </select>
        </label>
        <button className={btnClass("secondary")}>Filter</button>
      </form>
      <div className="overflow-x-auto rounded-lg border border-line bg-white">
        <table className="w-full min-w-[1000px]">
          <thead className="border-b border-line bg-paper">
            <tr>
              <Th>Time</Th>
              <Th>Actor</Th>
              <Th>Action</Th>
              <Th>Entity</Th>
              <Th>Change</Th>
              <Th>Reason</Th>
              <Th>Correlation</Th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {r.rows.map((a) => (
              <tr key={a.id}>
                <Td className="whitespace-nowrap text-xs">{formatDate(a.createdAt, true)}</Td>
                <Td className="text-xs">{a.actorLabel}</Td>
                <Td className="font-mono text-xs">{a.action}</Td>
                <Td className="text-xs">
                  {a.entityType}
                  {a.entityRef ? ` · ${a.entityRef}` : ""}
                </Td>
                <Td className="max-w-[260px] break-words text-xs">{a.previousState || a.newState ? `${a.previousState || "—"} → ${a.newState || "—"}` : "—"}</Td>
                <Td className="max-w-[260px] break-words text-xs">{a.reason || "—"}</Td>
                <Td className="font-mono text-[11px] text-muted">{a.correlationId ? a.correlationId.slice(0, 8) : "—"}</Td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <nav className="mt-4 flex justify-center gap-2">
        {r.page > 1 && <Link href={link(r.page - 1)} className={btnClass("secondary", "sm")}>Newer</Link>}
        {r.hasMore && <Link href={link(r.page + 1)} className={btnClass("secondary", "sm")}>Older</Link>}
      </nav>
    </>
  );
}

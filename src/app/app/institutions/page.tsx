import Link from "next/link";
import { redirect } from "next/navigation";
import { requireActorPage } from "@/server/auth/actor";
import { listInstitutions } from "@/server/services/institutions";
import { Badge, EmptyState, PageHeader, Td, Th, btnClass, inputClass } from "@/components/ui";
import { formatDate } from "@/lib/utils";

export const metadata = { title: "Institutions" };

export default async function Institutions({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const actor = await requireActorPage();
  if (actor.role === "INSTITUTION") redirect(`/app/institutions/${actor.institutionId}`);
  const sp = await searchParams;
  const r = await listInstitutions(actor, { q: sp.q, state: sp.state, sort: sp.sort, page: Number(sp.page) || 1 });
  const link = (page: number) => `/app/institutions?${new URLSearchParams({ ...(sp.q ? { q: sp.q } : {}), ...(sp.state ? { state: sp.state } : {}), ...(sp.sort ? { sort: sp.sort } : {}), page: String(page) })}`;
  return (
    <>
      <PageHeader title="Institution directory" subtitle="Synthetic demonstration records only — no real AICTE approval data is shown or implied." />
      <form method="get" className="mb-4 flex flex-wrap items-end gap-3 rounded-lg border border-line bg-white p-3">
        <label className="text-sm">
          <span className="mb-1 block text-xs text-muted">Search</span>
          <input name="q" defaultValue={sp.q} placeholder="Name, ID or city" className={inputClass} />
        </label>
        <label className="text-sm">
          <span className="mb-1 block text-xs text-muted">State</span>
          <select name="state" defaultValue={sp.state ?? ""} className={inputClass}>
            <option value="">All states</option>
            {r.states.map((s) => (
              <option key={s}>{s}</option>
            ))}
          </select>
        </label>
        <label className="text-sm">
          <span className="mb-1 block text-xs text-muted">Sort by</span>
          <select name="sort" defaultValue={sp.sort ?? ""} className={inputClass}>
            <option value="">Name</option>
            <option value="applications">Application count</option>
            <option value="deficiencies">Outstanding deficiencies</option>
          </select>
        </label>
        <button className={btnClass("secondary")}>Apply</button>
      </form>
      {r.rows.length === 0 ? (
        <EmptyState title="No institutions match" />
      ) : (
        <div className="overflow-x-auto rounded-lg border border-line bg-white">
          <table className="w-full min-w-[900px]">
            <thead className="border-b border-line bg-paper">
              <tr>
                <Th>Institution</Th>
                <Th>Reference ID</Th>
                <Th>Location</Th>
                <Th>Applications</Th>
                <Th>Approval status (synthetic)</Th>
                <Th>Last application</Th>
                <Th>Document verification</Th>
                <Th>Open deficiencies</Th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {r.rows.map((i) => (
                <tr key={i.id} className="hover:bg-navy-50/50">
                  <Td>
                    <Link href={`/app/institutions/${i.id}`} className="font-medium text-action hover:underline">
                      {i.name}
                    </Link>
                  </Td>
                  <Td className="tabular-nums">{i.refId}</Td>
                  <Td>
                    {i.city}, {i.state}
                  </Td>
                  <Td>{i.applicationCount}</Td>
                  <Td>{i.approvalStatus}</Td>
                  <Td>{formatDate(i.lastApplication)}</Td>
                  <Td>{i.verification}</Td>
                  <Td>{i.deficiencies > 0 ? <Badge tone="warning">{i.deficiencies}</Badge> : <span className="text-muted">0</span>}</Td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {r.pageCount > 1 && (
        <nav className="mt-4 flex justify-center gap-2">
          {r.page > 1 && <Link href={link(r.page - 1)} className={btnClass("secondary", "sm")}>Previous</Link>}
          <Badge>
            Page {r.page} / {r.pageCount}
          </Badge>
          {r.page < r.pageCount && <Link href={link(r.page + 1)} className={btnClass("secondary", "sm")}>Next</Link>}
        </nav>
      )}
    </>
  );
}

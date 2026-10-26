import Link from "next/link";
import { redirect } from "next/navigation";
import { asc } from "drizzle-orm";
import { requireActorPage } from "@/server/auth/actor";
import { getQueue, listOfficers } from "@/server/services/review";
import { can } from "@/server/authz";
import { getDb, schema } from "@/server/db";
import { Badge, EmptyState, PageHeader, btnClass, inputClass } from "@/components/ui";
import { QueueTable } from "./queue-table";
import { QUEUE_STATUSES, STATUS_LABELS } from "@/lib/constants";

export const metadata = { title: "Application queue" };

export default async function QueuePage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const actor = await requireActorPage();
  if (!can(actor, "queue.view")) redirect("/app");
  const sp = await searchParams;
  const clean = Object.fromEntries(Object.entries(sp).filter(([, v]) => v !== undefined && v !== ""));
  const q = await getQueue(actor, clean);
  const officers = await listOfficers();
  const cats = await getDb().select({ code: schema.categories.code, name: schema.categories.name }).from(schema.categories).orderBy(asc(schema.categories.name));
  const canAssign = can(actor, "application.assign");
  const qs = (patch: Record<string, string | number | undefined>) => {
    const p = new URLSearchParams(clean as Record<string, string>);
    for (const [k, v] of Object.entries(patch)) {
      if (v === undefined || v === "") p.delete(k);
      else p.set(k, String(v));
    }
    return `/app/queue?${p.toString()}`;
  };

  return (
    <>
      <PageHeader
        title="Application queue"
        subtitle={actor.role === "OFFICER" ? "Submitted applications assigned to you, plus unassigned cases in the review pool." : "All applications in official scrutiny."}
      />
      <form method="get" className="mb-4 grid gap-3 rounded-lg border border-line bg-white p-3 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-8">
        <label className="text-sm xl:col-span-2">
          <span className="mb-1 block text-xs text-muted">Search</span>
          <input name="q" defaultValue={sp.q} placeholder="Reference no. or institution" className={inputClass} />
        </label>
        <Select name="status" label="Status" value={sp.status} options={QUEUE_STATUSES.map((s) => [s, STATUS_LABELS[s]])} />
        <Select name="category" label="Category" value={sp.category} options={cats.map((c) => [c.code, c.name])} />
        <Select name="priority" label="Review priority" value={sp.priority} options={[["HIGH", "High"], ["MEDIUM", "Medium"], ["LOW", "Low"]]} />
        <Select name="verification" label="Document verification" value={sp.verification} options={[["pending", "Pending"], ["issues", "Mismatch / expired"], ["all_verified", "All verified"]]} />
        <Select name="officer" label="Assigned officer" value={sp.officer} options={[["unassigned", "Unassigned"], ...officers.map((o) => [o.id, o.name] as [string, string])]} />
        <div className="flex gap-2 sm:col-span-2 lg:col-span-1">
          <label className="text-sm">
            <span className="mb-1 block text-xs text-muted">Submitted from</span>
            <input type="date" name="from" defaultValue={sp.from} className={inputClass} />
          </label>
        </div>
        <label className="text-sm">
          <span className="mb-1 block text-xs text-muted">Submitted to</span>
          <input type="date" name="to" defaultValue={sp.to} className={inputClass} />
        </label>
        <input type="hidden" name="sort" value={q.filters.sort} />
        <input type="hidden" name="dir" value={q.filters.dir} />
        <div className="flex items-end gap-2">
          <button className={btnClass("secondary")}>Filter</button>
          <Link href="/app/queue" className={btnClass("ghost")}>
            Reset
          </Link>
        </div>
      </form>

      <div className="mb-2 flex flex-wrap items-center justify-between gap-2 text-sm text-muted">
        <span>
          {q.total} application(s) · page {q.page} of {q.pageCount}
        </span>
        <span className="flex flex-wrap items-center gap-2">
          Sort:
          {(
            [
              ["priority", "Priority"],
              ["submitted", "Submitted"],
              ["updated", "Updated"],
              ["ref", "Reference"],
            ] as const
          ).map(([k, l]) => (
            <Link key={k} href={qs({ sort: k, dir: q.filters.sort === k && q.filters.dir === "desc" ? "asc" : "desc", page: 1 })} className={q.filters.sort === k ? "font-medium text-action" : "hover:text-action"}>
              {l}
              {q.filters.sort === k ? (q.filters.dir === "desc" ? " ↓" : " ↑") : ""}
            </Link>
          ))}
        </span>
      </div>

      {q.rows.length === 0 ? (
        <EmptyState title="No applications match these filters">Clear a filter, or check back when institutions submit new applications.</EmptyState>
      ) : (
        <QueueTable
          rows={q.rows.map((r) => ({ ...r, submittedAt: r.submittedAt?.toISOString() ?? null, updatedAt: r.updatedAt.toISOString() }))}
          officers={officers}
          canAssign={canAssign}
        />
      )}

      {q.pageCount > 1 && (
        <nav className="mt-4 flex items-center justify-center gap-2" aria-label="Pagination">
          {q.page > 1 && (
            <Link className={btnClass("secondary", "sm")} href={qs({ page: q.page - 1 })}>
              Previous
            </Link>
          )}
          <Badge>
            Page {q.page} / {q.pageCount}
          </Badge>
          {q.page < q.pageCount && (
            <Link className={btnClass("secondary", "sm")} href={qs({ page: q.page + 1 })}>
              Next
            </Link>
          )}
        </nav>
      )}
    </>
  );
}

function Select({ name, label, value, options }: { name: string; label: string; value?: string; options: [string, string][] }) {
  return (
    <label className="text-sm">
      <span className="mb-1 block text-xs text-muted">{label}</span>
      <select name={name} defaultValue={value ?? ""} className={inputClass}>
        <option value="">All</option>
        {options.map(([v, l]) => (
          <option key={v} value={v}>
            {l}
          </option>
        ))}
      </select>
    </label>
  );
}

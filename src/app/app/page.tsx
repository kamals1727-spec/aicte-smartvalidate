import Link from "next/link";
import { asc } from "drizzle-orm";
import { requireActorPage } from "@/server/auth/actor";
import { getDashboard } from "@/server/services/dashboard";
import { getDb, schema } from "@/server/db";
import { Badge, Card, LinkButton, PageHeader, Stat, btnClass, inputClass } from "@/components/ui";
import { HBar, Trend } from "@/components/charts";
import { STATUS_LABELS, STATUS_TONE, type AppStatus } from "@/lib/constants";
import { formatDate } from "@/lib/utils";

export const metadata = { title: "Dashboard" };

type SP = Promise<Record<string, string | undefined>>;

export default async function Dashboard({ searchParams }: { searchParams: SP }) {
  const actor = await requireActorPage();
  const sp = await searchParams;
  const d = await getDashboard(actor, sp);
  const db = getDb();
  const cats = await db.select({ code: schema.categories.code, name: schema.categories.name }).from(schema.categories).orderBy(asc(schema.categories.name));
  const insts = actor.role === "INSTITUTION" ? [] : await db.select({ id: schema.institutions.id, name: schema.institutions.name }).from(schema.institutions).orderBy(asc(schema.institutions.name));
  const isInst = actor.role === "INSTITUTION";
  const k = d.kpis;
  const appHref = (id: string) => (isInst ? `/app/applications/${id}` : `/app/review/${id}`);

  return (
    <>
      <PageHeader
        title={isInst ? "Institution dashboard" : actor.role === "ADMIN" ? "Organisation overview" : "Scrutiny dashboard"}
        subtitle="All figures are calculated from the records in the database for the selected period."
        actions={isInst ? <LinkButton href="/app/applications/new">New application</LinkButton> : <LinkButton href="/app/queue">Open queue</LinkButton>}
      />

      <form className="mb-6 flex flex-wrap items-end gap-3 rounded-lg border border-line bg-white p-3" method="get">
        <label className="text-sm">
          <span className="mb-1 block text-xs text-muted">From</span>
          <input type="date" name="from" defaultValue={sp.from} className={inputClass} />
        </label>
        <label className="text-sm">
          <span className="mb-1 block text-xs text-muted">To</span>
          <input type="date" name="to" defaultValue={sp.to} className={inputClass} />
        </label>
        <label className="text-sm">
          <span className="mb-1 block text-xs text-muted">Category</span>
          <select name="category" defaultValue={sp.category ?? ""} className={inputClass}>
            <option value="">All categories</option>
            {cats.map((c) => (
              <option key={c.code} value={c.code}>
                {c.name}
              </option>
            ))}
          </select>
        </label>
        {!isInst && (
          <label className="text-sm">
            <span className="mb-1 block text-xs text-muted">Institution</span>
            <select name="institution" defaultValue={sp.institution ?? ""} className={inputClass}>
              <option value="">All institutions</option>
              {insts.map((i) => (
                <option key={i.id} value={i.id}>
                  {i.name}
                </option>
              ))}
            </select>
          </label>
        )}
        <button className={btnClass("secondary")}>Apply filters</button>
        {(sp.from || sp.to || sp.category || sp.institution) && (
          <Link href="/app" className={btnClass("ghost")}>
            Clear
          </Link>
        )}
      </form>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4 xl:grid-cols-6">
        <Stat label="Total applications" value={k.total} />
        <Stat label="New in last 7 days" value={k.newThisWeek} />
        <Stat label="Submitted today" value={k.submittedToday} />
        <Stat label="Awaiting scrutiny" value={k.awaitingScrutiny} tone="warning" href={isInst ? undefined : "/app/queue?status=SUBMITTED"} />
        <Stat label="Awaiting institution rectification" value={k.awaitingRectification} tone="warning" />
        <Stat label="With critical deficiencies" value={k.withCritical} tone="danger" />
        <Stat label="With missing mandatory documents" value={k.withMissingDocs} tone="danger" />
        <Stat label="Expired-document findings" value={k.expiredFindings} tone="danger" />
        <Stat label="Pending source / manual verification" value={k.pendingVerification} tone="warning" />
        <Stat label="All documents verified" value={k.verifiedDocsApps} tone="success" />
        <Stat label="Pending official decision" value={k.pendingDecision} />
        <Stat label="Decided (approved / rejected)" value={k.completed} tone="success" />
      </div>

      <div className="mt-6 grid gap-6 xl:grid-cols-2">
        <Card title="Applications by status">
          <HBar data={d.byStatus} />
        </Card>
        <Card title="Applications by category">
          <HBar data={d.byCategory} />
        </Card>
        <Card title="Review priority" description="Documented rule-based score to order human review. Not a probability of fraud.">
          <HBar data={d.byPriority} colors={{ "High review priority": "#b42318", "Medium review priority": "#c98a1b", "Low review priority": "#7fa2d6" }} />
        </Card>
        <Card title="Document verification outcomes" description="Includes demo-source and manual verification results.">
          <HBar data={d.verificationOutcomes} />
        </Card>
        <Card title="Missing mandatory documents" description="Open findings from the latest validation run of each application.">
          <HBar data={d.missingDocs} />
        </Card>
        <Card title="Deficiencies by rule" description="Open findings, grouped by the rule that raised them.">
          <HBar data={d.deficiencies} />
        </Card>
      </div>

      <div className="mt-6 grid gap-6 xl:grid-cols-[2fr_1fr]">
        <Card title="Processing trend (last 8 weeks)">
          <Trend data={d.trend} />
        </Card>
        <Card title="Recently updated">
          {d.recent.length === 0 ? (
            <p className="text-sm text-muted">No applications yet.</p>
          ) : (
            <ul className="divide-y divide-line">
              {d.recent.map((r) => (
                <li key={r.id} className="py-2.5">
                  <Link href={appHref(r.id)} className="font-medium text-action hover:underline">
                    {r.refNo}
                  </Link>
                  <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted">
                    <Badge tone={STATUS_TONE[r.status as AppStatus]}>{STATUS_LABELS[r.status as AppStatus]}</Badge>
                    <span>{r.category}</span>
                    <span>{formatDate(r.updatedAt)}</span>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </>
  );
}

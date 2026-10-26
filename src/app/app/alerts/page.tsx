import Link from "next/link";
import { and, eq, inArray } from "drizzle-orm";
import { requireActorPage } from "@/server/auth/actor";
import { listAlerts } from "@/server/services/alerts";
import { can } from "@/server/authz";
import { getDb, schema } from "@/server/db";
import { Badge, EmptyState, PageHeader, btnClass, inputClass } from "@/components/ui";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { alertActionAction } from "@/app/actions";
import { SEVERITY_TONE, type Severity } from "@/lib/constants";
import { cn, formatDate } from "@/lib/utils";

export const metadata = { title: "Alerts & cases" };

export default async function AlertsPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const actor = await requireActorPage();
  const sp = await searchParams;
  const alerts = await listAlerts(actor, { severity: sp.severity || undefined, status: sp.status || undefined, mine: sp.mine });
  const manage = can(actor, "alert.manage");
  const staff = manage
    ? await getDb()
        .select({ id: schema.users.id, name: schema.users.name })
        .from(schema.users)
        .where(and(inArray(schema.users.role, ["OFFICER", "ADMIN"]), eq(schema.users.active, true)))
    : [];
  const counts = ["CRITICAL", "HIGH", "MEDIUM", "LOW"].map((s) => [s, alerts.filter((a) => a.severity === s).length] as const);
  const caseHref = (id: string) => (actor.role === "INSTITUTION" ? `/app/applications/${id}` : `/app/review/${id}`);

  return (
    <>
      <PageHeader
        title="Alerts & cases"
        subtitle="Raised automatically for critical and high-severity findings. Severity comes from the configured rule, never from the AI model."
      />
      <div className="mb-4 flex flex-wrap items-center gap-2">
        {counts.map(([s, n]) => (
          <Link key={s} href={`/app/alerts?severity=${s}${sp.status ? `&status=${sp.status}` : ""}`} className={cn("rounded-md border px-3 py-1.5 text-sm", sp.severity === s ? "border-action bg-navy-50" : "border-line bg-white")}>
            {s.charAt(0) + s.slice(1).toLowerCase()} <span className="ml-1 font-semibold tabular-nums">{n}</span>
          </Link>
        ))}
        <form method="get" className="ml-auto flex items-center gap-2">
          {sp.severity && <input type="hidden" name="severity" value={sp.severity} />}
          <select name="status" defaultValue={sp.status ?? ""} aria-label="Alert status" className={cn(inputClass, "w-auto py-1.5")}>
            <option value="">Open, acknowledged & escalated</option>
            <option value="OPEN">Open</option>
            <option value="ACKNOWLEDGED">Acknowledged</option>
            <option value="ESCALATED">Escalated</option>
            <option value="RESOLVED">Resolved</option>
          </select>
          {manage && (
            <label className="flex items-center gap-1 text-sm">
              <input type="checkbox" name="mine" value="1" defaultChecked={sp.mine === "1"} /> Assigned to me
            </label>
          )}
          <button className={btnClass("secondary", "sm")}>Apply</button>
          <Link href="/app/alerts" className={btnClass("ghost", "sm")}>
            Reset
          </Link>
        </form>
      </div>

      {alerts.length === 0 ? (
        <EmptyState title="No alerts for these filters">Alerts appear when a validation run finds a critical or high-severity issue.</EmptyState>
      ) : (
        <div className="space-y-3">
          {alerts.map((a) => (
            <article key={a.id} className="rounded-lg border border-line bg-white">
              <div className="flex flex-wrap items-start justify-between gap-3 p-4">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge tone={SEVERITY_TONE[a.severity as Severity]}>{a.severity.charAt(0) + a.severity.slice(1).toLowerCase()}</Badge>
                    <Badge tone={a.status === "RESOLVED" ? "success" : a.status === "ESCALATED" ? "danger" : a.status === "ACKNOWLEDGED" ? "info" : "warning"}>{a.status.charAt(0) + a.status.slice(1).toLowerCase()}</Badge>
                    <span className="text-xs text-muted">
                      {a.refNo} · <Link href={caseHref(a.applicationId)} className="text-action hover:underline">{a.refNoApp}</Link> · {a.institution}
                    </span>
                  </div>
                  <h3 className="mt-2 font-medium">{a.title}</h3>
                  <dl className="mt-2 grid gap-x-6 gap-y-1.5 text-sm md:grid-cols-2">
                    <div>
                      <dt className="text-xs text-muted">Why it matters</dt>
                      <dd>{a.whyItMatters}</dd>
                    </div>
                    <div>
                      <dt className="text-xs text-muted">Involves</dt>
                      <dd>
                        {a.category} ({a.ruleCode ?? "rule"}){a.documentName ? ` · ${a.documentName}` : ""}
                        {a.field ? ` · ${a.field}` : ""}
                        {a.findingRef && (
                          <Link href={`${caseHref(a.applicationId)}#${a.findingRef}`} className="ml-1 text-action hover:underline">
                            {a.findingRef}
                          </Link>
                        )}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-xs text-muted">Evidence</dt>
                      <dd className="break-words font-mono text-xs">{a.evidence || "—"}</dd>
                    </div>
                    <div>
                      <dt className="text-xs text-muted">Recommended action</dt>
                      <dd>{a.recommendedAction}</dd>
                    </div>
                    <div>
                      <dt className="text-xs text-muted">Responsible</dt>
                      <dd>
                        {a.responsibleParty === "INSTITUTION" ? "Institution (to rectify)" : "Scrutiny officer (to verify)"}
                        {a.assigneeName ? ` · assigned to ${a.assigneeName}` : ""}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-xs text-muted">Raised</dt>
                      <dd>{formatDate(a.createdAt, true)}</dd>
                    </div>
                  </dl>
                </div>
              </div>
              <details className="border-t border-line">
                <summary className="cursor-pointer px-4 py-2 text-sm text-action">History ({a.events.length}){a.status !== "RESOLVED" ? " and actions" : ""}</summary>
                <div className="space-y-3 px-4 pb-4">
                  <ul className="space-y-1 text-xs text-muted">
                    {a.events.map((e) => (
                      <li key={e.id}>
                        {formatDate(e.createdAt, true)} · {e.actorLabel} · {e.action.toLowerCase()}
                        {e.comment ? ` — ${e.comment}` : ""}
                      </li>
                    ))}
                  </ul>
                  {a.status !== "RESOLVED" && (
                    <ActionForm action={alertActionAction} resetOnSuccess className="grid gap-2 md:grid-cols-[180px_200px_1fr_auto]">
                      <input type="hidden" name="alertId" value={a.id} />
                      <select name="action" aria-label="Alert action" className={inputClass}>
                        {manage ? (
                          <>
                            <option value="ACKNOWLEDGE">Acknowledge</option>
                            <option value="ASSIGN">Assign</option>
                            <option value="COMMENT">Comment</option>
                            <option value="ESCALATE">Escalate</option>
                            <option value="RESOLVE">Resolve</option>
                          </>
                        ) : (
                          <option value="COMMENT">Comment</option>
                        )}
                      </select>
                      {manage ? (
                        <select name="assigneeId" aria-label="Assignee (for Assign)" className={inputClass} defaultValue="">
                          <option value="">Assignee (for Assign)</option>
                          {staff.map((s) => (
                            <option key={s.id} value={s.id}>
                              {s.name}
                            </option>
                          ))}
                        </select>
                      ) : (
                        <span />
                      )}
                      <input name="comment" placeholder="Comment (required for comment / escalate / resolve)" aria-label="Comment" className={inputClass} />
                      <SubmitButton size="sm">Save</SubmitButton>
                    </ActionForm>
                  )}
                </div>
              </details>
            </article>
          ))}
        </div>
      )}
    </>
  );
}

import { redirect } from "next/navigation";
import { requireActorPage } from "@/server/auth/actor";
import { getActiveRuleset } from "@/server/services/admin";
import { can } from "@/server/authz";
import { Badge, Card, PageHeader, inputClass } from "@/components/ui";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { updateRuleAction } from "@/app/actions";
import { RULE_TYPES, SEVERITIES, SEVERITY_TONE, type RuleType, type Severity } from "@/lib/constants";
import { formatDate } from "@/lib/utils";

export const metadata = { title: "Validation rules" };

export default async function RulesPage() {
  const actor = await requireActorPage();
  if (!can(actor, "admin.rules")) redirect("/app");
  const { versions, active, rules } = await getActiveRuleset(actor);
  return (
    <>
      <PageHeader
        title="Validation rules"
        subtitle="DEMO rules for illustration — not official AICTE regulations or thresholds. Each change publishes a new ruleset version; past validation runs keep pointing at the exact version that produced their findings."
        actions={active ? <Badge tone="navy" className="px-3 py-1 text-sm">Active: {active.version}</Badge> : undefined}
      />
      <div className="grid gap-6 xl:grid-cols-[1fr_300px]">
        <div className="space-y-3">
          {rules.map((r) => (
            <details key={r.id} className="rounded-lg border border-line bg-white">
              <summary className="flex cursor-pointer flex-wrap items-center gap-2 px-4 py-3">
                <span className="font-mono text-xs text-muted">{r.ruleCode}</span>
                <span className="font-medium">{r.title}</span>
                <Badge tone={SEVERITY_TONE[r.severity as Severity]}>{r.severity.charAt(0) + r.severity.slice(1).toLowerCase()}</Badge>
                {!r.active && <Badge>Inactive</Badge>}
                <span className="ml-auto text-xs text-muted">{RULE_TYPES[r.type as RuleType] ?? r.type}</span>
              </summary>
              <div className="border-t border-line px-4 py-3 text-sm">
                <p>{r.description}</p>
                <p className="mt-1 text-xs text-muted">
                  Source: {r.sourceReference} · applies to: {r.categories === "*" ? "all categories" : r.categories} · effective {formatDate(r.effectiveDate)}
                </p>
                <ActionForm action={updateRuleAction} className="mt-3 grid gap-3 md:grid-cols-2">
                  <input type="hidden" name="ruleId" value={r.id} />
                  <label className="text-sm">
                    <span className="mb-1 block text-xs text-muted">Severity</span>
                    <select name="severity" defaultValue={r.severity} className={inputClass}>
                      {SEVERITIES.map((s) => (
                        <option key={s} value={s}>
                          {s.charAt(0) + s.slice(1).toLowerCase()}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="text-sm">
                    <span className="mb-1 block text-xs text-muted">Applies to categories (* or codes)</span>
                    <input name="categories" defaultValue={r.categories} className={inputClass} />
                  </label>
                  <label className="text-sm md:col-span-2">
                    <span className="mb-1 block text-xs text-muted">Parameters (JSON)</span>
                    <textarea name="params" defaultValue={r.params} rows={2} className={`${inputClass} font-mono text-xs`} />
                  </label>
                  <label className="flex items-center gap-2 text-sm">
                    <input type="checkbox" name="active" defaultChecked={r.active} /> Rule active
                  </label>
                  <label className="text-sm">
                    <span className="mb-1 block text-xs text-muted">Reason for change (audit log)</span>
                    <input name="note" className={inputClass} />
                  </label>
                  <div className="md:col-span-2">
                    <SubmitButton size="sm">Publish change as new version</SubmitButton>
                  </div>
                </ActionForm>
              </div>
            </details>
          ))}
        </div>
        <Card title="Ruleset versions">
          <ul className="space-y-2 text-sm">
            {versions.map((v) => (
              <li key={v.id}>
                <div className="flex items-center gap-2">
                  <span className="font-medium">{v.version}</span>
                  {v.active && <Badge tone="success">Active</Badge>}
                </div>
                <p className="text-xs text-muted">
                  {formatDate(v.createdAt, true)} — {v.notes}
                </p>
              </li>
            ))}
          </ul>
        </Card>
      </div>
    </>
  );
}

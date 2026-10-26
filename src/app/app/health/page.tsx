import { redirect } from "next/navigation";
import { requireActorPage } from "@/server/auth/actor";
import { getHealth, type HealthState } from "@/server/services/health";
import { can } from "@/server/authz";
import { Badge, Card, PageHeader, Td, Th } from "@/components/ui";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { testAiAction } from "@/app/actions";
import { formatDate } from "@/lib/utils";

export const metadata = { title: "System health" };

const TONE: Record<HealthState, "success" | "warning" | "neutral" | "danger"> = {
  Operational: "success",
  Degraded: "warning",
  "Not configured": "neutral",
  Unavailable: "danger",
  Unknown: "neutral",
};

export default async function HealthPage() {
  const actor = await requireActorPage();
  if (!can(actor, "health.view")) redirect("/app");
  const h = await getHealth(actor);
  return (
    <>
      <PageHeader
        title="System health & engine"
        subtitle={`Version ${h.version}. Statuses reflect actual checks — nothing is reported as operational unless it was checked.`}
        actions={<Badge tone={TONE[h.overall]} className="px-3 py-1 text-sm">Core services: {h.overall.toLowerCase()}</Badge>}
      />
      <div className="grid gap-6 xl:grid-cols-[1.2fr_1fr]">
        <Card
          title="Components"
          actions={
            can(actor, "health.testAi") ? (
              <ActionForm action={testAiAction}>
                <SubmitButton size="sm" variant="secondary" pendingText="Testing…">
                  Test AI connection
                </SubmitButton>
              </ActionForm>
            ) : undefined
          }
        >
          <ul className="divide-y divide-line">
            {h.checks.map((c) => (
              <li key={c.name} className="flex flex-wrap items-start justify-between gap-2 py-2.5">
                <div>
                  <div className="text-sm font-medium">{c.name}</div>
                  <div className="text-xs text-muted">{c.detail}</div>
                </div>
                <Badge tone={TONE[c.state]}>{c.state}</Badge>
              </li>
            ))}
            <li className="py-2.5 text-xs text-muted">Background jobs: {h.backgroundJobs}</li>
          </ul>
        </Card>
        <div className="space-y-6">
          <Card title="Recent processing failures (7 days)">
            {h.recentFailures.length === 0 ? (
              <p className="text-sm text-muted">None recorded.</p>
            ) : (
              <ul className="space-y-1.5 text-sm">
                {h.recentFailures.map((f, i) => (
                  <li key={i}>
                    <span className="text-xs text-muted">{formatDate(f.at, true)}</span> · <span className="font-mono text-xs">{f.action}</span> · {f.ref} <span className="text-muted">{f.reason}</span>
                  </li>
                ))}
              </ul>
            )}
          </Card>
          <Card title="Recent AI provider errors">
            {h.aiErrors.length === 0 ? (
              <p className="text-sm text-muted">None recorded.</p>
            ) : (
              <ul className="space-y-1 text-sm">
                {h.aiErrors.map((e, i) => (
                  <li key={i}>
                    {formatDate(e.at, true)} · {e.provider} · <span className="font-mono text-xs">{e.code}</span>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>
      </div>
      <Card title={`Recent validation runs · average ${(h.avgMs / 1000).toFixed(1)}s`} className="mt-6">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[600px]">
            <thead>
              <tr>
                <Th>Time</Th>
                <Th>Application</Th>
                <Th>Status</Th>
                <Th>AI mode</Th>
                <Th>Findings</Th>
                <Th>Duration</Th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {h.recentRuns.map((r, i) => (
                <tr key={i}>
                  <Td className="text-xs">{formatDate(r.at, true)}</Td>
                  <Td>{r.ref}</Td>
                  <Td>{r.status}</Td>
                  <Td>{r.mode}</Td>
                  <Td>{r.findings}</Td>
                  <Td>{(r.ms / 1000).toFixed(1)}s</Td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </>
  );
}

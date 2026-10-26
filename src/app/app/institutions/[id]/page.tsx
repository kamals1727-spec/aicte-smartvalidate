import Link from "next/link";
import { notFound } from "next/navigation";
import { requireActorPage } from "@/server/auth/actor";
import { getInstitution } from "@/server/services/institutions";
import { canViewApplication } from "@/server/authz";
import { NotFoundError } from "@/server/errors";
import { Badge, Card, DL, PageHeader } from "@/components/ui";
import { STATUS_LABELS, STATUS_TONE, type AppStatus } from "@/lib/constants";
import { formatDate } from "@/lib/utils";

export const metadata = { title: "Institution" };

export default async function InstitutionDetail({ params }: { params: Promise<{ id: string }> }) {
  const actor = await requireActorPage();
  const { id } = await params;
  let r;
  try {
    r = await getInstitution(actor, id);
  } catch (e) {
    if (e instanceof NotFoundError) notFound();
    throw e;
  }
  const { inst, apps } = r;
  const visible = apps.filter((a) => canViewApplication(actor, a));
  const href = (aid: string) => (actor.role === "INSTITUTION" ? `/app/applications/${aid}` : `/app/review/${aid}`);
  return (
    <>
      <PageHeader crumbs={actor.role === "INSTITUTION" ? undefined : [{ href: "/app/institutions", label: "Institutions" }, { label: inst.refId }]} title={inst.name} subtitle={`${inst.refId} · ${inst.city}, ${inst.state}`} actions={<Badge tone="neutral">Synthetic demo record</Badge>} />
      <div className="grid gap-6 lg:grid-cols-[1fr_1.4fr]">
        <Card title="Record">
          <DL
            items={[
              ["Reference ID", inst.refId],
              ["Address", inst.address],
              ["Affiliated university / board", inst.affiliatedUniversity],
              ["Approval status (synthetic)", inst.approvalStatus],
              ["Contact email", inst.contactEmail],
              ["Contact phone", inst.contactPhone],
            ]}
          />
        </Card>
        <Card title={`Applications (${visible.length}${visible.length !== apps.length ? ` of ${apps.length} — others not in your scrutiny scope` : ""})`}>
          {visible.length === 0 ? (
            <p className="text-sm text-muted">No applications visible to you.</p>
          ) : (
            <ul className="divide-y divide-line">
              {visible.map((a) => (
                <li key={a.id} className="flex flex-wrap items-center justify-between gap-2 py-2.5">
                  <div>
                    <Link href={href(a.id)} className="font-medium text-action hover:underline">
                      {a.refNo}
                    </Link>
                    <div className="text-xs text-muted">
                      {a.category} · updated {formatDate(a.updatedAt)}
                    </div>
                  </div>
                  <Badge tone={STATUS_TONE[a.status as AppStatus]}>{STATUS_LABELS[a.status as AppStatus]}</Badge>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </>
  );
}

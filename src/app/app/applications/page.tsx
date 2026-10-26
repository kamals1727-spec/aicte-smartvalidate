import Link from "next/link";
import { redirect } from "next/navigation";
import { requireActorPage } from "@/server/auth/actor";
import { listOwnApplications } from "@/server/services/applications";
import { Badge, EmptyState, LinkButton, PageHeader, Td, Th } from "@/components/ui";
import { STATUS_LABELS, STATUS_TONE, type AppStatus } from "@/lib/constants";
import { formatDate } from "@/lib/utils";

export const metadata = { title: "My applications" };

export default async function MyApplications({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const actor = await requireActorPage();
  if (actor.role !== "INSTITUTION") redirect("/app/queue");
  const { q } = await searchParams;
  let rows = await listOwnApplications(actor);
  if (q) rows = rows.filter((r) => r.refNo.toLowerCase().includes(q.toLowerCase()) || r.category.toLowerCase().includes(q.toLowerCase()));
  return (
    <>
      <PageHeader title="My applications" subtitle="Your institution's application history. Other institutions' records are never visible here." actions={<LinkButton href="/app/applications/new">New application</LinkButton>} />
      {rows.length === 0 ? (
        <EmptyState title={q ? `No applications match "${q}"` : "No applications yet"} action={<LinkButton href="/app/applications/new">Start an application</LinkButton>}>
          Start with the category you are applying under — the document checklist follows from it.
        </EmptyState>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-line bg-white">
          <table className="w-full min-w-[720px]">
            <thead className="border-b border-line bg-paper">
              <tr>
                <Th>Reference</Th>
                <Th>Category</Th>
                <Th>Academic year</Th>
                <Th>Status</Th>
                <Th>Submitted</Th>
                <Th>Last updated</Th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {rows.map((r) => (
                <tr key={r.id} className="hover:bg-navy-50/50">
                  <Td>
                    <Link href={`/app/applications/${r.id}`} className="font-medium text-action hover:underline">
                      {r.refNo}
                    </Link>
                  </Td>
                  <Td>{r.category}</Td>
                  <Td>{r.academicYear}</Td>
                  <Td>
                    <Badge tone={STATUS_TONE[r.status as AppStatus]}>{STATUS_LABELS[r.status as AppStatus]}</Badge>
                  </Td>
                  <Td>{formatDate(r.submittedAt)}</Td>
                  <Td>{formatDate(r.updatedAt, true)}</Td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}

import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { requireActorPage } from "@/server/auth/actor";
import { listActiveCategories } from "@/server/services/applications";
import { getDb, schema } from "@/server/db";
import { PageHeader } from "@/components/ui";
import { NewApplicationWizard } from "./wizard";

export const metadata = { title: "New application" };

export default async function NewApplicationPage() {
  const actor = await requireActorPage();
  if (actor.role !== "INSTITUTION" || !actor.institutionId) redirect("/app");
  const [inst] = await getDb().select().from(schema.institutions).where(eq(schema.institutions.id, actor.institutionId));
  const cats = await listActiveCategories();
  return (
    <>
      <PageHeader
        title="New application"
        crumbs={[{ href: "/app/applications", label: "My applications" }, { label: "New application" }]}
        subtitle="Institution details are pre-filled from your synthetic institution record. Documents, validation and submission come next."
      />
      <NewApplicationWizard
        categories={cats.map((c) => ({ code: c.code, name: c.name, description: c.description, requiresPayment: c.requiresPayment, checklist: c.checklist.map((i) => ({ label: i.label, mandatory: i.mandatory })) }))}
        institution={{ name: inst.name, refId: inst.refId, address: inst.address, state: inst.state, affiliatedUniversity: inst.affiliatedUniversity }}
        contact={{ name: actor.name, email: actor.email }}
      />
    </>
  );
}

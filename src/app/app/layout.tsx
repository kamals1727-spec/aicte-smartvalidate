import { eq } from "drizzle-orm";
import { requireActorPage } from "@/server/auth/actor";
import { getAiStatus } from "@/server/ai/service";
import { listAlerts } from "@/server/services/alerts";
import { getDb, schema } from "@/server/db";
import { Shell } from "@/components/shell";
import { logoutAction } from "../actions";

export const dynamic = "force-dynamic";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const actor = await requireActorPage();
  const [ai, alerts] = await Promise.all([getAiStatus(), listAlerts(actor, {})]);
  const inst = actor.institutionId
    ? (await getDb().select({ name: schema.institutions.name }).from(schema.institutions).where(eq(schema.institutions.id, actor.institutionId)))[0]
    : undefined;
  return (
    <Shell
      user={{ name: actor.name, role: actor.role, institutionId: actor.institutionId, institutionName: inst?.name ?? null }}
      aiMode={ai.mode}
      aiLabel={ai.mode === "LIVE" ? `${ai.provider} · ${ai.model}` : ai.reason}
      alertCount={alerts.filter((a) => a.status !== "RESOLVED").length}
      logout={logoutAction}
    >
      {children}
    </Shell>
  );
}

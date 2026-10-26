import { redirect } from "next/navigation";
import { asc } from "drizzle-orm";
import { requireActorPage } from "@/server/auth/actor";
import { listUsers } from "@/server/services/admin";
import { can } from "@/server/authz";
import { getDb, schema } from "@/server/db";
import { Badge, Card, Field, PageHeader, Td, Th, inputClass } from "@/components/ui";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { createUserAction, setRoleAction, toggleUserAction } from "@/app/actions";
import { ROLES, ROLE_LABELS } from "@/lib/constants";
import { formatDate } from "@/lib/utils";

export const metadata = { title: "Users & roles" };

export default async function UsersPage() {
  const actor = await requireActorPage();
  if (!can(actor, "admin.users")) redirect("/app");
  const users = await listUsers(actor);
  const insts = await getDb().select({ id: schema.institutions.id, name: schema.institutions.name }).from(schema.institutions).orderBy(asc(schema.institutions.name));
  return (
    <>
      <PageHeader title="Users, roles and permissions" subtitle="Least privilege: institution users see only their institution; officers see only their review scope; only administrators manage rules, users and decisions." />
      <div className="grid gap-6 xl:grid-cols-[1fr_340px]">
        <div className="overflow-x-auto rounded-lg border border-line bg-white">
          <table className="w-full min-w-[820px]">
            <thead className="border-b border-line bg-paper">
              <tr>
                <Th>User</Th>
                <Th>Role / institution</Th>
                <Th>Last sign-in</Th>
                <Th>Status</Th>
                <Th />
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {users.map(({ u, institution }) => (
                <tr key={u.id}>
                  <Td>
                    <div className="font-medium">{u.name}</div>
                    <div className="text-xs text-muted">{u.email}</div>
                  </Td>
                  <Td>
                    {u.id === actor.id ? (
                      <span>{ROLE_LABELS[u.role as keyof typeof ROLE_LABELS]}</span>
                    ) : (
                      <ActionForm action={setRoleAction} className="flex flex-wrap gap-1.5">
                        <input type="hidden" name="userId" value={u.id} />
                        <select name="role" defaultValue={u.role} aria-label={`Role for ${u.name}`} className={`${inputClass} w-auto py-1`}>
                          {ROLES.map((r) => (
                            <option key={r} value={r}>
                              {ROLE_LABELS[r]}
                            </option>
                          ))}
                        </select>
                        <select name="institutionId" defaultValue={u.institutionId ?? ""} aria-label={`Institution for ${u.name}`} className={`${inputClass} w-auto max-w-[200px] py-1`}>
                          <option value="">No institution</option>
                          {insts.map((i) => (
                            <option key={i.id} value={i.id}>
                              {i.name}
                            </option>
                          ))}
                        </select>
                        <SubmitButton size="sm" variant="secondary">
                          Save
                        </SubmitButton>
                      </ActionForm>
                    )}
                    {institution && <div className="mt-1 text-xs text-muted">{institution}</div>}
                  </Td>
                  <Td>{formatDate(u.lastLoginAt, true)}</Td>
                  <Td>{u.active ? <Badge tone="success">Active</Badge> : <Badge tone="danger">Deactivated</Badge>}</Td>
                  <Td>
                    {u.id !== actor.id && (
                      <ActionForm action={toggleUserAction}>
                        <input type="hidden" name="userId" value={u.id} />
                        <input type="hidden" name="active" value={u.active ? "false" : "true"} />
                        <SubmitButton size="sm" variant={u.active ? "ghost" : "secondary"}>
                          {u.active ? "Deactivate" : "Activate"}
                        </SubmitButton>
                      </ActionForm>
                    )}
                  </Td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <Card title="Add user">
          <ActionForm action={createUserAction} resetOnSuccess className="space-y-3">
            <Field label="Name" htmlFor="nu-name">
              <input id="nu-name" name="name" className={inputClass} />
            </Field>
            <Field label="Email" htmlFor="nu-email">
              <input id="nu-email" name="email" type="email" className={inputClass} />
            </Field>
            <Field label="Role" htmlFor="nu-role">
              <select id="nu-role" name="role" className={inputClass}>
                {ROLES.map((r) => (
                  <option key={r} value={r}>
                    {ROLE_LABELS[r]}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Institution (institution users only)" htmlFor="nu-inst">
              <select id="nu-inst" name="institutionId" className={inputClass}>
                <option value="">—</option>
                {insts.map((i) => (
                  <option key={i.id} value={i.id}>
                    {i.name}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Initial password" htmlFor="nu-pw" hint="At least 10 characters. Stored as a bcrypt hash.">
              <input id="nu-pw" name="password" type="password" autoComplete="new-password" className={inputClass} />
            </Field>
            <SubmitButton>Create user</SubmitButton>
          </ActionForm>
        </Card>
      </div>
    </>
  );
}

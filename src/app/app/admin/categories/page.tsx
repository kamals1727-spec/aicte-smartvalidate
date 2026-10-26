import { redirect } from "next/navigation";
import { requireActorPage } from "@/server/auth/actor";
import { listCategoriesAdmin } from "@/server/services/admin";
import { can } from "@/server/authz";
import { Badge, Card, PageHeader, inputClass } from "@/components/ui";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { setChecklistAction, toggleCategoryAction } from "@/app/actions";

export const metadata = { title: "Categories & checklists" };

export default async function CategoriesPage() {
  const actor = await requireActorPage();
  if (!can(actor, "admin.categories")) redirect("/app");
  const { categories, docTypes } = await listCategoriesAdmin(actor);
  return (
    <>
      <PageHeader title="Application categories and document checklists" subtitle="Demonstration configuration — not an authoritative list of AICTE requirements. Changes apply to the next validation run and are audit-logged." />
      <div className="grid gap-6 lg:grid-cols-2">
        {categories.map((c) => (
          <Card
            key={c.id}
            title={
              <span className="flex items-center gap-2">
                {c.name} {c.active ? <Badge tone="success">Active</Badge> : <Badge>Inactive</Badge>}
              </span>
            }
            description={`${c.code} · ${c.requiresPayment ? "fee-bearing" : "no fee"}`}
            actions={
              <ActionForm action={toggleCategoryAction}>
                <input type="hidden" name="categoryId" value={c.id} />
                <input type="hidden" name="active" value={c.active ? "false" : "true"} />
                <SubmitButton size="sm" variant="secondary">
                  {c.active ? "Deactivate" : "Activate"}
                </SubmitButton>
              </ActionForm>
            }
          >
            <ul className="divide-y divide-line">
              {c.items.map((i) => (
                <li key={i.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                  <span className="text-sm">
                    {i.label} {i.mandatory ? <Badge tone="danger">Mandatory</Badge> : <Badge>Optional</Badge>}
                  </span>
                  <span className="flex gap-1">
                    {(["mandatory", "optional", "remove"] as const)
                      .filter((s) => !(s === "mandatory" && i.mandatory) && !(s === "optional" && !i.mandatory))
                      .map((s) => (
                        <ActionForm key={s} action={setChecklistAction}>
                          <input type="hidden" name="categoryId" value={c.id} />
                          <input type="hidden" name="docTypeCode" value={i.docTypeCode} />
                          <input type="hidden" name="state" value={s} />
                          <SubmitButton size="sm" variant="ghost">
                            {s === "remove" ? "Remove" : `Make ${s}`}
                          </SubmitButton>
                        </ActionForm>
                      ))}
                  </span>
                </li>
              ))}
            </ul>
            <ActionForm action={setChecklistAction} className="mt-3 flex flex-wrap gap-2">
              <input type="hidden" name="categoryId" value={c.id} />
              <select name="docTypeCode" aria-label="Document type to add" className={`${inputClass} w-auto`}>
                {docTypes
                  .filter((d) => !c.items.some((i) => i.docTypeCode === d.code))
                  .map((d) => (
                    <option key={d.code} value={d.code}>
                      {d.label}
                    </option>
                  ))}
              </select>
              <select name="state" aria-label="Requirement" className={`${inputClass} w-auto`}>
                <option value="mandatory">Mandatory</option>
                <option value="optional">Optional</option>
              </select>
              <SubmitButton size="sm" variant="secondary">
                Add to checklist
              </SubmitButton>
            </ActionForm>
          </Card>
        ))}
      </div>
    </>
  );
}

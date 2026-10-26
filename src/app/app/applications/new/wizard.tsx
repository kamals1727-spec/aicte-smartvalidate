"use client";
import { useActionState, useState } from "react";
import { createApplicationAction } from "@/app/actions";
import { Field, btnClass, inputClass } from "@/components/ui";
import { ResultMessage, SubmitButton } from "@/components/action-form";
import { cn } from "@/lib/utils";

interface Cat {
  code: string;
  name: string;
  description: string;
  requiresPayment: boolean;
  checklist: { label: string; mandatory: boolean }[];
}

const STEPS = ["Category", "Institution details", "Application details", "Documents, validation & submission"];

export function NewApplicationWizard({
  categories,
  institution,
  contact,
}: {
  categories: Cat[];
  institution: { name: string; refId: string; address: string; state: string; affiliatedUniversity: string };
  contact: { name: string; email: string };
}) {
  const [step, setStep] = useState(0);
  const [cat, setCat] = useState<string>("");
  const [state, action] = useActionState(createApplicationAction, null);
  const selected = categories.find((c) => c.code === cat);
  const fe = state?.fieldErrors ?? {};
  const intake = cat === "INCREASE_INTAKE" || cat === "ADD_COURSES" || cat === "NEW_INSTITUTION";

  return (
    <div className="grid gap-6 lg:grid-cols-[220px_1fr]">
      <ol className="space-y-1 text-sm" aria-label="Application steps">
        {STEPS.map((s, i) => (
          <li key={s} className={cn("flex items-center gap-2 rounded-md px-3 py-2", i === step ? "bg-navy-100 font-medium text-navy-900" : i < step ? "text-ink" : "text-muted")} aria-current={i === step ? "step" : undefined}>
            <span className={cn("flex h-5 w-5 items-center justify-center rounded-full text-[11px]", i < step ? "bg-ok text-white" : i === step ? "bg-navy-900 text-white" : "bg-slate-200 text-muted")}>{i + 1}</span>
            {s}
          </li>
        ))}
      </ol>

      <form action={action} className="rounded-lg border border-line bg-white p-5 sm:p-6">
        <input type="hidden" name="categoryCode" value={cat} />

        {/* Step 1 */}
        <div hidden={step !== 0}>
          <h2 className="text-lg font-semibold">What are you applying for?</h2>
          <p className="mt-1 text-sm text-muted">Demonstration categories configured by the administrator. Each has its own document checklist.</p>
          <div className="mt-4 grid gap-3 md:grid-cols-2">
            {categories.map((c) => (
              <label key={c.code} className={cn("cursor-pointer rounded-lg border p-4 transition-colors", cat === c.code ? "border-action bg-navy-50 ring-1 ring-action" : "border-line hover:border-action/50")}>
                <input type="radio" name="_cat" value={c.code} checked={cat === c.code} onChange={() => setCat(c.code)} className="sr-only" />
                <div className="font-medium">{c.name}</div>
                <p className="mt-1 text-sm text-muted">{c.description}</p>
              </label>
            ))}
          </div>
          {selected && (
            <div className="mt-5 rounded-lg bg-paper p-4">
              <div className="text-sm font-medium">Document checklist for {selected.name}</div>
              <ul className="mt-2 grid gap-1 text-sm sm:grid-cols-2">
                {selected.checklist.map((i) => (
                  <li key={i.label} className="flex items-center gap-2">
                    <span className={cn("h-1.5 w-1.5 rounded-full", i.mandatory ? "bg-bad" : "bg-slate-400")} />
                    {i.label} <span className="text-xs text-muted">{i.mandatory ? "mandatory" : "optional"}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
          <div className="mt-6 flex justify-end">
            <button type="button" className={btnClass()} disabled={!cat} onClick={() => setStep(1)}>
              Continue
            </button>
          </div>
        </div>

        {/* Step 2 */}
        <div hidden={step !== 1} className="space-y-4">
          <h2 className="text-lg font-semibold">Institution details</h2>
          <p className="text-sm text-muted">Pre-filled from your institution record. If you change them, validation will compare them against that record.</p>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Institution name" htmlFor="declaredInstitutionName" required error={fe.declaredInstitutionName}>
              <input id="declaredInstitutionName" name="declaredInstitutionName" defaultValue={institution.name} className={inputClass} />
            </Field>
            <Field label="Institution reference ID" htmlFor="declaredInstitutionRef" required error={fe.declaredInstitutionRef}>
              <input id="declaredInstitutionRef" name="declaredInstitutionRef" defaultValue={institution.refId} className={inputClass} />
            </Field>
            <Field label="Address" htmlFor="address">
              <input id="address" name="address" defaultValue={institution.address} className={inputClass} />
            </Field>
            <Field label="State" htmlFor="state">
              <input id="state" name="state" defaultValue={institution.state} className={inputClass} />
            </Field>
            <Field label="Affiliated university / board" htmlFor="affiliatedUniversity">
              <input id="affiliatedUniversity" name="affiliatedUniversity" defaultValue={institution.affiliatedUniversity} className={inputClass} />
            </Field>
            <Field label="Academic year" htmlFor="academicYear" required hint="Format 2026-27" error={fe.academicYear}>
              <input id="academicYear" name="academicYear" defaultValue="2026-27" className={inputClass} />
            </Field>
            <Field label="Authorized contact name" htmlFor="contactName" error={fe.contactName}>
              <input id="contactName" name="contactName" defaultValue={contact.name} className={inputClass} />
            </Field>
            <Field label="Authorized contact email" htmlFor="contactEmail" error={fe.contactEmail}>
              <input id="contactEmail" name="contactEmail" type="email" defaultValue={contact.email} className={inputClass} />
            </Field>
            <Field label="Contact phone" htmlFor="contactPhone">
              <input id="contactPhone" name="contactPhone" className={inputClass} />
            </Field>
          </div>
          <div className="flex justify-between">
            <button type="button" className={btnClass("secondary")} onClick={() => setStep(0)}>
              Back
            </button>
            <button type="button" className={btnClass()} onClick={() => setStep(2)}>
              Continue
            </button>
          </div>
        </div>

        {/* Step 3 */}
        <div hidden={step !== 2} className="space-y-4">
          <h2 className="text-lg font-semibold">Application details</h2>
          <p className="text-sm text-muted">Fields shown depend on the selected category ({selected?.name ?? "none"}).</p>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Programme / course details" htmlFor="programmeName" error={fe.programmeName}>
              <input id="programmeName" name="programmeName" placeholder="e.g. B.E. Computer Science and Engineering" className={inputClass} />
            </Field>
            {intake && (
              <>
                <Field label="Approved intake" htmlFor="approvedIntake" error={fe.approvedIntake}>
                  <input id="approvedIntake" name="approvedIntake" inputMode="numeric" className={inputClass} />
                </Field>
                <Field label="Proposed intake" htmlFor="proposedIntake" error={fe.proposedIntake}>
                  <input id="proposedIntake" name="proposedIntake" inputMode="numeric" className={inputClass} />
                </Field>
              </>
            )}
            {cat !== "NEW_INSTITUTION" && (
              <Field label="Previous approval / EoA reference" htmlFor="previousApprovalRef">
                <input id="previousApprovalRef" name="previousApprovalRef" className={inputClass} />
              </Field>
            )}
            <Field label="Accreditation details" htmlFor="accreditationDetails">
              <input id="accreditationDetails" name="accreditationDetails" className={inputClass} />
            </Field>
            {selected?.requiresPayment && (
              <>
                <Field label="Payment / transaction reference" htmlFor="paymentReference" hint="Checked against the synthetic payment ledger" error={fe.paymentReference}>
                  <input id="paymentReference" name="paymentReference" placeholder="e.g. TXN-DEMO-778812" className={inputClass} />
                </Field>
                <Field label="Amount paid (₹)" htmlFor="paymentAmount" error={fe.paymentAmount}>
                  <input id="paymentAmount" name="paymentAmount" inputMode="numeric" className={inputClass} />
                </Field>
              </>
            )}
          </div>
          <p className="rounded-md bg-paper px-3 py-2 text-xs text-muted">Do not enter card numbers, bank passwords or other financial credentials — only the transaction reference.</p>
          <div className="flex flex-wrap justify-between gap-2">
            <button type="button" className={btnClass("secondary")} onClick={() => setStep(1)}>
              Back
            </button>
            <SubmitButton pendingText="Creating draft…">Save draft and add documents</SubmitButton>
          </div>
          <ResultMessage state={state} />
        </div>
      </form>
    </div>
  );
}

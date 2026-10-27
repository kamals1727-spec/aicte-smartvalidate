"use client";
import { useActionState } from "react";
import { registerAction } from "../actions";
import { Field, inputClass } from "@/components/ui";
import { ResultMessage, SubmitButton } from "@/components/action-form";

export function RegisterForm() {
  const [state, action] = useActionState(registerAction, null);
  const err = state?.fieldErrors;
  return (
    <form action={action} className="mt-6 space-y-6">
      <fieldset className="space-y-4">
        <legend className="mb-2 text-sm font-semibold text-navy-900">Your account</legend>
        <Field label="Full name" htmlFor="name" error={err?.name} required>
          <input id="name" name="name" autoComplete="name" required minLength={2} maxLength={100} className={inputClass} />
        </Field>
        <Field label="Email" htmlFor="email" error={err?.email} required>
          <input id="email" name="email" type="email" autoComplete="email" required className={inputClass} />
        </Field>
        <Field label="Password" htmlFor="password" hint="At least 10 characters." error={err?.password} required>
          <input id="password" name="password" type="password" autoComplete="new-password" required minLength={10} maxLength={200} className={inputClass} />
        </Field>
        <Field label="Confirm password" htmlFor="confirmPassword" error={err?.confirmPassword} required>
          <input id="confirmPassword" name="confirmPassword" type="password" autoComplete="new-password" required minLength={10} maxLength={200} className={inputClass} />
        </Field>
      </fieldset>
      <fieldset className="space-y-4">
        <legend className="mb-2 text-sm font-semibold text-navy-900">Institution</legend>
        <Field label="Institution name" htmlFor="institutionName" error={err?.institutionName} required>
          <input id="institutionName" name="institutionName" required minLength={3} maxLength={200} className={inputClass} />
        </Field>
        <Field label="Address" htmlFor="address" error={err?.address} required>
          <input id="address" name="address" autoComplete="street-address" required minLength={5} maxLength={300} className={inputClass} />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="City" htmlFor="city" error={err?.city} required>
            <input id="city" name="city" autoComplete="address-level2" required minLength={2} maxLength={100} className={inputClass} />
          </Field>
          <Field label="State" htmlFor="state" error={err?.state} required>
            <input id="state" name="state" autoComplete="address-level1" required minLength={2} maxLength={100} className={inputClass} />
          </Field>
        </div>
        <Field label="Affiliating university / board" htmlFor="affiliatedUniversity" error={err?.affiliatedUniversity} required>
          <input id="affiliatedUniversity" name="affiliatedUniversity" required minLength={2} maxLength={200} className={inputClass} />
        </Field>
        <Field label="Contact phone" htmlFor="contactPhone" error={err?.contactPhone} required>
          <input id="contactPhone" name="contactPhone" type="tel" autoComplete="tel" required pattern="[+0-9 \-]{8,20}" className={inputClass} />
        </Field>
      </fieldset>
      <SubmitButton className="w-full" pendingText="Creating account…">
        Create account
      </SubmitButton>
      {!err && <ResultMessage state={state} />}
    </form>
  );
}

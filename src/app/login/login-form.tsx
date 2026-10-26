"use client";
import { useActionState } from "react";
import { loginAction } from "../actions";
import { Field, inputClass } from "@/components/ui";
import { ResultMessage, SubmitButton } from "@/components/action-form";

export function LoginForm() {
  const [state, action] = useActionState(loginAction, null);
  return (
    <form action={action} className="mt-6 space-y-4">
      <Field label="Email" htmlFor="email" error={state?.fieldErrors?.email}>
        <input id="email" name="email" type="email" autoComplete="username" required className={inputClass} />
      </Field>
      <Field label="Password" htmlFor="password" error={state?.fieldErrors?.password}>
        <input id="password" name="password" type="password" autoComplete="current-password" required className={inputClass} />
      </Field>
      <SubmitButton className="w-full" pendingText="Signing in…">
        Sign in
      </SubmitButton>
      {!state?.fieldErrors && <ResultMessage state={state} />}
    </form>
  );
}

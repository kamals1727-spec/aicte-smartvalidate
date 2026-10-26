"use client";
import { useActionState, useEffect, useRef } from "react";
import { useFormStatus } from "react-dom";
import type { ActionResult } from "@/app/actions";
import { btnClass } from "./ui";
import { cn } from "@/lib/utils";

type Action = (prev: ActionResult | null, fd: FormData) => Promise<ActionResult>;

/** Form wired to a server action, with pending state and an inline result message. */
export function ActionForm({
  action,
  children,
  className,
  resetOnSuccess,
  confirm,
}: {
  action: Action;
  children: React.ReactNode;
  className?: string;
  resetOnSuccess?: boolean;
  confirm?: string;
}) {
  const [state, formAction] = useActionState(action, null);
  const ref = useRef<HTMLFormElement>(null);
  useEffect(() => {
    if (state?.ok && resetOnSuccess) ref.current?.reset();
  }, [state, resetOnSuccess]);
  return (
    <form
      ref={ref}
      action={formAction}
      className={className}
      onSubmit={(e) => {
        if (confirm && !window.confirm(confirm)) e.preventDefault();
      }}
    >
      {children}
      <ResultMessage state={state} />
    </form>
  );
}

export function ResultMessage({ state }: { state: ActionResult | null }) {
  if (!state?.message) return null;
  return (
    <p role={state.ok ? "status" : "alert"} className={cn("mt-2 rounded-md px-3 py-2 text-sm", state.ok ? "bg-ok-bg text-ok" : "bg-bad-bg text-bad")}>
      {state.message}
    </p>
  );
}

export function SubmitButton({
  children,
  pendingText,
  variant = "primary",
  size = "md",
  className,
  name,
  value,
}: {
  children: React.ReactNode;
  pendingText?: string;
  variant?: "primary" | "secondary" | "danger" | "ghost";
  size?: "sm" | "md";
  className?: string;
  name?: string;
  value?: string;
}) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" disabled={pending} name={name} value={value} className={cn(btnClass(variant, size), className)} aria-busy={pending}>
      {pending ? (pendingText ?? "Working…") : children}
    </button>
  );
}

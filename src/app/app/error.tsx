"use client";
import { btnClass } from "@/components/ui";

export default function AppError({ reset }: { error: Error; reset: () => void }) {
  return (
    <div className="mx-auto max-w-lg rounded-lg border border-line bg-white p-8 text-center">
      <h1 className="font-serif text-xl font-semibold text-navy-900">This page could not be loaded</h1>
      <p className="mt-2 text-sm text-muted">The error has been logged on the server. Retry, or go back to the dashboard. If it keeps happening, check System health.</p>
      <div className="mt-5 flex justify-center gap-2">
        <button onClick={reset} className={btnClass()}>
          Retry
        </button>
        <a href="/app" className={btnClass("secondary")}>
          Dashboard
        </a>
      </div>
    </div>
  );
}

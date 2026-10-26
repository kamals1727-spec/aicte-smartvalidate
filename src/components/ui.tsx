import Link from "next/link";
import { cn } from "@/lib/utils";
import type { Tone } from "@/lib/constants";

const TONES: Record<Tone, string> = {
  neutral: "bg-slate-100 text-slate-700 ring-slate-200",
  info: "bg-info-bg text-info ring-info/20",
  success: "bg-ok-bg text-ok ring-ok/20",
  warning: "bg-warn-bg text-warn ring-warn/20",
  danger: "bg-bad-bg text-bad ring-bad/20",
  navy: "bg-navy-100 text-navy-900 ring-navy-700/20",
};

export function Badge({ tone = "neutral", children, className, title }: { tone?: Tone; children: React.ReactNode; className?: string; title?: string }) {
  return (
    <span title={title} className={cn("inline-flex items-center gap-1 whitespace-nowrap rounded-md px-2 py-0.5 text-xs font-medium ring-1 ring-inset", TONES[tone], className)}>
      {children}
    </span>
  );
}

export function Card({ children, className, title, actions, description }: { children: React.ReactNode; className?: string; title?: React.ReactNode; actions?: React.ReactNode; description?: React.ReactNode }) {
  return (
    <section className={cn("rounded-lg border border-line bg-white", className)}>
      {(title || actions) && (
        <header className="flex flex-wrap items-start justify-between gap-3 border-b border-line px-5 py-3.5">
          <div>
            {title && <h2 className="text-[15px] font-semibold text-ink">{title}</h2>}
            {description && <p className="mt-0.5 text-sm text-muted">{description}</p>}
          </div>
          {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
        </header>
      )}
      <div className="p-5">{children}</div>
    </section>
  );
}

type BtnVariant = "primary" | "secondary" | "danger" | "ghost";
const BTN: Record<BtnVariant, string> = {
  primary: "bg-action text-white hover:bg-action-hover disabled:bg-action/50",
  secondary: "bg-white text-ink ring-1 ring-inset ring-line hover:bg-navy-50 disabled:text-muted",
  danger: "bg-bad text-white hover:bg-bad/90 disabled:bg-bad/50",
  ghost: "text-action hover:bg-navy-50",
};
export function btnClass(variant: BtnVariant = "primary", size: "sm" | "md" = "md") {
  return cn(
    "inline-flex items-center justify-center gap-1.5 rounded-md font-medium transition-colors disabled:cursor-not-allowed",
    size === "sm" ? "px-2.5 py-1.5 text-sm" : "px-3.5 py-2 text-sm",
    BTN[variant],
  );
}

export function LinkButton({ href, children, variant = "primary", size = "md", className }: { href: string; children: React.ReactNode; variant?: BtnVariant; size?: "sm" | "md"; className?: string }) {
  return (
    <Link href={href} className={cn(btnClass(variant, size), className)}>
      {children}
    </Link>
  );
}

export function PageHeader({ title, subtitle, actions, crumbs }: { title: React.ReactNode; subtitle?: React.ReactNode; actions?: React.ReactNode; crumbs?: { href?: string; label: string }[] }) {
  return (
    <div className="mb-6">
      {crumbs && (
        <nav aria-label="Breadcrumb" className="mb-2 text-sm text-muted">
          {crumbs.map((c, i) => (
            <span key={i}>
              {i > 0 && <span className="mx-1.5 text-slate-300">/</span>}
              {c.href ? (
                <Link href={c.href} className="hover:text-action hover:underline">
                  {c.label}
                </Link>
              ) : (
                <span className="text-ink">{c.label}</span>
              )}
            </span>
          ))}
        </nav>
      )}
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="min-w-0">
          <h1 className="font-serif text-2xl font-semibold tracking-tight text-navy-900 sm:text-[28px]">{title}</h1>
          {subtitle && <p className="mt-1 max-w-3xl text-sm text-muted">{subtitle}</p>}
        </div>
        {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
      </div>
    </div>
  );
}

export function EmptyState({ title, children, action }: { title: string; children?: React.ReactNode; action?: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-dashed border-line bg-white px-6 py-10 text-center">
      <p className="font-medium text-ink">{title}</p>
      {children && <div className="mx-auto mt-1 max-w-md text-sm text-muted">{children}</div>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

export function Field({ label, htmlFor, hint, error, children, required }: { label: string; htmlFor: string; hint?: string; error?: string; children: React.ReactNode; required?: boolean }) {
  return (
    <div>
      <label htmlFor={htmlFor} className="mb-1 block text-sm font-medium text-ink">
        {label}
        {required && <span className="ml-0.5 text-bad" aria-hidden>*</span>}
      </label>
      {children}
      {hint && !error && <p className="mt-1 text-xs text-muted">{hint}</p>}
      {error && <p className="mt-1 text-xs text-bad">{error}</p>}
    </div>
  );
}

export const inputClass =
  "block w-full rounded-md border border-line bg-white px-3 py-2 text-sm text-ink placeholder:text-slate-400 focus:border-action focus:outline-none focus:ring-2 focus:ring-action/20 disabled:bg-slate-50";

export function Stat({ label, value, tone, href }: { label: string; value: number | string; tone?: Tone; href?: string }) {
  const inner = (
    <>
      <div className={cn("text-2xl font-semibold tabular-nums", tone === "danger" ? "text-bad" : tone === "warning" ? "text-warn" : tone === "success" ? "text-ok" : "text-navy-900")}>{value}</div>
      <div className="mt-0.5 text-sm text-muted">{label}</div>
    </>
  );
  return href ? (
    <Link href={href} className="block rounded-lg border border-line bg-white px-4 py-3 hover:border-action/40">
      {inner}
    </Link>
  ) : (
    <div className="rounded-lg border border-line bg-white px-4 py-3">{inner}</div>
  );
}

export function Th({ children, className }: { children?: React.ReactNode; className?: string }) {
  return <th className={cn("whitespace-nowrap px-3 py-2.5 text-left text-xs font-semibold text-muted", className)}>{children}</th>;
}
export function Td({ children, className }: { children?: React.ReactNode; className?: string }) {
  return <td className={cn("px-3 py-2.5 align-top text-sm", className)}>{children}</td>;
}

export function DL({ items }: { items: [string, React.ReactNode][] }) {
  return (
    <dl className="grid grid-cols-1 gap-x-6 gap-y-3 sm:grid-cols-2">
      {items.map(([k, v]) => (
        <div key={k}>
          <dt className="text-xs text-muted">{k}</dt>
          <dd className="mt-0.5 break-words text-sm text-ink">{v || "—"}</dd>
        </div>
      ))}
    </dl>
  );
}

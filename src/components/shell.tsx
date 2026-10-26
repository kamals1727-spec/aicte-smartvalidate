"use client";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import {
  Activity,
  Bell,
  Building2,
  ChevronsLeft,
  ChevronsRight,
  FilePlus2,
  FileText,
  IndianRupee,
  Inbox,
  LayoutDashboard,
  ListChecks,
  LogOut,
  Menu,
  Scale,
  ScrollText,
  Search,
  Users,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { ROLE_LABELS, type Role } from "@/lib/constants";
import { Mark } from "./brand";

interface NavItem {
  href: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
}

function navFor(role: Role, institutionId: string | null): NavItem[] {
  const common = [{ href: "/app", label: "Dashboard", icon: LayoutDashboard }];
  if (role === "INSTITUTION")
    return [
      ...common,
      { href: "/app/applications", label: "My applications", icon: FileText },
      { href: "/app/applications/new", label: "New application", icon: FilePlus2 },
      { href: "/app/alerts", label: "Alerts & cases", icon: Bell },
      { href: "/app/payments", label: "Payments", icon: IndianRupee },
      ...(institutionId ? [{ href: `/app/institutions/${institutionId}`, label: "Institution profile", icon: Building2 }] : []),
    ];
  const officer = [
    ...common,
    { href: "/app/queue", label: "Application queue", icon: Inbox },
    { href: "/app/alerts", label: "Alerts & cases", icon: Bell },
    { href: "/app/institutions", label: "Institutions", icon: Building2 },
    { href: "/app/payments", label: "Payments", icon: IndianRupee },
  ];
  if (role === "OFFICER") return [...officer, { href: "/app/health", label: "System health", icon: Activity }];
  return [
    ...officer,
    { href: "/app/admin/users", label: "Users & roles", icon: Users },
    { href: "/app/admin/categories", label: "Categories & checklists", icon: ListChecks },
    { href: "/app/admin/rules", label: "Validation rules", icon: Scale },
    { href: "/app/admin/audit", label: "Audit trail", icon: ScrollText },
    { href: "/app/health", label: "System health", icon: Activity },
  ];
}

export function Shell({
  user,
  aiMode,
  aiLabel,
  alertCount,
  logout,
  children,
}: {
  user: { name: string; role: Role; institutionId: string | null; institutionName: string | null };
  aiMode: "LIVE" | "DEMO" | "DEGRADED";
  aiLabel: string;
  alertCount: number;
  logout: () => Promise<void>;
  children: React.ReactNode;
}) {
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const pathname = usePathname();
  const router = useRouter();
  const nav = navFor(user.role, user.institutionId);
  useEffect(() => {
    try {
      setCollapsed(localStorage.getItem("sv-sidebar") === "collapsed");
    } catch {
      /* storage unavailable */
    }
  }, []);
  useEffect(() => setMobileOpen(false), [pathname]);
  const toggle = () => {
    setCollapsed((c) => {
      try {
        localStorage.setItem("sv-sidebar", c ? "open" : "collapsed");
      } catch {
        /* ignore */
      }
      return !c;
    });
  };
  const isActive = (href: string) => (href === "/app" ? pathname === "/app" : pathname === href || pathname.startsWith(href + "/"));
  const today = new Date().toLocaleDateString("en-IN", { weekday: "short", day: "2-digit", month: "short", year: "numeric", timeZone: "Asia/Kolkata" });

  const sidebar = (
    <nav aria-label="Main" className="flex h-full flex-col">
      <div className={cn("flex items-center gap-2.5 px-4 py-4", collapsed && "lg:justify-center lg:px-2")}>
        <Mark />
        <span className={cn("font-serif text-[17px] font-semibold text-white", collapsed && "lg:hidden")}>SmartValidate</span>
      </div>
      <ul className="flex-1 space-y-0.5 px-2">
        {nav.map((n) => {
          const Icon = n.icon;
          const active = isActive(n.href);
          return (
            <li key={n.href}>
              <Link
                href={n.href}
                title={collapsed ? n.label : undefined}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "flex items-center gap-3 rounded-md px-3 py-2 text-sm text-navy-100 hover:bg-navy-800 hover:text-white",
                  active && "bg-navy-800 font-medium text-white shadow-[inset_3px_0_0_#7fb0ff]",
                  collapsed && "lg:justify-center lg:px-0",
                )}
              >
                <Icon className="h-4 w-4 shrink-0" />
                <span className={cn(collapsed && "lg:hidden")}>{n.label}</span>
              </Link>
            </li>
          );
        })}
      </ul>
      <div className={cn("border-t border-navy-800 px-4 py-3 text-xs text-navy-100/80", collapsed && "lg:hidden")}>Independent prototype — not an official AICTE portal.</div>
      <button onClick={toggle} className="hidden items-center justify-center gap-2 border-t border-navy-800 py-2.5 text-xs text-navy-100 hover:text-white lg:flex" aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}>
        {collapsed ? <ChevronsRight className="h-4 w-4" /> : <><ChevronsLeft className="h-4 w-4" /> Collapse</>}
      </button>
    </nav>
  );

  return (
    <div className="min-h-screen lg:flex">
      <aside className={cn("hidden shrink-0 bg-navy-900 lg:sticky lg:top-0 lg:block lg:h-screen", collapsed ? "lg:w-16" : "lg:w-60")}>{sidebar}</aside>
      {mobileOpen && (
        <div className="fixed inset-0 z-40 lg:hidden" role="dialog" aria-modal="true">
          <button className="absolute inset-0 bg-black/40" aria-label="Close menu" onClick={() => setMobileOpen(false)} />
          <aside className="absolute inset-y-0 left-0 w-64 bg-navy-900">
            <button onClick={() => setMobileOpen(false)} className="absolute right-3 top-4 text-navy-100" aria-label="Close menu">
              <X className="h-5 w-5" />
            </button>
            {sidebar}
          </aside>
        </div>
      )}

      <div className="min-w-0 flex-1">
        {aiMode !== "LIVE" && (
          <div role="status" className={cn("px-4 py-1.5 text-center text-xs font-medium", aiMode === "DEMO" ? "bg-demo-bg text-demo" : "bg-warn-bg text-warn")}>
            {aiMode === "DEMO"
              ? "DEMO MODE — rule-based validation and simulated AI explanations. No live AI API is connected."
              : `AI DEGRADED — ${aiLabel} Deterministic validation continues; AI explanations fall back to labelled demo output.`}
          </div>
        )}
        <header className="sticky top-0 z-30 flex items-center gap-3 border-b border-line bg-white/95 px-4 py-2.5 backdrop-blur sm:px-6">
          <button className="text-ink lg:hidden" onClick={() => setMobileOpen(true)} aria-label="Open menu">
            <Menu className="h-5 w-5" />
          </button>
          <form
            className="relative hidden max-w-sm flex-1 sm:block"
            onSubmit={(e) => {
              e.preventDefault();
              const q = new FormData(e.currentTarget).get("q");
              router.push(`${user.role === "INSTITUTION" ? "/app/applications" : "/app/queue"}?q=${encodeURIComponent(String(q ?? ""))}`);
            }}
          >
            <Search className="pointer-events-none absolute left-2.5 top-2.5 h-4 w-4 text-muted" />
            <label htmlFor="global-search" className="sr-only">
              Search applications
            </label>
            <input id="global-search" name="q" placeholder={user.role === "INSTITUTION" ? "Search my applications" : "Search reference no. or institution"} className="w-full rounded-md border border-line bg-paper py-2 pl-8 pr-3 text-sm focus:border-action focus:outline-none" />
          </form>
          <div className="ml-auto flex items-center gap-3">
            <span className="hidden text-xs text-muted md:inline">{today}</span>
            <span className={cn("hidden rounded-md px-2 py-0.5 text-xs font-medium sm:inline", aiMode === "LIVE" ? "bg-ok-bg text-ok" : aiMode === "DEMO" ? "bg-demo-bg text-demo" : "bg-warn-bg text-warn")} title={aiLabel}>
              AI: {aiMode === "LIVE" ? "live" : aiMode === "DEMO" ? "demo" : "degraded"}
            </span>
            <Link href="/app/alerts" className="relative rounded-md p-1.5 text-ink hover:bg-navy-50" aria-label={`Alerts (${alertCount} open)`}>
              <Bell className="h-5 w-5" />
              {alertCount > 0 && <span className="absolute -right-0.5 -top-0.5 min-w-4 rounded-full bg-bad px-1 text-center text-[10px] font-semibold leading-4 text-white">{alertCount > 99 ? "99+" : alertCount}</span>}
            </Link>
            <div className="relative">
              <button onClick={() => setMenuOpen((o) => !o)} className="flex items-center gap-2 rounded-md px-1.5 py-1 hover:bg-navy-50" aria-expanded={menuOpen} aria-haspopup="menu">
                <span className="flex h-8 w-8 items-center justify-center rounded-full bg-navy-100 text-sm font-semibold text-navy-900">{user.name.charAt(0)}</span>
                <span className="hidden text-left md:block">
                  <span className="block max-w-[180px] truncate text-sm font-medium text-ink">{user.name}</span>
                  <span className="block text-xs text-muted">{ROLE_LABELS[user.role]}</span>
                </span>
              </button>
              {menuOpen && (
                <div role="menu" className="absolute right-0 mt-1 w-64 rounded-md border border-line bg-white p-1 shadow-lg">
                  <div className="border-b border-line px-3 py-2 text-sm">
                    <div className="font-medium">{user.name}</div>
                    <div className="text-xs text-muted">{ROLE_LABELS[user.role]}</div>
                    {user.institutionName && <div className="mt-0.5 text-xs text-muted">{user.institutionName}</div>}
                  </div>
                  <form action={logout}>
                    <button role="menuitem" className="flex w-full items-center gap-2 rounded px-3 py-2 text-left text-sm hover:bg-navy-50">
                      <LogOut className="h-4 w-4" /> Sign out
                    </button>
                  </form>
                </div>
              )}
            </div>
          </div>
        </header>
        <main className="mx-auto max-w-[1400px] px-4 py-6 sm:px-6 lg:py-8">{children}</main>
      </div>
    </div>
  );
}

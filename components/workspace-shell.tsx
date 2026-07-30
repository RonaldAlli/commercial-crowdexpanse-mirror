"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ReactNode, Suspense, useEffect, useState } from "react";
import type { UserRole } from "@prisma/client";

import { logoutAction } from "@/app/actions";
import { Icon, type IconName } from "@/components/icons";
import { useCopilot } from "@/components/ai-copilot/CopilotProvider";
import { CopilotRegion, COPILOT_RAIL_WIDTH } from "@/components/ai-copilot/CopilotRegion";

type NavItem = {
  href: string;
  label: string;
  icon: IconName;
  section: string;
  title: string;
  // Optional server-computed visibility gate (RBAC evaluated in the layout, passed as props).
  // Absent = shown to every authenticated user, matching the existing Overview/Records/Workflow items.
  gate?: "commandCenter" | "sellerQueue";
};

const navigation: NavItem[] = [
  { href: "/command-center", label: "Command Center", icon: "spark", section: "Overview", title: "Command Center", gate: "commandCenter" },
  { href: "/dashboard", label: "Dashboard", icon: "dashboard", section: "Overview", title: "Acquisitions dashboard" },
  { href: "/seller-queue", label: "Seller Queue", icon: "sellers", section: "Overview", title: "Seller work queue", gate: "sellerQueue" },
  { href: "/acquire", label: "Acquisition workspace", icon: "phone", section: "Overview", title: "Seller acquisition workspace" },
  { href: "/opportunities", label: "Pipeline", icon: "pipeline", section: "Overview", title: "Opportunity pipeline" },
  { href: "/analyzer", label: "Deal Analyzer", icon: "analyzer", section: "Overview", title: "Deal analyzer" },
  { href: "/matches", label: "Matches", icon: "spark", section: "Overview", title: "Buyer matches" },
  { href: "/closing", label: "Closing", icon: "check", section: "Overview", title: "Transaction dashboard" },
  { href: "/insights", label: "Source performance", icon: "arrowUpRight", section: "Overview", title: "Source performance" },
  { href: "/contacts", label: "Contacts", icon: "mail", section: "Records", title: "Contacts" },
  { href: "/owners", label: "Owners", icon: "buyers", section: "Records", title: "Owners" },
  { href: "/sellers", label: "Sellers", icon: "sellers", section: "Records", title: "Sellers" },
  { href: "/buyers", label: "Buyers", icon: "buyers", section: "Records", title: "Buyers" },
  { href: "/properties", label: "Properties", icon: "properties", section: "Records", title: "Properties" },
  { href: "/tasks", label: "Tasks", icon: "tasks", section: "Workflow", title: "Tasks" },
  { href: "/notes", label: "Notes", icon: "notes", section: "Workflow", title: "Notes" },
  { href: "/activity", label: "Activity", icon: "activity", section: "Workflow", title: "Activity" },
  { href: "/documents", label: "Documents", icon: "files", section: "Workflow", title: "Documents" },
  { href: "/settings/team", label: "Team", icon: "buyers", section: "Settings", title: "Team" },
  { href: "/settings/organization", label: "Organization", icon: "properties", section: "Settings", title: "Organization" },
  { href: "/settings/communications", label: "Communications", icon: "phone", section: "Settings", title: "Communications" },
  { href: "/settings/ai", label: "AI Provider", icon: "activity", section: "Settings", title: "AI provider" },
  { href: "/settings/ai/governance", label: "AI Governance", icon: "activity", section: "Settings", title: "AI governance" },
  { href: "/settings/ai/release", label: "AI Release", icon: "activity", section: "Settings", title: "AI release readiness" },
  { href: "/settings/imports", label: "Imports", icon: "upload", section: "Settings", title: "Lead imports" },
  { href: "/settings/security", label: "Access denials", icon: "activity", section: "Settings", title: "Access denials" },
];

const sections = ["Overview", "Records", "Workflow", "Settings"];

const SIDEBAR_STORAGE_KEY = "ce-commercial-sidebar-collapsed";

export function WorkspaceShell({
  children,
  userEmail,
  userRole,
  unreadCount = 0,
  showCommandCenter = false,
  showSellerQueue = false,
}: {
  children: ReactNode;
  userEmail: string;
  userRole: UserRole;
  unreadCount?: number;
  showCommandCenter?: boolean;
  showSellerQueue?: boolean;
}) {
  const pathname = usePathname();
  const [sidebarOpen, setSidebarOpen] = useState(false); // mobile drawer
  // Desktop collapse. SSR default = expanded (matches prior markup → no hydration
  // mismatch); the persisted value is applied after mount.
  const [collapsed, setCollapsed] = useState(false);

  useEffect(() => {
    try {
      if (window.localStorage.getItem(SIDEBAR_STORAGE_KEY) === "1") setCollapsed(true);
    } catch {
      /* storage unavailable — stay expanded */
    }
  }, []);

  const toggleCollapsed = () =>
    setCollapsed((c) => {
      const next = !c;
      try {
        window.localStorage.setItem(SIDEBAR_STORAGE_KEY, next ? "1" : "0");
      } catch {
        /* non-fatal */
      }
      return next;
    });

  const isAdmin = userRole === "ADMIN";
  // The Settings section (team management) is admin-only. Non-admins never see
  // it; direct navigation is independently blocked by requireRole (404).
  // Gated Milestone-1 items are shown only when the server-computed RBAC flag allows it.
  const visibleNav = navigation.filter((item) => {
    if (item.section === "Settings" && !isAdmin) return false;
    if (item.gate === "commandCenter" && !showCommandCenter) return false;
    if (item.gate === "sellerQueue" && !showSellerQueue) return false;
    return true;
  });
  const visibleSections = sections.filter((section) =>
    visibleNav.some((item) => item.section === section),
  );

  const current = navigation.find((item) => pathname.startsWith(item.href));
  const initials = userEmail.slice(0, 2).toUpperCase();

  const { open: copilotOpen, width: copilotWidth } = useCopilot();

  // Desktop grid track for the sidebar column reflows with the collapsed state.
  // Both class strings are literal so Tailwind JIT emits them.
  const gridCols = collapsed
    ? "lg:grid-cols-[68px_minmax(0,1fr)]"
    : "lg:grid-cols-[260px_minmax(0,1fr)]";

  return (
    <div className="flex min-h-screen">
      <div className={`min-w-0 flex-1 lg:grid ${gridCols}`}>
      {/* Mobile overlay */}
      {sidebarOpen ? (
        <div
          className="fixed inset-0 z-20 bg-slate-900/40 lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      ) : null}

      {/* Sidebar. Mobile: fixed 260px drawer (labels always shown). Desktop: static,
          fills the grid track (260px expanded / 68px collapsed → icon rail). */}
      <aside
        className={`fixed inset-y-0 left-0 z-30 flex w-[260px] flex-col border-r border-slate-200 bg-white transition-transform lg:static lg:w-auto lg:translate-x-0 ${
          sidebarOpen ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        <div className={`flex h-16 items-center gap-2.5 border-b border-slate-200 px-5 ${collapsed ? "lg:justify-center lg:px-2" : ""}`}>
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-brand-600 text-white shadow-sm">
            <Icon name="properties" className="h-[1.125rem] w-[1.125rem]" />
          </div>
          <div className={`leading-tight ${collapsed ? "lg:hidden" : ""}`}>
            <p className="text-sm font-semibold text-slate-900">CrowdExpanse</p>
            <p className="text-[0.7rem] font-medium uppercase tracking-[0.12em] text-brand-600">
              Commercial
            </p>
          </div>
        </div>

        {/* Desktop-only collapse/expand toggle — always visible, no hover needed. */}
        <div className={`hidden border-b border-slate-200 px-3 py-1.5 lg:flex ${collapsed ? "lg:justify-center" : "lg:justify-end"}`}>
          <button
            type="button"
            onClick={toggleCollapsed}
            aria-expanded={!collapsed}
            aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
            title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
            className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
          >
            <Icon name="chevronRight" className={`h-4 w-4 ${collapsed ? "" : "rotate-180"}`} />
          </button>
        </div>

        <nav className="flex-1 space-y-6 overflow-y-auto px-3 py-5">
          {visibleSections.map((section) => (
            <div key={section} className="space-y-1">
              <p className={`px-3 pb-1 text-[0.68rem] font-semibold uppercase tracking-[0.1em] text-slate-400 ${collapsed ? "lg:hidden" : ""}`}>
                {section}
              </p>
              {visibleNav
                .filter((item) => item.section === section)
                .map((item) => {
                  const active = pathname.startsWith(item.href);
                  const className = `group flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
                    active
                      ? "bg-brand-50 text-brand-700"
                      : "text-slate-600 hover:bg-slate-50 hover:text-slate-900"
                  } ${collapsed ? "lg:justify-center lg:gap-0 lg:px-0" : ""}`;
                  const icon = (
                    <Icon
                      name={item.icon}
                      className={`h-[1.15rem] w-[1.15rem] shrink-0 ${
                        active ? "text-brand-600" : "text-slate-400 group-hover:text-slate-500"
                      }`}
                    />
                  );

                  return (
                    <form key={item.href} action={item.href} method="get" className="w-full">
                      <button
                        type="submit"
                        onClick={() => setSidebarOpen(false)}
                        aria-label={item.label}
                        aria-current={active ? "page" : undefined}
                        title={item.label}
                        className={`${className} w-full appearance-none border-0 bg-transparent text-left`}
                      >
                        {icon}
                        <span className={collapsed ? "lg:hidden" : ""}>{item.label}</span>
                      </button>
                    </form>
                  );
                })}
            </div>
          ))}
        </nav>

        <div className="border-t border-slate-200 p-3">
          <div className={`flex items-center gap-3 rounded-lg px-2 py-1.5 ${collapsed ? "lg:flex-col lg:gap-1 lg:px-0" : ""}`}>
            <div
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-slate-900 text-xs font-semibold text-white"
              title={collapsed ? userEmail : undefined}
            >
              {initials}
            </div>
            <div className={`min-w-0 flex-1 ${collapsed ? "lg:hidden" : ""}`}>
              <p className="truncate text-sm font-medium text-slate-900">Operator</p>
              <p className="truncate text-xs text-slate-500">{userEmail}</p>
            </div>
            <form action={logoutAction}>
              <button
                type="submit"
                title="Log out"
                aria-label="Log out"
                className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-700"
              >
                <Icon name="logout" className="h-[1.125rem] w-[1.125rem]" />
              </button>
            </form>
          </div>
        </div>
      </aside>

      {/* Main */}
      <div className="flex min-h-screen flex-col">
        <header className="sticky top-0 z-10 flex h-16 items-center gap-4 border-b border-slate-200 bg-white/80 px-4 backdrop-blur-md sm:px-6">
          <button
            type="button"
            onClick={() => setSidebarOpen((open) => !open)}
            aria-label={sidebarOpen ? "Close navigation menu" : "Open navigation menu"}
            aria-expanded={sidebarOpen}
            className="flex h-9 w-9 items-center justify-center rounded-lg border border-slate-200 text-slate-600 lg:hidden"
          >
            <Icon name={sidebarOpen ? "close" : "menu"} className="h-5 w-5" />
          </button>

          <div className="flex min-w-0 items-center gap-2 text-sm">
            <span className="hidden text-slate-400 sm:inline">Commercial</span>
            <Icon name="chevronRight" className="hidden h-4 w-4 text-slate-300 sm:inline" />
            <span className="truncate font-semibold text-slate-900">
              {current?.title ?? "Workspace"}
            </span>
          </div>

          <div className="ml-auto flex items-center gap-2">
            <form method="get" action="/search" className="relative hidden md:block">
              <Icon
                name="search"
                className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400"
              />
              <input
                type="search"
                name="q"
                placeholder="Search deals, sellers…"
                className="h-9 w-60 rounded-lg border border-slate-200 bg-slate-50 pl-9 pr-3 text-sm outline-none transition placeholder:text-slate-400 focus:border-brand-500 focus:bg-white focus:ring-4 focus:ring-brand-500/10"
              />
            </form>
            <Link
              href="/notifications"
              title="Notifications"
              className="relative flex h-9 w-9 items-center justify-center rounded-lg border border-slate-200 text-slate-500 transition-colors hover:bg-slate-50 hover:text-slate-700"
            >
              <Icon name="bell" className="h-5 w-5" />
              {unreadCount > 0 ? (
                <span className="absolute -right-1.5 -top-1.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-brand-500 px-1 text-[0.6rem] font-semibold text-white ring-2 ring-white">
                  {unreadCount > 9 ? "9+" : unreadCount}
                </span>
              ) : null}
            </Link>
          </div>
        </header>

        <main className="mx-auto w-full max-w-[1400px] flex-1 px-4 py-6 sm:px-6 lg:px-8">
          {children}
        </main>
        </div>
      </div>
      {/* Copilot pane — a real reflowing column (desktop). Never an overlay; the
          workspace shrinks to make room and reclaims it on collapse. Unchanged. */}
      <div
        className="sticky top-0 hidden h-screen shrink-0 lg:block"
        style={{ width: copilotOpen ? copilotWidth : COPILOT_RAIL_WIDTH }}
      >
        <Suspense fallback={null}>
          <CopilotRegion />
        </Suspense>
      </div>
    </div>
  );
}

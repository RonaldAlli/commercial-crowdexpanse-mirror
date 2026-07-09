"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ReactNode, useState } from "react";
import type { UserRole } from "@prisma/client";

import { logoutAction } from "@/app/actions";
import { Icon, type IconName } from "@/components/icons";

type NavItem = {
  href: string;
  label: string;
  icon: IconName;
  section: string;
  title: string;
};

const navigation: NavItem[] = [
  { href: "/dashboard", label: "Dashboard", icon: "dashboard", section: "Overview", title: "Acquisitions dashboard" },
  { href: "/opportunities", label: "Pipeline", icon: "pipeline", section: "Overview", title: "Opportunity pipeline" },
  { href: "/analyzer", label: "Deal Analyzer", icon: "analyzer", section: "Overview", title: "Deal analyzer" },
  { href: "/matches", label: "Matches", icon: "spark", section: "Overview", title: "Buyer matches" },
  { href: "/sellers", label: "Sellers", icon: "sellers", section: "Records", title: "Sellers" },
  { href: "/buyers", label: "Buyers", icon: "buyers", section: "Records", title: "Buyers" },
  { href: "/properties", label: "Properties", icon: "properties", section: "Records", title: "Properties" },
  { href: "/tasks", label: "Tasks", icon: "tasks", section: "Workflow", title: "Tasks" },
  { href: "/notes", label: "Notes", icon: "notes", section: "Workflow", title: "Notes" },
  { href: "/activity", label: "Activity", icon: "activity", section: "Workflow", title: "Activity" },
  { href: "/documents", label: "Documents", icon: "files", section: "Workflow", title: "Documents" },
  { href: "/settings/team", label: "Team", icon: "buyers", section: "Settings", title: "Team" },
];

const sections = ["Overview", "Records", "Workflow", "Settings"];

export function WorkspaceShell({
  children,
  userEmail,
  userRole,
  unreadCount = 0,
}: {
  children: ReactNode;
  userEmail: string;
  userRole: UserRole;
  unreadCount?: number;
}) {
  const pathname = usePathname();
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const isAdmin = userRole === "ADMIN";
  // The Settings section (team management) is admin-only. Non-admins never see
  // it; direct navigation is independently blocked by requireRole (404).
  const visibleNav = navigation.filter((item) => item.section !== "Settings" || isAdmin);
  const visibleSections = sections.filter((section) =>
    visibleNav.some((item) => item.section === section),
  );

  const current = navigation.find((item) => pathname.startsWith(item.href));
  const initials = userEmail.slice(0, 2).toUpperCase();

  return (
    <div className="min-h-screen lg:grid lg:grid-cols-[260px_minmax(0,1fr)]">
      {/* Mobile overlay */}
      {sidebarOpen ? (
        <div
          className="fixed inset-0 z-20 bg-slate-900/40 lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      ) : null}

      {/* Sidebar */}
      <aside
        className={`fixed inset-y-0 left-0 z-30 flex w-[260px] flex-col border-r border-slate-200 bg-white transition-transform lg:static lg:translate-x-0 ${
          sidebarOpen ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        <div className="flex h-16 items-center gap-2.5 border-b border-slate-200 px-5">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand-600 text-white shadow-sm">
            <Icon name="properties" className="h-[1.125rem] w-[1.125rem]" />
          </div>
          <div className="leading-tight">
            <p className="text-sm font-semibold text-slate-900">CrowdExpanse</p>
            <p className="text-[0.7rem] font-medium uppercase tracking-[0.12em] text-brand-600">
              Commercial
            </p>
          </div>
        </div>

        <nav className="flex-1 space-y-6 overflow-y-auto px-3 py-5">
          {visibleSections.map((section) => (
            <div key={section} className="space-y-1">
              <p className="px-3 pb-1 text-[0.68rem] font-semibold uppercase tracking-[0.1em] text-slate-400">
                {section}
              </p>
              {visibleNav
                .filter((item) => item.section === section)
                .map((item) => {
                  const active = pathname.startsWith(item.href);
                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      onClick={() => setSidebarOpen(false)}
                      className={`group flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
                        active
                          ? "bg-brand-50 text-brand-700"
                          : "text-slate-600 hover:bg-slate-50 hover:text-slate-900"
                      }`}
                    >
                      <Icon
                        name={item.icon}
                        className={`h-[1.15rem] w-[1.15rem] ${
                          active ? "text-brand-600" : "text-slate-400 group-hover:text-slate-500"
                        }`}
                      />
                      {item.label}
                    </Link>
                  );
                })}
            </div>
          ))}
        </nav>

        <div className="border-t border-slate-200 p-3">
          <div className="flex items-center gap-3 rounded-lg px-2 py-1.5">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-slate-900 text-xs font-semibold text-white">
              {initials}
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium text-slate-900">Operator</p>
              <p className="truncate text-xs text-slate-500">{userEmail}</p>
            </div>
            <form action={logoutAction}>
              <button
                type="submit"
                title="Log out"
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
  );
}

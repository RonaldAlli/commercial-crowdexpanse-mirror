// CRE Operating Workspace — UI Milestone 1, Increment 1.
//
// Contract:
//   guarantees — presentational, keyboard-accessible navigation that shows only permitted items and
//     renders future workspaces as EXPLICITLY unavailable (aria-disabled, non-link, marked "Soon") so
//     they never imply completed functionality; available items are real links with a visible focus ring.
//   does NOT — fetch data, define permission semantics, or perform navigation logic; visibility is
//     decided by the injected permit predicate (intended source: the existing `can(...)` interface).
//   later increments supply — wiring to the live role/permissions and the real Milestone-1 destinations.

import Link from "next/link";

import { Icon } from "@/components/icons";
import { resolveNavForRole, type NavPermit, type WorkspaceNavItem } from "@/lib/workspace-ui/nav";

export function RoleAwareNav({
  items,
  permit,
  ariaLabel = "Workspace navigation",
  activeHref,
  className = "",
}: {
  items: WorkspaceNavItem[];
  permit: NavPermit;
  ariaLabel?: string;
  activeHref?: string;
  className?: string;
}) {
  const resolved = resolveNavForRole(items, permit);
  const sections = Array.from(new Set(resolved.filter((i) => i.visible).map((i) => i.section)));

  return (
    <nav aria-label={ariaLabel} className={`space-y-5 ${className}`}>
      {sections.map((section) => (
        <div key={section} className="space-y-1">
          <p className="px-3 pb-1 text-[0.68rem] font-semibold uppercase tracking-[0.1em] text-slate-400">{section}</p>
          <ul className="space-y-1">
            {resolved
              .filter((i) => i.visible && i.section === section)
              .map((item) => {
                const base = "group flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium";
                const icon = (
                  <span aria-hidden="true" className="inline-flex">
                    <Icon name={item.iconName} className="h-[1.15rem] w-[1.15rem] shrink-0" />
                  </span>
                );

                if (!item.active) {
                  // Future workspace — visible but explicitly unavailable. Not a link; not focusable as a
                  // navigation target; conveyed by text, not color alone.
                  return (
                    <li key={item.href}>
                      <span
                        aria-disabled="true"
                        className={`${base} cursor-not-allowed text-slate-400`}
                      >
                        {icon}
                        <span className="flex-1">{item.label}</span>
                        <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[0.6rem] font-semibold uppercase tracking-wide text-slate-500">
                          Soon
                        </span>
                        <span className="sr-only">— not available yet</span>
                      </span>
                    </li>
                  );
                }

                const isActive = activeHref ? activeHref.startsWith(item.href) : false;
                return (
                  <li key={item.href}>
                    <Link
                      href={item.href}
                      aria-current={isActive ? "page" : undefined}
                      className={`${base} transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 ${
                        isActive ? "bg-brand-50 text-brand-700" : "text-slate-600 hover:bg-slate-50 hover:text-slate-900"
                      }`}
                    >
                      {icon}
                      <span className="flex-1">{item.label}</span>
                    </Link>
                  </li>
                );
              })}
          </ul>
        </div>
      ))}
    </nav>
  );
}

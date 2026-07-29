// CRE Operating Workspace — UI Milestone 1, Increment 1 (presentational primitives).
//
// Role-aware navigation PRESENTATION. Pure, deterministic, no data access. It filters/annotates nav
// items using an injected permission predicate (the existing `can(role, action, resource)` interface is
// the intended source; it is injected so this module stays presentation-only and unit-testable). It does
// NOT define new permission semantics. Future-workspace items are marked `future` and rendered as
// explicitly unavailable — never hidden as if done, and never presented as active functionality.

import type { IconName } from "@/components/icons";

export type NavAvailability = "available" | "future";

export type WorkspaceNavItem = {
  href: string;
  label: string;
  iconName: IconName;
  section: string;
  /** "available" = a Milestone-1 destination; "future" = a later workspace, shown as unavailable. */
  availability: NavAvailability;
  /** Optional resource this item requires READ on; when set, the injected predicate gates visibility. */
  requires?: string;
};

export type ResolvedNavItem = WorkspaceNavItem & {
  /** True when the item should appear at all (permission-gated). */
  visible: boolean;
  /** True only for available items the user may act on; future items are never active. */
  active: boolean;
};

/** Predicate over a required resource — inject `(resource) => can(role, "READ", resource)`. */
export type NavPermit = (requires: string) => boolean;

/**
 * Resolve nav items for a role. Deterministic. An item is visible unless it declares a `requires`
 * resource the predicate denies. `active` is true ONLY for available, permitted items; future items are
 * visible-but-inactive so the UI can mark them unavailable without implying completed functionality.
 */
export function resolveNavForRole(items: WorkspaceNavItem[], permit: NavPermit): ResolvedNavItem[] {
  return items.map((item) => {
    const permitted = item.requires ? permit(item.requires) : true;
    const visible = permitted;
    const active = visible && item.availability === "available";
    return { ...item, visible, active };
  });
}

/** Visible items only, preserving input order. Pure convenience over `resolveNavForRole`. */
export function visibleNavForRole(items: WorkspaceNavItem[], permit: NavPermit): ResolvedNavItem[] {
  return resolveNavForRole(items, permit).filter((i) => i.visible);
}

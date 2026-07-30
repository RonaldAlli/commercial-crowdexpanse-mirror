// CRE Operating Workspace — Closing Workspace, Increment 2: Blocker Detail + Ownership + Next Milestone.
//
// PURE PRESENTATION LOGIC ONLY — deterministic, no data access, no clock/random, no calculation. Enriches
// (does not replace) the Increment-1 Executive Closing Summary: it answers "What is blocking closing, who owns
// each blocker, and what should happen next?" over ALREADY-PERSISTED authority (checklist blockers with their
// persisted owner id + due date, in-progress operational domains, and the existing next-milestone selection).
//
// BOUNDARIES: read-only. No owner assignment, no due-date edits, no milestone generation, no console
// duplication. Ownership names are RESOLVED (in the page, one org-scoped query) — never inferred; an
// unresolved / absent owner is stated honestly.
//
// OWNERSHIP CLARITY (refinement): checklist blockers are GROUPED by owner so the operator immediately sees
// whether one person owns many blockers, many owners each own some, or ownership is unknown — using only the
// persisted ownership records, never inferring organisational responsibility.
//
// CLOSING CONFIDENCE (carry-forward): checklist evidence (checklist blockers), operational-domain evidence
// (in-progress domains) and ownership evidence (resolved vs unassigned/unresolved) are kept DISTINCT.

export type BlockerDomain = "Checklist" | "Escrow" | "Financing" | "Assignment";

/** One checklist blocker (persisted order preserved; never reprioritised, no synthesised severity). */
export type ChecklistBlockerInput = {
  title: string;
  statusLabel: string;
  hasOwnerId: boolean; // an owner id is persisted on the item
  ownerName: string | null; // resolved display name (null when the id could not be resolved)
  dueDate: string | null; // ISO, or null
};
export type DomainBlockerInput = { domain: "Escrow" | "Financing" | "Assignment"; statusLabel: string };
export type NextMilestoneInput = { label: string; dateIso: string; overdue: boolean } | null;

export type ClosingBlockersInput = {
  checklistBlockers: ChecklistBlockerInput[]; // persisted order
  domainBlockers: DomainBlockerInput[]; // in-progress operational domains
  nextMilestone: NextMilestoneInput;
};

export type BlockerItemView = { title: string; statusLabel: string; dueDate: string | null; domain: BlockerDomain };
export type OwnerGroupView = { ownerLabel: string; ownerResolved: boolean; items: BlockerItemView[] };
export type NextMilestoneView = { label: string; date: string; overdue: boolean; overdueLabel: string | null } | null;

export type ClosingBlockersView = {
  hasBlockers: boolean;
  ownerGroups: OwnerGroupView[]; // checklist blockers grouped by owner (Ownership clarity)
  domainBlockers: BlockerItemView[]; // operational-domain blockers (no checklist owner)
  nextMilestone: NextMilestoneView;
};

const UNASSIGNED = "Unassigned";
const UNRESOLVED = "Owner on record — name unavailable";

function ownerLabelOf(b: ChecklistBlockerInput): { label: string; resolved: boolean } {
  if (!b.hasOwnerId) return { label: UNASSIGNED, resolved: false };
  if (!b.ownerName) return { label: UNRESOLVED, resolved: false };
  return { label: b.ownerName, resolved: true };
}

/** Deterministic, read-only enrichment: owner-grouped checklist blockers + domain blockers + next milestone. */
export function buildClosingBlockersView(input: ClosingBlockersInput): ClosingBlockersView {
  // Group checklist blockers by owner, preserving first-appearance (persisted) order — no reprioritisation.
  const order: string[] = [];
  const byOwner = new Map<string, OwnerGroupView>();
  for (const b of input.checklistBlockers) {
    const { label, resolved } = ownerLabelOf(b);
    let g = byOwner.get(label);
    if (!g) {
      g = { ownerLabel: label, ownerResolved: resolved, items: [] };
      byOwner.set(label, g);
      order.push(label);
    }
    g.items.push({ title: b.title, statusLabel: b.statusLabel, dueDate: b.dueDate, domain: "Checklist" });
  }
  const ownerGroups = order.map((k) => byOwner.get(k) as OwnerGroupView);

  const domainBlockers: BlockerItemView[] = input.domainBlockers.map((d) => ({
    title: d.domain,
    statusLabel: d.statusLabel,
    dueDate: null,
    domain: d.domain,
  }));

  const nm = input.nextMilestone;
  const nextMilestone: NextMilestoneView = nm
    ? { label: nm.label, date: nm.dateIso.slice(0, 10), overdue: nm.overdue, overdueLabel: nm.overdue ? "Overdue" : null }
    : null;

  return {
    hasBlockers: ownerGroups.length > 0 || domainBlockers.length > 0,
    ownerGroups,
    domainBlockers,
    nextMilestone,
  };
}

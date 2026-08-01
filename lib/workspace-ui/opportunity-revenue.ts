// CRE Operating Workspace — Revenue Workspace, Milestone 1, Increment 3 (per-deal Revenue).
//
// Pure view-model for the Opportunity Workspace "Revenue" section. It SEPARATES the three revenue concepts
// (Financial Truthfulness) and builds an EVIDENCE-BASED Revenue Timeline from ACTIVE authority only (Active
// Evidence contract): recorded ActivityLog events + the active AssignmentRecord — NEVER the dormant pipeline
// facts. A step is "occurred" only when a real recorded event/record exists; otherwise it is honestly pending,
// with no fabricated date. It computes no financial value: Expected = the contracted assignment fee, Realized =
// the executed fee snapshot, Projected = a reference to Guided Underwriting. Revenue Traceability: Realized links
// to the assignment evidence; Projected links to underwriting.

export type ActivityEventInput = { eventType: string; occurredAt: Date };

export type OpportunityRevenueInput = {
  opportunityId: string;
  expectedFeeUsd: number | null; // Opportunity.assignmentFeeUsd (contracted)
  assignment: { status: string; executedFeeUsdSnapshot: number | null; resolvedAt: Date | null; createdAt: Date } | null;
  hasProjected: boolean; // an active underwriting scenario exists
  activityEvents: ActivityEventInput[]; // the opportunity's recorded ActivityLog events (active authority)
};

export type RevenueTier =
  | { kind: "projected"; label: "Projected"; meaning: string; available: boolean; href: string | null; detail: string }
  | { kind: "expected"; label: "Expected"; meaning: string; valueUsd: number | null; detail: string }
  | { kind: "realized"; label: "Realized"; meaning: string; realized: boolean; valueUsd: number | null; executedAt: Date | null; href: string; detail: string };

export type RevenueTimelineStep = {
  key: string;
  label: string;
  occurred: boolean;
  occurredAt: Date | null; // only ever a real recorded date — never fabricated
  kind: "reference" | "event";
};

export type OpportunityRevenueView = {
  tiers: [RevenueTier, RevenueTier, RevenueTier]; // Projected, Expected, Realized (order preserved, never combined)
  timeline: RevenueTimelineStep[];
};

/** Earliest recorded time among events matching the predicate, or null when none was ever recorded. */
function earliest(events: ActivityEventInput[], match: (t: string) => boolean): Date | null {
  let best: Date | null = null;
  for (const e of events) {
    if (!match(e.eventType)) continue;
    if (best == null || e.occurredAt.getTime() < best.getTime()) best = e.occurredAt;
  }
  return best;
}

export function buildOpportunityRevenueView(input: OpportunityRevenueInput): OpportunityRevenueView {
  const executed = input.assignment?.status === "EXECUTED";

  const projected: RevenueTier = {
    kind: "projected",
    label: "Projected",
    meaning: "Underwriting estimate",
    available: input.hasProjected,
    href: input.hasProjected ? `/guided-underwriting/${input.opportunityId}` : null,
    detail: input.hasProjected ? "See Guided Underwriting" : "Not started",
  };
  const expected: RevenueTier = {
    kind: "expected",
    label: "Expected",
    meaning: "Contracted — expected at closing",
    valueUsd: input.expectedFeeUsd,
    detail: input.expectedFeeUsd == null ? "Not set" : "Assignment fee on record",
  };
  const realized: RevenueTier = {
    kind: "realized",
    label: "Realized",
    meaning: "Actually received — executed assignment fee",
    realized: executed,
    valueUsd: executed ? (input.assignment?.executedFeeUsdSnapshot ?? 0) : null,
    executedAt: executed ? (input.assignment?.resolvedAt ?? null) : null,
    href: `/closing-workspace/${input.opportunityId}`, // Revenue Traceability: Revenue → Assignment
    detail: executed ? "View assignment evidence" : "Not yet realized",
  };

  // Evidence-based timeline (Active Evidence). Every event step derives its status/date from a real recorded
  // ActivityLog event or the active AssignmentRecord — pending steps have no fabricated date.
  const ev = input.activityEvents;
  const contractAt = earliest(ev, (t) => t === "deal.controlled");
  const escrowAt = earliest(ev, (t) => t.startsWith("escrow."));
  const financingAt = earliest(ev, (t) => t.startsWith("financing."));
  const settlementAt = earliest(ev, (t) => t.startsWith("settlement."));

  const timeline: RevenueTimelineStep[] = [
    { key: "projected", label: "Projected revenue", occurred: input.hasProjected, occurredAt: null, kind: "reference" },
    { key: "contract_executed", label: "Contract executed", occurred: contractAt != null, occurredAt: contractAt, kind: "event" },
    { key: "assignment_created", label: "Assignment created", occurred: input.assignment != null, occurredAt: input.assignment?.createdAt ?? null, kind: "event" },
    { key: "escrow_activity", label: "Escrow activity", occurred: escrowAt != null, occurredAt: escrowAt, kind: "event" },
    { key: "financing_activity", label: "Financing activity", occurred: financingAt != null, occurredAt: financingAt, kind: "event" },
    { key: "settlement", label: "Settlement", occurred: settlementAt != null, occurredAt: settlementAt, kind: "event" },
    { key: "revenue_realized", label: "Revenue realized", occurred: executed, occurredAt: executed ? (input.assignment?.resolvedAt ?? null) : null, kind: "event" },
  ];

  return { tiers: [projected, expected, realized], timeline };
}

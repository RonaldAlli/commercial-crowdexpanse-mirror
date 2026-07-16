// Closing Center Slice 5 — Transaction Dashboard: the PURE projection. Owns the inclusion
// predicate, the deterministic next-milestone selection, and the per-row view-model. NO Prisma,
// NO clock, NO I/O — every value is DERIVED AT READ TIME from operational records already owned
// by the four Closing domains (TX-2 projection purity); nothing is cached, persisted, or
// materialized, and there is NO new source of truth. It NEVER mutates its inputs (TX-3 — the
// dashboard is orchestration, not ownership) and never touches the underwriting engine (TD-K).
// The row shape is presentation-neutral so roadmap #7 (Opportunity-list badges, a SEPARATE
// follow-up slice) can reuse it. Design authority: docs/architecture/CLOSING_CENTER_ARCHITECTURE_LOCK.md
// (Slice 5 — Transaction Dashboard) + docs/architecture/TRANSACTION_DASHBOARD_DECISION_PACKAGE.md.
import type { AssignmentStatus, EscrowStatus, FinancingStatus, OpportunityStage } from "@prisma/client";

import type { Tone } from "@/components/ui/badge";
import { blockingItems, closingReadinessSummary, type GateItem } from "@/lib/closing";
import { escrowStatusLabel, escrowStatusTone } from "@/lib/escrow";
import { financingStatusLabel, financingStatusTone } from "@/lib/financing";
import { assignmentStatusLabel, assignmentStatusTone } from "@/lib/assignment";

// --- inclusion (TD-A, ratified stage semantics) -------------------------------
// "In-flight past UNDER_CONTRACT" = closing is active but not done. PAID is CLOSED (surfaced
// only via an explicit opt-in filter, never the default); stages before UNDER_CONTRACT never
// appear. No cancelled/dead/terminal-non-closing stage exists in the pipeline.
export const IN_FLIGHT_STAGES: OpportunityStage[] = ["UNDER_CONTRACT", "BUYER_MATCHED", "CLOSING"];
export const CLOSED_STAGE: OpportunityStage = "PAID";

export function isInFlightStage(stage: OpportunityStage): boolean {
  return IN_FLIGHT_STAGES.includes(stage);
}

/** Stages the dashboard may show: in-flight always; PAID only when the caller opts in. */
export function dashboardStages(includeClosed: boolean): OpportunityStage[] {
  return includeClosed ? [...IN_FLIGHT_STAGES, CLOSED_STAGE] : [...IN_FLIGHT_STAGES];
}

// --- input (plain data mapped from Prisma in the route; all dates as epoch ms) --

/** A checklist item reduced to what the projection reads (label carried for readiness/blockers). */
export type DashboardChecklistItem = GateItem & { label: string; dueDateMs: number | null; ownerName: string | null };

export type TransactionProjectionInput = {
  opportunity: { id: string; title: string; stage: OpportunityStage; propertyName: string; targetCloseDateMs: number | null };
  // null = no closing checklist has been started (an explicit empty state, not a crash).
  checklistItems: DashboardChecklistItem[] | null;
  escrow: { status: EscrowStatus; earnestDueDateMs: number | null; contingencyDeadlineMs: number | null } | null;
  financing: { status: FinancingStatus } | null;
  assignment: { status: AssignmentStatus } | null;
};

// --- next-milestone selection (TD-D, pure + deterministic) --------------------
// Rules (ratified): use ONLY existing forward-looking deadlines (opportunity target close, the
// escrow earnest-due + contingency deadlines while escrow is live, and PENDING checklist item
// due dates); ignore satisfied/irrelevant ones; the reference date is INJECTED (never read from
// the clock); overdue is distinguished from upcoming; nothing is written or rescheduled. The
// financing/assignment date fields are historical event stamps (not deadlines), so they are
// deliberately NOT candidates — those domains contribute status only.

export type MilestoneCandidate = { label: string; dateMs: number };
export type NextMilestone = { label: string; dateIso: string; overdue: boolean };

const ESCROW_LIVE: EscrowStatus[] = ["OPENED", "DEPOSITED"]; // not NOT_OPENED, not terminal

/** Gather the live forward-looking deadline candidates in a deterministic domain order. */
export function milestoneCandidates(input: TransactionProjectionInput): MilestoneCandidate[] {
  const out: MilestoneCandidate[] = [];
  const { opportunity, escrow, checklistItems } = input;
  if (opportunity.targetCloseDateMs != null) out.push({ label: "Target close", dateMs: opportunity.targetCloseDateMs });
  if (escrow && ESCROW_LIVE.includes(escrow.status)) {
    // Earnest is only still "due" before it is deposited.
    if (escrow.status === "OPENED" && escrow.earnestDueDateMs != null) out.push({ label: "Earnest due", dateMs: escrow.earnestDueDateMs });
    if (escrow.contingencyDeadlineMs != null) out.push({ label: "Contingency deadline", dateMs: escrow.contingencyDeadlineMs });
  }
  for (const it of checklistItems ?? []) {
    if (it.status === "PENDING" && it.dueDateMs != null) out.push({ label: it.label, dateMs: it.dueDateMs });
  }
  return out;
}

/**
 * Pick the single most-pressing deadline relative to `referenceMs` (injected). Overdue deadlines
 * take precedence (they need attention now); among them the EARLIEST-missed is surfaced. With
 * none overdue, the SOONEST upcoming is "next". Ties break by candidate order (deterministic).
 * Returns null when there is no live deadline. Pure; `new Date(ms)` is a value conversion, not a
 * clock read.
 */
export function selectNextMilestone(candidates: MilestoneCandidate[], referenceMs: number): NextMilestone | null {
  let best: { c: MilestoneCandidate; overdue: boolean } | null = null;
  for (const c of candidates) {
    const overdue = c.dateMs < referenceMs;
    if (best === null) {
      best = { c, overdue };
      continue;
    }
    // Overdue beats upcoming; within the same class, the earlier date wins (strictly, so ties
    // keep the earlier-listed candidate — deterministic).
    if (overdue && !best.overdue) best = { c, overdue };
    else if (overdue === best.overdue && c.dateMs < best.c.dateMs) best = { c, overdue };
  }
  if (best === null) return null;
  return { label: best.c.label, dateIso: new Date(best.c.dateMs).toISOString(), overdue: best.overdue };
}

// --- the row view-model (TD-C, presentation-neutral) --------------------------

export type StatusChip = { label: string; tone: Tone };

export type TransactionRow = {
  opportunityId: string;
  title: string;
  propertyName: string;
  stage: OpportunityStage;
  closed: boolean; // PAID
  // Readiness (null when no checklist has been started — an explicit empty state).
  readiness: { ready: boolean; requiredSatisfied: number; requiredTotal: number; outstandingCount: number; blockerLabels: string[] } | null;
  escrow: StatusChip | null;
  financing: StatusChip | null;
  assignment: StatusChip | null;
  nextMilestone: NextMilestone | null;
  responsibleParties: string[]; // distinct owners of outstanding required items (may be empty)
  href: string; // link OUT to the Opportunity Closing Center (no inline editing, TX-3)
};

/**
 * Project ONE dashboard row for a qualifying Opportunity, deriving every value at read time and
 * reusing the authoritative Closing/Escrow/Financing/Assignment helpers so the dashboard can
 * never disagree with the Closing Center (TD-5). `referenceMs` is injected (TD-D). Never mutates
 * `input`.
 */
export function projectTransactionRow(input: TransactionProjectionInput, referenceMs: number): TransactionRow {
  const { opportunity, checklistItems, escrow, financing, assignment } = input;

  const readiness = checklistItems
    ? (() => {
        const summary = closingReadinessSummary(checklistItems);
        return {
          ready: summary.ready,
          requiredSatisfied: summary.requiredSatisfied,
          requiredTotal: summary.requiredTotal,
          outstandingCount: summary.outstandingCount,
          blockerLabels: blockingItems(checklistItems).map((i) => i.label),
        };
      })()
    : null;

  // Responsible = distinct owners of the outstanding required (blocking) items, in first-seen order.
  const responsibleParties = checklistItems
    ? Array.from(new Set(blockingItems(checklistItems).map((i) => i.ownerName).filter((n): n is string => !!n && n.trim().length > 0)))
    : [];

  return {
    opportunityId: opportunity.id,
    title: opportunity.title,
    propertyName: opportunity.propertyName,
    stage: opportunity.stage,
    closed: opportunity.stage === CLOSED_STAGE,
    readiness,
    escrow: escrow ? { label: escrowStatusLabel(escrow.status), tone: escrowStatusTone(escrow.status) } : null,
    financing: financing ? { label: financingStatusLabel(financing.status), tone: financingStatusTone(financing.status) } : null,
    assignment: assignment ? { label: assignmentStatusLabel(assignment.status), tone: assignmentStatusTone(assignment.status) } : null,
    nextMilestone: selectNextMilestone(milestoneCandidates(input), referenceMs),
    responsibleParties,
    href: `/opportunities/${opportunity.id}`,
  };
}

// --- deterministic row ordering (TD-10) ---------------------------------------
// A total, DB-order-independent ordering so screenshots, Playwright, pagination, and the user's
// experience are deterministic. Priority: (1) overdue first, (2) soonest next milestone
// (has-a-date before none; then date ascending — for overdue rows that surfaces the most-overdue
// first), (3) pipeline stage order, (4) opportunity title, (5) opportunity id. Plain `<`/`>`
// comparisons (not locale-dependent) keep it stable across environments. Pure; returns a NEW
// array (never mutates the input, TD-12).
const DASHBOARD_STAGE_ORDER: OpportunityStage[] = [...IN_FLIGHT_STAGES, CLOSED_STAGE];
function stageRank(stage: OpportunityStage): number {
  const i = DASHBOARD_STAGE_ORDER.indexOf(stage);
  return i < 0 ? DASHBOARD_STAGE_ORDER.length : i;
}

export function compareTransactionRows(a: TransactionRow, b: TransactionRow): number {
  // 1. Overdue first.
  const ao = a.nextMilestone?.overdue ? 0 : 1;
  const bo = b.nextMilestone?.overdue ? 0 : 1;
  if (ao !== bo) return ao - bo;
  // 2. Soonest next milestone — a row with a date precedes one without; then date ascending.
  const ad = a.nextMilestone?.dateIso ?? null;
  const bd = b.nextMilestone?.dateIso ?? null;
  if (ad !== bd) {
    if (ad === null) return 1;
    if (bd === null) return -1;
    return ad < bd ? -1 : 1; // ISO strings sort chronologically
  }
  // 3. Pipeline stage order.
  const as = stageRank(a.stage);
  const bs = stageRank(b.stage);
  if (as !== bs) return as - bs;
  // 4. Opportunity title, then 5. id — the final deterministic tie-breakers.
  if (a.title !== b.title) return a.title < b.title ? -1 : 1;
  if (a.opportunityId === b.opportunityId) return 0;
  return a.opportunityId < b.opportunityId ? -1 : 1;
}

/** Apply the TD-10 total ordering, returning a new array (input untouched). */
export function sortTransactionRows(rows: TransactionRow[]): TransactionRow[] {
  return [...rows].sort(compareTransactionRows);
}

import { test } from "node:test";
import assert from "node:assert/strict";

import {
  IN_FLIGHT_STAGES,
  isInFlightStage,
  dashboardStages,
  milestoneCandidates,
  selectNextMilestone,
  projectTransactionRow,
  sortTransactionRows,
  compareTransactionRows,
  type TransactionProjectionInput,
  type TransactionRow,
  type DashboardChecklistItem,
} from "../../../lib/transaction-dashboard";

// A fixed injected reference instant (UTC) — the pure functions never read the clock.
const REF = Date.parse("2026-07-16T00:00:00.000Z");
const day = (iso: string) => Date.parse(`${iso}T00:00:00.000Z`);

function item(over: Partial<DashboardChecklistItem> = {}): DashboardChecklistItem {
  return { required: true, status: "PENDING", label: "Title search", dueDateMs: null, ownerName: null, ...over };
}

function mkInput(over: Partial<TransactionProjectionInput> = {}): TransactionProjectionInput {
  return {
    opportunity: { id: "opp-1", title: "Riverbend", stage: "CLOSING", propertyName: "Riverbend Apartments", targetCloseDateMs: null },
    checklistItems: [
      item({ label: "Title search", status: "COMPLETE" }),
      item({ label: "Inspection", status: "PENDING", ownerName: "Dana Lee" }),
      item({ label: "Environmental", required: false, status: "PENDING" }),
    ],
    escrow: { status: "OPENED", earnestDueDateMs: null, contingencyDeadlineMs: null },
    financing: { status: "APPLIED" },
    assignment: { status: "DRAFTED" },
    ...over,
  };
}

// --- inclusion (TD-A) --------------------------------------------------------
test("in-flight stages are exactly UNDER_CONTRACT/BUYER_MATCHED/CLOSING", () => {
  assert.deepEqual([...IN_FLIGHT_STAGES], ["UNDER_CONTRACT", "BUYER_MATCHED", "CLOSING"]);
  for (const s of ["UNDER_CONTRACT", "BUYER_MATCHED", "CLOSING"] as const) assert.equal(isInFlightStage(s), true);
  // Before UNDER_CONTRACT and the closed PAID stage are excluded.
  for (const s of ["LEAD", "UNDERWRITING", "LOI_SENT", "PAID"] as const) assert.equal(isInFlightStage(s), false);
});

test("dashboardStages includes PAID only when the caller opts in", () => {
  assert.deepEqual(dashboardStages(false), ["UNDER_CONTRACT", "BUYER_MATCHED", "CLOSING"]);
  assert.deepEqual(dashboardStages(true), ["UNDER_CONTRACT", "BUYER_MATCHED", "CLOSING", "PAID"]);
});

// --- next-milestone selection (TD-D) -----------------------------------------
test("candidates gather only live forward-looking deadlines in deterministic order", () => {
  const input = mkInput({
    opportunity: { id: "o", title: "t", stage: "CLOSING", propertyName: "p", targetCloseDateMs: day("2026-08-01") },
    escrow: { status: "OPENED", earnestDueDateMs: day("2026-07-20"), contingencyDeadlineMs: day("2026-07-25") },
    checklistItems: [
      item({ label: "Inspection", status: "PENDING", dueDateMs: day("2026-07-18") }),
      item({ label: "Done item", status: "COMPLETE", dueDateMs: day("2026-07-10") }), // ignored (not PENDING)
      item({ label: "No due", status: "PENDING", dueDateMs: null }), // ignored (no date)
    ],
  });
  assert.deepEqual(milestoneCandidates(input).map((c) => c.label), ["Target close", "Earnest due", "Contingency deadline", "Inspection"]);
});

test("earnest-due drops once deposited; contingency stays while escrow is live; terminal escrow contributes none", () => {
  const base = mkInput({ opportunity: { id: "o", title: "t", stage: "CLOSING", propertyName: "p", targetCloseDateMs: null }, checklistItems: null });
  const deposited = milestoneCandidates({ ...base, escrow: { status: "DEPOSITED", earnestDueDateMs: day("2026-07-20"), contingencyDeadlineMs: day("2026-07-25") } });
  assert.deepEqual(deposited.map((c) => c.label), ["Contingency deadline"]); // earnest gone, contingency kept
  const released = milestoneCandidates({ ...base, escrow: { status: "RELEASED", earnestDueDateMs: day("2026-07-20"), contingencyDeadlineMs: day("2026-07-25") } });
  assert.deepEqual(released, []); // terminal escrow → no live deadline
});

test("overdue deadlines take precedence and surface the earliest-missed; else the soonest upcoming", () => {
  // Overdue present → earliest overdue wins even though an upcoming date is nearer to ref.
  const withOverdue = selectNextMilestone(
    [
      { label: "Upcoming soon", dateMs: day("2026-07-17") },
      { label: "Missed late", dateMs: day("2026-07-14") },
      { label: "Missed early", dateMs: day("2026-07-10") },
    ],
    REF,
  );
  assert.deepEqual(withOverdue, { label: "Missed early", dateIso: "2026-07-10T00:00:00.000Z", overdue: true });

  // None overdue → soonest upcoming.
  const upcoming = selectNextMilestone(
    [
      { label: "Later", dateMs: day("2026-08-01") },
      { label: "Sooner", dateMs: day("2026-07-20") },
    ],
    REF,
  );
  assert.deepEqual(upcoming, { label: "Sooner", dateIso: "2026-07-20T00:00:00.000Z", overdue: false });

  assert.equal(selectNextMilestone([], REF), null);
});

test("a deadline exactly at the reference instant counts as upcoming, not overdue", () => {
  const at = selectNextMilestone([{ label: "At ref", dateMs: REF }], REF);
  assert.deepEqual(at, { label: "At ref", dateIso: "2026-07-16T00:00:00.000Z", overdue: false });
});

test("equal dates break ties by candidate order (deterministic)", () => {
  const d = day("2026-07-20");
  const picked = selectNextMilestone([{ label: "First", dateMs: d }, { label: "Second", dateMs: d }], REF);
  assert.equal(picked?.label, "First");
});

// --- row projection (TD-C) ---------------------------------------------------
test("a projected row reuses the authoritative readiness + status helpers", () => {
  const row = projectTransactionRow(mkInput(), REF);
  assert.equal(row.opportunityId, "opp-1");
  assert.equal(row.stage, "CLOSING");
  assert.equal(row.closed, false);
  assert.equal(row.href, "/opportunities/opp-1");
  // 1 required COMPLETE of 2 required (Environmental is optional) → not ready, 1 outstanding.
  assert.equal(row.readiness?.requiredTotal, 2);
  assert.equal(row.readiness?.requiredSatisfied, 1);
  assert.equal(row.readiness?.ready, false);
  assert.equal(row.readiness?.outstandingCount, 1);
  assert.deepEqual(row.readiness?.blockerLabels, ["Inspection"]);
  assert.deepEqual(row.escrow, { label: "Opened", tone: "info" });
  assert.equal(row.financing?.label, "Applied");
  assert.equal(row.assignment?.label, "Drafted");
  // Responsible = distinct owners of outstanding required items.
  assert.deepEqual(row.responsibleParties, ["Dana Lee"]);
});

test("no checklist yet → readiness null, responsible empty, never crashes (empty state)", () => {
  const row = projectTransactionRow(mkInput({ checklistItems: null }), REF);
  assert.equal(row.readiness, null);
  assert.deepEqual(row.responsibleParties, []);
});

test("missing optional domain records still produce a visible row (nulls, no exclusion)", () => {
  const row = projectTransactionRow(
    mkInput({ escrow: null, financing: null, assignment: null, checklistItems: [], opportunity: { id: "o2", title: "Bare", stage: "UNDER_CONTRACT", propertyName: "Lot 7", targetCloseDateMs: null } }),
    REF,
  );
  assert.equal(row.escrow, null);
  assert.equal(row.financing, null);
  assert.equal(row.assignment, null);
  assert.equal(row.nextMilestone, null); // no live deadlines
  assert.equal(row.readiness?.requiredTotal, 0);
  assert.equal(row.readiness?.ready, false); // OPP-1: an empty checklist is NOT vacuously ready (fail closed)
});

test("a ready deal reports ready with no blockers", () => {
  const row = projectTransactionRow(
    mkInput({ checklistItems: [item({ label: "Only", status: "COMPLETE" })] }),
    REF,
  );
  assert.equal(row.readiness?.ready, true);
  assert.deepEqual(row.readiness?.blockerLabels, []);
  assert.deepEqual(row.responsibleParties, []);
});

test("PAID opportunity is marked closed", () => {
  const row = projectTransactionRow(mkInput({ opportunity: { id: "o", title: "t", stage: "PAID", propertyName: "p", targetCloseDateMs: null } }), REF);
  assert.equal(row.closed, true);
});

test("the projection never mutates its input", () => {
  const input = mkInput();
  const snapshot = JSON.stringify(input);
  projectTransactionRow(input, REF);
  assert.equal(JSON.stringify(input), snapshot);
});

test("blank/whitespace owner names are dropped from responsible parties", () => {
  const row = projectTransactionRow(
    mkInput({
      checklistItems: [
        item({ label: "A", status: "PENDING", ownerName: "  " }),
        item({ label: "B", status: "PENDING", ownerName: "Sam Rivera" }),
        item({ label: "C", status: "PENDING", ownerName: "Sam Rivera" }), // de-duped
      ],
    }),
    REF,
  );
  assert.deepEqual(row.responsibleParties, ["Sam Rivera"]);
});

// --- TD-10: deterministic row ordering ---------------------------------------
function mkRow(over: Partial<TransactionRow> = {}): TransactionRow {
  return {
    opportunityId: "id",
    title: "Deal",
    propertyName: "Prop",
    stage: "UNDER_CONTRACT",
    closed: false,
    readiness: null,
    escrow: null,
    financing: null,
    assignment: null,
    nextMilestone: null,
    responsibleParties: [],
    href: "/opportunities/id",
    ...over,
  };
}
const milestone = (dateIso: string, overdue: boolean) => ({ label: "m", dateIso, overdue });

test("ordering (TD-10): overdue → soonest milestone → stage → title → id", () => {
  const overdueLate = mkRow({ opportunityId: "a", title: "A", nextMilestone: milestone("2026-07-14T00:00:00.000Z", true) });
  const overdueEarly = mkRow({ opportunityId: "b", title: "B", nextMilestone: milestone("2026-07-10T00:00:00.000Z", true) });
  const upcomingSoon = mkRow({ opportunityId: "c", title: "C", nextMilestone: milestone("2026-07-20T00:00:00.000Z", false) });
  const upcomingLate = mkRow({ opportunityId: "d", title: "D", nextMilestone: milestone("2026-08-01T00:00:00.000Z", false) });
  const noDate = mkRow({ opportunityId: "e", title: "E", nextMilestone: null });
  const sorted = sortTransactionRows([noDate, upcomingLate, upcomingSoon, overdueLate, overdueEarly]);
  assert.deepEqual(sorted.map((r) => r.opportunityId), ["b", "a", "c", "d", "e"]);
});

test("ordering tie-breakers fall through stage → title → id deterministically", () => {
  // All same milestone class (none) → stage order, then title, then id.
  const closing = mkRow({ opportunityId: "z", title: "Z", stage: "CLOSING" });
  const ucBeta = mkRow({ opportunityId: "y", title: "Beta", stage: "UNDER_CONTRACT" });
  const ucAlphaHi = mkRow({ opportunityId: "x2", title: "Alpha", stage: "UNDER_CONTRACT" });
  const ucAlphaLo = mkRow({ opportunityId: "x1", title: "Alpha", stage: "UNDER_CONTRACT" });
  const sorted = sortTransactionRows([closing, ucBeta, ucAlphaHi, ucAlphaLo]);
  // UNDER_CONTRACT before CLOSING; within it Alpha before Beta; equal titles break by id.
  assert.deepEqual(sorted.map((r) => r.opportunityId), ["x1", "x2", "y", "z"]);
  assert.equal(compareTransactionRows(ucAlphaLo, ucAlphaLo), 0); // reflexive
});

test("sortTransactionRows returns a NEW array and never mutates the input (TD-10/TD-12)", () => {
  const input = [mkRow({ opportunityId: "b", nextMilestone: null }), mkRow({ opportunityId: "a", nextMilestone: milestone("2026-07-01T00:00:00.000Z", true) })];
  const order = input.map((r) => r.opportunityId);
  const sorted = sortTransactionRows(input);
  assert.notEqual(sorted, input); // new array
  assert.deepEqual(input.map((r) => r.opportunityId), order); // input order preserved
  assert.deepEqual(sorted.map((r) => r.opportunityId), ["a", "b"]);
});

// --- TD-11: projection independence (graceful degradation) -------------------
test("independence (TD-11): a deal with EVERY optional record missing still renders a full row", () => {
  const row = projectTransactionRow(
    {
      opportunity: { id: "bare", title: "Bare deal", stage: "BUYER_MATCHED", propertyName: "Empty Lot", targetCloseDateMs: null },
      checklistItems: null, // no checklist
      escrow: null, // no escrow
      financing: null, // no financing
      assignment: null, // no assignment
    },
    REF,
  );
  assert.equal(row.opportunityId, "bare");
  assert.equal(row.readiness, null);
  assert.equal(row.escrow, null);
  assert.equal(row.financing, null);
  assert.equal(row.assignment, null);
  assert.equal(row.nextMilestone, null);
  assert.deepEqual(row.responsibleParties, []);
  assert.equal(row.href, "/opportunities/bare"); // never suppressed
});

test("independence (TD-11): any single missing domain never drops the others", () => {
  const base = mkInput();
  // Escrow missing but financing/assignment/checklist present.
  const noEscrow = projectTransactionRow({ ...base, escrow: null }, REF);
  assert.equal(noEscrow.escrow, null);
  assert.ok(noEscrow.financing && noEscrow.assignment && noEscrow.readiness);
  // Checklist missing but the domain records present.
  const noChecklist = projectTransactionRow({ ...base, checklistItems: null }, REF);
  assert.equal(noChecklist.readiness, null);
  assert.ok(noChecklist.escrow && noChecklist.financing && noChecklist.assignment);
});

test("the row's next milestone integrates candidates + selection end-to-end", () => {
  const row = projectTransactionRow(
    mkInput({
      opportunity: { id: "o", title: "t", stage: "CLOSING", propertyName: "p", targetCloseDateMs: day("2026-07-12") }, // overdue
      escrow: { status: "OPENED", earnestDueDateMs: null, contingencyDeadlineMs: day("2026-07-30") },
      checklistItems: [item({ label: "Inspection", status: "PENDING", dueDateMs: day("2026-07-25") })],
    }),
    REF,
  );
  assert.deepEqual(row.nextMilestone, { label: "Target close", dateIso: "2026-07-12T00:00:00.000Z", overdue: true });
});

import { test } from "node:test";
import assert from "node:assert/strict";

import {
  IN_FLIGHT_STAGES,
  isInFlightStage,
  dashboardStages,
  milestoneCandidates,
  selectNextMilestone,
  projectTransactionRow,
  type TransactionProjectionInput,
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
  assert.equal(row.readiness?.ready, true); // an empty checklist is vacuously ready
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

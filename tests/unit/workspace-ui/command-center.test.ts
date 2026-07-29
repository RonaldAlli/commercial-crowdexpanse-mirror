import { test } from "node:test";
import assert from "node:assert/strict";

import {
  orderRecentOpportunities, dedupeRecent, recentOppView, sellerSection, transactionSection,
  acquisitionMetricViews, revenueAllTimeView, RECENT_OPPORTUNITY_ORDER, UNAVAILABLE_CAPABILITIES,
  type RecentOpp, type TransactionRowInput,
} from "@/lib/workspace-ui/command-center";
import type { QueueSeller } from "@/lib/acquisition-queue";

const NOW = new Date("2026-07-29T12:00:00Z");

test("orderRecentOpportunities: updatedAt desc, id asc tie-break; deterministic + documented", () => {
  const rows: RecentOpp[] = [
    { id: "b", title: "B", stage: "LEAD", updatedAtMs: 100 },
    { id: "a", title: "A", stage: "LEAD", updatedAtMs: 100 },
    { id: "c", title: "C", stage: "LEAD", updatedAtMs: 200 },
  ];
  assert.deepEqual(orderRecentOpportunities(rows).map((r) => r.id), ["c", "a", "b"]);
  assert.deepEqual(orderRecentOpportunities(rows), orderRecentOpportunities(rows)); // deterministic
  assert.match(RECENT_OPPORTUNITY_ORDER, /updatedAt desc/);
});

test("dedupeRecent: drops opportunities already shown elsewhere", () => {
  const rows: RecentOpp[] = [{ id: "a", title: "A", stage: "LEAD", updatedAtMs: 1 }, { id: "b", title: "B", stage: "LEAD", updatedAtMs: 2 }];
  assert.deepEqual(dedupeRecent(rows, new Set(["a"])).map((r) => r.id), ["b"]);
});

test("recentOppView: authoritative Opportunity Workspace deep link; no score field", () => {
  const v = recentOppView({ id: "o1", title: "Deal", stage: "LEAD", updatedAtMs: 1 });
  assert.equal(v.href, "/opportunity-workspace/o1");
  assert.doesNotMatch(JSON.stringify(v).toLowerCase(), /"(score|priority|motivation)"/);
});

test("sellerSection: preserves acquisition-queue order and length-limits (no re-score)", () => {
  const qs = (id: string): QueueSeller => ({ id, name: id, company: null, phone: null, outreachStatus: "CONTACTED", nextFollowUpAt: null, lastTouchAt: null });
  const rows = sellerSection([qs("a"), qs("b"), qs("c")], NOW, 2);
  assert.deepEqual(rows.map((r) => r.id), ["a", "b"]);
});

test("transactionSection: maps fields, deep-links to workspace, limits; order preserved", () => {
  const input: TransactionRowInput[] = [
    { opportunityId: "o1", title: "One", propertyName: "P1", stage: "UNDER_CONTRACT", readiness: { ready: false, outstandingCount: 2, blockerLabels: ["Title", "EMD"] }, nextMilestone: { label: "EMD due", dateIso: "2026-08-01", overdue: true } },
    { opportunityId: "o2", title: "Two", propertyName: "P2", stage: "DUE_DILIGENCE", readiness: null, nextMilestone: null },
  ];
  const rows = transactionSection(input, 5);
  assert.equal(rows[0].href, "/opportunity-workspace/o1");
  assert.equal(rows[0].overdue, true);
  assert.equal(rows[0].blockerCount, 2);
  assert.equal(rows[0].milestoneLabel, "EMD due");
  assert.equal(rows[1].blockerCount, 0);
  assert.equal(rows[1].milestoneLabel, null);
});

test("acquisitionMetricViews: correct kinds + time bases", () => {
  const views = acquisitionMetricViews({ callsToday: 3, touchesToday: 5, statusUpdatesToday: 2, queueSize: 12 });
  const due = views.find((v) => v.label === "Follow-ups due")!;
  assert.equal(due.basis, "Due now");
  assert.equal(due.kind, "computed");
  const calls = views.find((v) => v.label === "Calls")!;
  assert.equal(calls.basis, "Today");
  assert.equal(calls.kind, "observed");
});

test("revenueAllTimeView: sums executed revenue, labeled ALL TIME (never a period figure)", () => {
  const v = revenueAllTimeView([{ channel: "A", executedRevenueUsd: 1000, dealCount: 1 }, { channel: "B", executedRevenueUsd: 2500, dealCount: 2 }]);
  assert.equal(v.basis, "All time");
  assert.equal(v.kind, "computed");
  assert.equal(v.value, "$3,500");
  assert.doesNotMatch(v.basis, /today|week|month|quarter|period/i);
});

test("unavailable capabilities are declared honestly", () => {
  assert.deepEqual([...UNAVAILABLE_CAPABILITIES], ["Appointments", "Offers", "Period-based revenue"]);
});

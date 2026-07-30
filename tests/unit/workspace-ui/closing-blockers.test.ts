import { test } from "node:test";
import assert from "node:assert/strict";

import { buildClosingBlockersView, type ChecklistBlockerInput } from "@/lib/workspace-ui/closing-blockers";

const cb = (o: Partial<ChecklistBlockerInput> & { title: string }): ChecklistBlockerInput => ({
  statusLabel: "Pending", hasOwnerId: false, ownerName: null, dueDate: null, ...o,
});

test("owner grouping: one owner with multiple blockers -> a single group", () => {
  const v = buildClosingBlockersView({
    checklistBlockers: [cb({ title: "Title", hasOwnerId: true, ownerName: "Ada" }), cb({ title: "Survey", hasOwnerId: true, ownerName: "Ada" })],
    domainBlockers: [], nextMilestone: null,
  });
  assert.equal(v.ownerGroups.length, 1);
  assert.equal(v.ownerGroups[0].ownerLabel, "Ada");
  assert.equal(v.ownerGroups[0].ownerResolved, true);
  assert.equal(v.ownerGroups[0].items.length, 2);
});

test("owner grouping: multiple owners -> multiple groups in persisted first-appearance order", () => {
  const v = buildClosingBlockersView({
    checklistBlockers: [cb({ title: "A", hasOwnerId: true, ownerName: "Ada" }), cb({ title: "B", hasOwnerId: true, ownerName: "Ben" })],
    domainBlockers: [], nextMilestone: null,
  });
  assert.deepEqual(v.ownerGroups.map((g) => g.ownerLabel), ["Ada", "Ben"]);
});

test("ownership honesty: no owner id -> 'Unassigned'; owner id but unresolved name -> distinct unresolved group", () => {
  const v = buildClosingBlockersView({
    checklistBlockers: [cb({ title: "A" }), cb({ title: "B", hasOwnerId: true, ownerName: null })],
    domainBlockers: [], nextMilestone: null,
  });
  const labels = v.ownerGroups.map((g) => ({ l: g.ownerLabel, r: g.ownerResolved }));
  assert.deepEqual(labels[0], { l: "Unassigned", r: false });
  assert.equal(labels[1].r, false);
  assert.notEqual(labels[1].l, "Unassigned"); // owner-on-record-but-unresolved is a DISTINCT honest state
});

test("domain blockers are separate from checklist owner groups (Domain Progression preserved)", () => {
  const v = buildClosingBlockersView({
    checklistBlockers: [cb({ title: "A", hasOwnerId: true, ownerName: "Ada" })],
    domainBlockers: [{ domain: "Escrow", statusLabel: "Deposited" }],
    nextMilestone: null,
  });
  assert.equal(v.ownerGroups.length, 1);
  assert.equal(v.domainBlockers.length, 1);
  assert.equal(v.domainBlockers[0].domain, "Escrow");
  assert.equal(v.hasBlockers, true);
});

test("next milestone: overdue -> overdueLabel; not overdue -> null; none -> null", () => {
  const overdue = buildClosingBlockersView({ checklistBlockers: [], domainBlockers: [], nextMilestone: { label: "Target close", dateIso: "2026-07-05T00:00:00.000Z", overdue: true } });
  assert.equal(overdue.nextMilestone?.overdueLabel, "Overdue");
  assert.equal(overdue.nextMilestone?.date, "2026-07-05");
  const upcoming = buildClosingBlockersView({ checklistBlockers: [], domainBlockers: [], nextMilestone: { label: "Target close", dateIso: "2026-12-01T00:00:00.000Z", overdue: false } });
  assert.equal(upcoming.nextMilestone?.overdueLabel, null);
  const none = buildClosingBlockersView({ checklistBlockers: [], domainBlockers: [], nextMilestone: null });
  assert.equal(none.nextMilestone, null);
  assert.equal(none.hasBlockers, false);
});

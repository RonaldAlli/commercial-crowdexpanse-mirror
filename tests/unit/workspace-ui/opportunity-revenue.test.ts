import { test } from "node:test";
import assert from "node:assert/strict";

import { buildOpportunityRevenueView } from "../../../lib/workspace-ui/opportunity-revenue";

const OPP = "opp1";
const base = {
  opportunityId: OPP,
  expectedFeeUsd: 25000,
  assignment: null as null | { status: string; executedFeeUsdSnapshot: number | null; resolvedAt: Date | null; createdAt: Date },
  hasProjected: false,
  activityEvents: [] as { eventType: string; occurredAt: Date }[],
};

test("tiers ordered Projected, Expected, Realized and never merged", () => {
  const v = buildOpportunityRevenueView(base);
  assert.deepEqual(v.tiers.map((t) => t.kind), ["projected", "expected", "realized"]);
});

test("expected = contracted fee; realized honest 'not yet' with no executed assignment", () => {
  const v = buildOpportunityRevenueView(base);
  const expected = v.tiers.find((t) => t.kind === "expected")!;
  const realized = v.tiers.find((t) => t.kind === "realized")!;
  assert.equal(expected.kind === "expected" && expected.valueUsd, 25000);
  assert.equal(realized.kind === "realized" && realized.realized, false);
  assert.equal(realized.kind === "realized" && realized.valueUsd, null);
});

test("executed assignment → realized carries the executed fee + date; timeline 'revenue realized' occurred", () => {
  const executedAt = new Date("2026-07-20T00:00:00.000Z");
  const v = buildOpportunityRevenueView({ ...base, assignment: { status: "EXECUTED", executedFeeUsdSnapshot: 27500, resolvedAt: executedAt, createdAt: new Date("2026-07-01T00:00:00.000Z") } });
  const realized = v.tiers.find((t) => t.kind === "realized")!;
  assert.equal(realized.kind === "realized" && realized.valueUsd, 27500);
  const step = v.timeline.find((s) => s.key === "revenue_realized")!;
  assert.equal(step.occurred, true);
  assert.deepEqual(step.occurredAt, executedAt);
});

test("Revenue Traceability: realized → closing workspace (assignment); projected → guided underwriting when available", () => {
  const v = buildOpportunityRevenueView({ ...base, hasProjected: true, assignment: { status: "EXECUTED", executedFeeUsdSnapshot: 1, resolvedAt: null, createdAt: new Date("2026-07-01T00:00:00.000Z") } });
  const realized = v.tiers.find((t) => t.kind === "realized")!;
  const projected = v.tiers.find((t) => t.kind === "projected")!;
  assert.equal(realized.kind === "realized" && realized.href, `/closing-workspace/${OPP}`);
  assert.equal(projected.kind === "projected" && projected.href, `/guided-underwriting/${OPP}`);
});

test("Active Evidence: timeline steps derive from recorded ActivityLog events; earliest wins; absent → pending", () => {
  const escrow1 = new Date("2026-06-10T00:00:00.000Z");
  const escrow2 = new Date("2026-06-05T00:00:00.000Z"); // earlier
  const v = buildOpportunityRevenueView({
    ...base,
    activityEvents: [
      { eventType: "deal.controlled", occurredAt: new Date("2026-06-01T00:00:00.000Z") },
      { eventType: "escrow.opened", occurredAt: escrow1 },
      { eventType: "escrow.deposited", occurredAt: escrow2 },
    ],
  });
  const contract = v.timeline.find((s) => s.key === "contract_executed")!;
  const escrow = v.timeline.find((s) => s.key === "escrow_activity")!;
  const financing = v.timeline.find((s) => s.key === "financing_activity")!;
  const settlement = v.timeline.find((s) => s.key === "settlement")!;
  assert.equal(contract.occurred, true);
  assert.equal(escrow.occurred, true);
  assert.deepEqual(escrow.occurredAt, escrow2); // earliest matching event
  assert.equal(financing.occurred, false); // no financing.* event → pending
  assert.equal(financing.occurredAt, null); // never fabricated
  assert.equal(settlement.occurred, false); // no settlement.* event → pending (settlement not actively tracked)
});

test("assignment created step reflects the active AssignmentRecord (createdAt), independent of ActivityLog", () => {
  const createdAt = new Date("2026-06-15T00:00:00.000Z");
  const v = buildOpportunityRevenueView({ ...base, assignment: { status: "STARTED", executedFeeUsdSnapshot: null, resolvedAt: null, createdAt } });
  const step = v.timeline.find((s) => s.key === "assignment_created")!;
  assert.equal(step.occurred, true);
  assert.deepEqual(step.occurredAt, createdAt);
});

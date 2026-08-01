import { test } from "node:test";
import assert from "node:assert/strict";

import { aggregatePipelineValue, type PipelineValueRow } from "../../../lib/business-intelligence/pipeline-value";

const rows: PipelineValueRow[] = [
  { assignmentFeeUsd: 20000, stage: "UNDER_CONTRACT", channel: "COMMERCIAL_BROKER", campaign: "Spring" },
  { assignmentFeeUsd: 15000, stage: "CLOSING", channel: "COMMERCIAL_BROKER", campaign: "Spring" },
  { assignmentFeeUsd: 10000, stage: "CLOSING", channel: "OWNER_DIRECT", campaign: null },
  { assignmentFeeUsd: null, stage: "BUYER_MATCHED", channel: null, campaign: null }, // no fee set → contributes $0
];

test("total = sum of assignmentFeeUsd (null contributes $0)", () => {
  const s = aggregatePipelineValue(rows);
  assert.equal(s.totalUsd, 45000);
  assert.equal(s.dealCount, 4);
  assert.equal(s.feeSetCount, 3); // one deal has no fee set
});

test("Inventory Integrity: every breakdown reconciles exactly to the total", () => {
  const s = aggregatePipelineValue(rows);
  const sum = (rs: { valueUsd: number }[]) => rs.reduce((n, r) => n + r.valueUsd, 0);
  const count = (rs: { dealCount: number }[]) => rs.reduce((n, r) => n + r.dealCount, 0);
  for (const b of [s.byStage, s.byChannel, s.byCampaign]) {
    assert.equal(sum(b), s.totalUsd, "breakdown value sums to total");
    assert.equal(count(b), s.dealCount, "breakdown deal counts sum to population");
  }
});

test("null channel/campaign normalize to UNKNOWN (never dropped — Inventory Integrity)", () => {
  const s = aggregatePipelineValue(rows);
  const chUnknown = s.byChannel.find((r) => r.key === "UNKNOWN");
  const cpUnknown = s.byCampaign.find((r) => r.key === "UNKNOWN");
  assert.ok(chUnknown && chUnknown.dealCount === 1); // the null-channel deal
  assert.ok(cpUnknown && cpUnknown.dealCount === 2); // two null-campaign deals
});

test("empty population → zero total and empty breakdowns", () => {
  const s = aggregatePipelineValue([]);
  assert.equal(s.totalUsd, 0);
  assert.equal(s.dealCount, 0);
  assert.deepEqual(s.byStage, []);
});

test("by-stage groups correctly (CLOSING = 15000 + 10000)", () => {
  const s = aggregatePipelineValue(rows);
  const closing = s.byStage.find((r) => r.key === "CLOSING")!;
  assert.equal(closing.valueUsd, 25000);
  assert.equal(closing.dealCount, 2);
});

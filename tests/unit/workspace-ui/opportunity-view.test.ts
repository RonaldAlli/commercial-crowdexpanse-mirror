import { test } from "node:test";
import assert from "node:assert/strict";

import { STAGE_ORDER } from "@/lib/opportunity-options";
import {
  usd, stagePositionView, nextStageOf, diligenceView, closingGateView, stageReadinessView, crossLink,
  type StageEval, type DiligenceSummary,
} from "@/lib/workspace-ui/opportunity-view";

test("usd: null -> em dash; number -> grouped dollars", () => {
  assert.equal(usd(null), "—");
  assert.equal(usd(undefined), "—");
  assert.equal(usd(1234567), "$1,234,567");
});

test("stagePositionView: position over the native stage order", () => {
  const first = String(STAGE_ORDER[0]);
  const v = stagePositionView(first);
  assert.equal(v.index, 0);
  assert.equal(v.total, STAGE_ORDER.length);
  assert.match(v.positionLabel, /Stage 1 of/);
  assert.equal(stagePositionView("NOT_A_STAGE").positionLabel, "Unknown stage");
});

test("nextStageOf: returns the next native stage; null at the terminal stage", () => {
  assert.equal(nextStageOf(String(STAGE_ORDER[0])), String(STAGE_ORDER[1]));
  assert.equal(nextStageOf(String(STAGE_ORDER[STAGE_ORDER.length - 1])), null);
});

test("diligenceView: passthrough + ratio label (Computed)", () => {
  const s: DiligenceSummary = { total: 8, requested: 2, received: 3, reviewed: 1, missing: 2, readyForUnderwriting: false };
  const v = diligenceView(s);
  assert.equal(v.total, 8);
  assert.match(v.ratioLabel, /1 reviewed · 3 received · 2 missing of 8/);
});

test("closingGateView: ready / blockers / not-started + blocker count", () => {
  assert.equal(closingGateView({ ready: true, blockingLabels: [], message: null }).statusLabel, "Ready to close");
  const blocked = closingGateView({ ready: false, blockingLabels: ["Title", "EMD"], message: "x" });
  assert.equal(blocked.blockerCount, 2);
  assert.equal(blocked.statusLabel, "2 blockers");
  assert.equal(closingGateView({ ready: false, blockingLabels: [], message: null }).statusLabel, "Closing not started");
});

test("stageReadinessView: terminal / error / available (suggestedAction passed through, not computed)", () => {
  assert.deepEqual(stageReadinessView(null), { state: "terminal" });
  assert.deepEqual(stageReadinessView({ error: "denied" }), { state: "error", reason: "denied" });
  const ev: StageEval = {
    outcome: "DENY", stageLabel: "Under Contract", missingTruth: ["Executed contract"],
    missingArtifacts: ["Signed PSA"], message: "Blocked: contract not executed", suggestedAction: "Upload the executed PSA", canOverride: false,
  };
  const v = stageReadinessView(ev);
  assert.equal(v.state, "available");
  if (v.state === "available") {
    assert.equal(v.outcome, "DENY");
    assert.deepEqual(v.missingTruth, ["Executed contract"]);
    assert.deepEqual(v.missingArtifacts, ["Signed PSA"]);
    assert.equal(v.suggestedAction, "Upload the executed PSA"); // verbatim from stage policy
    assert.equal(v.message, "Blocked: contract not executed");
  }
});

test("crossLink: available only when a destination exists (never implies an unavailable one)", () => {
  assert.deepEqual(crossLink("Seller", "/seller-queue/s1", "View seller"), { label: "Seller", href: "/seller-queue/s1", detail: "View seller", available: true });
  const none = crossLink("Seller", null, "None");
  assert.equal(none.available, false);
  assert.equal(none.href, "#");
});

import { test } from "node:test";
import assert from "node:assert/strict";

import {
  contrastStatusOf,
  buildGuidedDecisionView,
  type DecisionRecordInput,
} from "@/lib/workspace-ui/guided-underwriting-decision";

const dec = (o: Partial<DecisionRecordInput> & { decision: DecisionRecordInput["decision"]; sequence: number }): DecisionRecordInput => ({
  suggestedLevel: null,
  rationale: "",
  actor: null,
  at: "2026-07-01T00:00:00.000Z",
  ...o,
});

test("no scenario -> no-underwriting", () => {
  assert.equal(buildGuidedDecisionView({ hasScenario: false, recommendationLevel: null, findings: [], decisions: [] }).state, "no-underwriting");
});

test("contrast: no decisions -> awaiting-decision", () => {
  assert.equal(contrastStatusOf("PROCEED", []), "awaiting-decision");
});

test("contrast: APPROVED + engine positive -> agreement; DECLINED + PASS -> agreement", () => {
  assert.equal(contrastStatusOf("PROCEED_WITH_CONDITIONS", [dec({ decision: "APPROVED", sequence: 1 })]), "agreement");
  assert.equal(contrastStatusOf("PASS", [dec({ decision: "DECLINED", sequence: 1 })]), "agreement");
});

test("contrast: decision opposing the engine -> override", () => {
  assert.equal(contrastStatusOf("PASS", [dec({ decision: "APPROVED", sequence: 1 })]), "override");
  assert.equal(contrastStatusOf("PROCEED", [dec({ decision: "DECLINED", sequence: 1 })]), "override");
});

test("contrast: DEFERRED -> deferred (a recorded hold, not agree/override)", () => {
  assert.equal(contrastStatusOf("PROCEED", [dec({ decision: "DEFERRED", sequence: 1 })]), "deferred");
});

test("contrast: uses the decision's OWN captured suggestedLevel over the current recommendation", () => {
  // current recommendation PASS, but at decision time the engine suggested PROCEED and the human APPROVED
  const status = contrastStatusOf("PASS", [dec({ decision: "APPROVED", suggestedLevel: "PROCEED", sequence: 2 })]);
  assert.equal(status, "agreement");
});

test("contrast: decision present but no engine level anywhere -> recorded (indeterminate, honest)", () => {
  assert.equal(contrastStatusOf(null, [dec({ decision: "APPROVED", suggestedLevel: null, sequence: 1 })]), "recorded");
});

test("contrast: latest decision (sequence desc = index 0) drives the status", () => {
  const decisions = [dec({ decision: "APPROVED", sequence: 2 }), dec({ decision: "DECLINED", sequence: 1 })];
  assert.equal(contrastStatusOf("PROCEED", decisions), "agreement"); // index 0 = APPROVED (latest)
});

test("view: findings kept in persisted position order (never reordered); decisions mapped with labels", () => {
  const v = buildGuidedDecisionView({
    hasScenario: true,
    recommendationLevel: "PROCEED_WITH_CONDITIONS",
    findings: [
      { severity: "WARNING", title: "second", detail: "b", position: 5 },
      { severity: "CRITICAL", title: "first", detail: "a", position: 1 },
    ],
    decisions: [dec({ decision: "APPROVED", suggestedLevel: "PROCEED_WITH_CONDITIONS", actor: "Ada Admin", rationale: "Looks financeable.", at: "2026-07-02T12:00:00.000Z", sequence: 1 })],
  });
  if (v.state !== "present") throw new Error();
  assert.equal(v.engineRecommendation.label, "Proceed with conditions");
  assert.equal(v.contrast.status, "agreement");
  assert.deepEqual(v.findings.map((f) => f.title), ["first", "second"]); // by position, not severity
  assert.equal(v.decisions[0].decisionLabel, "Approved");
  assert.equal(v.decisions[0].actor, "Ada Admin");
  assert.equal(v.decisions[0].at, "2026-07-02"); // date only, deterministic
  assert.equal(v.decisions[0].engineSuggested, "Proceed with conditions");
});

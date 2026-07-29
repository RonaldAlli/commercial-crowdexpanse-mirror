import { test } from "node:test";
import assert from "node:assert/strict";

import {
  synthesizeSeller, synthesizeOpportunity, SELLER_PRECEDENCE, OPPORTUNITY_PRECEDENCE,
  type SellerFacts, type OpportunityFacts, type ConfidenceCategory,
} from "@/lib/workspace-ui/synthesis";

const NOW = new Date("2026-07-29T12:00:00Z");
const CONFS: ConfidenceCategory[] = ["High", "Medium", "Low", "Review Required", "Not Yet Scored"];

function checklist(done: number, total = 5) {
  return { items: Array.from({ length: total }, (_, i) => ({ label: `item ${i + 1}`, done: i < done })), progress: { done, total } };
}
function seller(over: Partial<SellerFacts> = {}): SellerFacts {
  return { outreachStatus: "CONTACTED", checklist: checklist(5), nextFollowUpAt: null, promotion: { state: "not-eligible", reason: "n/a" }, hasContact: true, now: NOW, ...over };
}

// ---- confidence categories ----
test("complete evidence → High (promotion eligible, no conflict)", () => {
  const s = synthesizeSeller(seller({ outreachStatus: "QUALIFIED", checklist: checklist(5), promotion: { state: "eligible", label: "Promote to opportunity", href: "/opportunities/new?sellerId=s1", mode: "preselect-property" } }));
  assert.equal(s.nextBestAction.recommendation, "Promote to opportunity");
  assert.equal(s.nextBestAction.confidence, "High");
});
test("partial evidence → Medium (qualification 3/5)", () => {
  const s = synthesizeSeller(seller({ checklist: checklist(3) }));
  assert.match(s.nextBestAction.recommendation ?? "", /Complete qualification/);
  assert.equal(s.nextBestAction.confidence, "Medium");
});
test("minimal evidence → Low (qualification 1/5)", () => {
  const s = synthesizeSeller(seller({ checklist: checklist(1) }));
  assert.equal(s.nextBestAction.confidence, "Low");
});
test("conflicting evidence → Review Required (QUALIFIED but checklist incomplete)", () => {
  const s = synthesizeSeller(seller({ outreachStatus: "QUALIFIED", checklist: checklist(3), promotion: { state: "eligible", label: "Promote to opportunity", href: "/x", mode: "choose-property" } }));
  assert.equal(s.nextBestAction.confidence, "Review Required");
  assert.equal(s.nextBestAction.chain.nextAction && "review" in s.nextBestAction.chain.nextAction, true);
  assert.ok(s.missingInformation.some((m) => m.state === "conflicting"));
});
test("insufficient evidence → Not Yet Scored (nothing actionable)", () => {
  const s = synthesizeSeller(seller({ outreachStatus: "CONTACTED", checklist: checklist(5), promotion: { state: "not-eligible", reason: "n/a" }, nextFollowUpAt: null }));
  assert.equal(s.nextBestAction.recommendation, null);
  assert.equal(s.nextBestAction.confidence, "Not Yet Scored");
});

// ---- determinism ----
test("deterministic + reproducible: identical facts → identical synthesis", () => {
  const f = seller({ checklist: checklist(3) });
  assert.deepEqual(synthesizeSeller(f), synthesizeSeller(f));
});
test("no clock dependence: 'now' is an injected input", () => {
  const base = seller({ nextFollowUpAt: new Date("2026-07-20T00:00:00Z"), checklist: checklist(5) });
  const past = synthesizeSeller({ ...base, now: new Date("2026-07-29T00:00:00Z") }); // overdue → follow-up
  const before = synthesizeSeller({ ...base, now: new Date("2026-07-10T00:00:00Z") }); // future → not due
  assert.match(past.nextBestAction.recommendation ?? "", /Follow up/);
  assert.notEqual(past.nextBestAction.recommendation, before.nextBestAction.recommendation);
});

// ---- explanation + chain completeness ----
test("explanation completeness: evidenceUsed + competingRejected reasons present", () => {
  const s = synthesizeSeller(seller({ outreachStatus: "QUALIFIED", checklist: checklist(3), promotion: { state: "eligible", label: "Promote", href: "/x", mode: "choose-property" }, nextFollowUpAt: new Date("2026-07-20T00:00:00Z") }));
  assert.ok(s.nextBestAction.evidenceUsed.length > 0);
  assert.ok(s.nextBestAction.competingRejected.every((c) => c.reason.length > 0));
});
test("evidence chain completeness: chain mirrors the recommendation + evidence", () => {
  const s = synthesizeSeller(seller({ checklist: checklist(2) }));
  assert.equal(s.nextBestAction.chain.recommendation, s.nextBestAction.recommendation);
  assert.ok(s.nextBestAction.chain.supporting.length > 0);
});
test("no recommendation without evidence: null recommendation → empty supporting + null confidence", () => {
  const s = synthesizeSeller(seller());
  assert.equal(s.nextBestAction.recommendation, null);
  assert.deepEqual(s.nextBestAction.chain.supporting, []);
  assert.equal(s.nextBestAction.chain.confidence, null);
});
test("no fabricated confidence: value is always one of the five categories (never numeric)", () => {
  for (const f of [seller(), seller({ checklist: checklist(3) }), seller({ checklist: checklist(1) })]) {
    assert.ok(CONFS.includes(synthesizeSeller(f).nextBestAction.confidence));
  }
});

// ---- four missing-information states ----
test("four missing-information states are represented and distinct", () => {
  const s = synthesizeSeller(seller({ outreachStatus: "QUALIFIED", checklist: checklist(2), hasContact: false }));
  const states = new Set(s.missingInformation.map((m) => m.state));
  for (const st of ["missing", "incomplete", "conflicting", "unavailable"]) assert.ok(states.has(st as any), `missing state ${st}`);
  for (const m of s.missingInformation) { assert.ok(m.why.length > 0); assert.ok(m.source.length > 0); assert.ok(m.resolution.length > 0); }
});

// ---- recommendation reacts to evidence ----
test("recommendation changes after evidence changes", () => {
  const eligible = synthesizeSeller(seller({ outreachStatus: "QUALIFIED", checklist: checklist(5), promotion: { state: "eligible", label: "Promote to opportunity", href: "/x", mode: "choose-property" } }));
  const partial = synthesizeSeller(seller({ checklist: checklist(3) }));
  assert.notEqual(eligible.nextBestAction.recommendation, partial.nextBestAction.recommendation);
});
test("recommendation disappears when supporting evidence disappears", () => {
  const before = synthesizeSeller(seller({ checklist: checklist(3) }));
  assert.ok(before.nextBestAction.recommendation);
  const after = synthesizeSeller(seller({ checklist: checklist(5) })); // qualification complete, nothing else actionable
  assert.equal(after.nextBestAction.recommendation, null);
});

// ---- precedence documented ----
test("documented deterministic precedence constants exist", () => {
  assert.match(SELLER_PRECEDENCE, /opt-out/);
  assert.match(OPPORTUNITY_PRECEDENCE, /advance/);
});
test("opt-out takes precedence over everything (deterministic)", () => {
  const s = synthesizeSeller(seller({ outreachStatus: "DO_NOT_CONTACT", checklist: checklist(2), nextFollowUpAt: new Date("2026-07-20T00:00:00Z") }));
  assert.match(s.nextBestAction.recommendation ?? "", /Do not contact/);
});

// ---- opportunity synthesis ----
const OK_EVAL = { outcome: "ALLOW" as const, stageLabel: "Under Contract", missingTruth: [], missingArtifacts: [], message: "", suggestedAction: "", canOverride: false };
function opp(over: Partial<OpportunityFacts> = {}): OpportunityFacts {
  return { stageEval: OK_EVAL, diligence: { missing: 0, total: 8, readyForUnderwriting: true }, closing: { ready: true, blockerLabels: [] }, ...over };
}
test("opportunity: ALLOW → High advance", () => {
  const s = synthesizeOpportunity(opp());
  assert.match(s.nextBestAction.recommendation ?? "", /Advance to Under Contract/);
  assert.equal(s.nextBestAction.confidence, "High");
});
test("opportunity: DENY with missingTruth/artifacts → Missing + Incomplete states", () => {
  const s = synthesizeOpportunity(opp({ stageEval: { outcome: "DENY", stageLabel: "Under Contract", missingTruth: ["Executed contract"], missingArtifacts: ["Signed PSA"], message: "Blocked", suggestedAction: "Upload the PSA", canOverride: false } }));
  assert.match(s.nextBestAction.recommendation ?? "", /Upload the PSA/);
  assert.ok(s.missingInformation.some((m) => m.state === "missing"));
  assert.ok(s.missingInformation.some((m) => m.state === "incomplete"));
});
test("opportunity: stage-eval error → Unavailable missing-info", () => {
  const s = synthesizeOpportunity(opp({ stageEval: { error: "Invalid pipeline stage." } }));
  assert.ok(s.missingInformation.some((m) => m.state === "unavailable"));
});
test("opportunity: terminal + all ready → Not Yet Scored", () => {
  const s = synthesizeOpportunity(opp({ stageEval: null }));
  assert.equal(s.nextBestAction.recommendation, null);
  assert.equal(s.nextBestAction.confidence, "Not Yet Scored");
});
test("opportunity: deterministic", () => {
  const f = opp({ stageEval: { outcome: "DENY", stageLabel: "X", missingTruth: ["a"], missingArtifacts: ["b"], message: "m", suggestedAction: "do it", canOverride: false } });
  assert.deepEqual(synthesizeOpportunity(f), synthesizeOpportunity(f));
});

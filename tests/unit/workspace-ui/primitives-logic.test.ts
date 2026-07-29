import { test } from "node:test";
import assert from "node:assert/strict";

import { describeElementKind, ELEMENT_KINDS, type ElementKind } from "@/lib/workspace-ui/taxonomy";
import { describeMissingInfo, MISSING_INFO_STATES } from "@/lib/workspace-ui/missing-info";
import { describePresentationState, PRESENTATION_STATES } from "@/lib/workspace-ui/presentation-states";
import { deriveEvidenceView, type EvidenceChainInput } from "@/lib/workspace-ui/evidence";
import { resolveNavForRole, visibleNavForRole, type WorkspaceNavItem } from "@/lib/workspace-ui/nav";

// ---- Element taxonomy: all three categories, distinct ----
test("taxonomy: exactly three categories with distinct labels/icons/sr-text", () => {
  assert.deepEqual([...ELEMENT_KINDS], ["observed", "computed", "recommended"]);
  const labels = ELEMENT_KINDS.map((k) => describeElementKind(k).label);
  assert.deepEqual(labels, ["Observed", "Computed", "Recommended"]);
  assert.equal(new Set(ELEMENT_KINDS.map((k) => describeElementKind(k).iconName)).size, 3);
  for (const k of ELEMENT_KINDS) assert.ok(describeElementKind(k).srLabel.length > 0);
});

// ---- Missing-information: four DISTINCT states, never collapsed ----
test("missing-info: four distinct states with distinct labels + definitions", () => {
  assert.deepEqual([...MISSING_INFO_STATES], ["missing", "incomplete", "conflicting", "unavailable"]);
  const labels = MISSING_INFO_STATES.map((s) => describeMissingInfo(s).label);
  assert.equal(new Set(labels).size, 4, "labels must be distinct");
  const descs = MISSING_INFO_STATES.map((s) => describeMissingInfo(s).description);
  assert.equal(new Set(descs).size, 4, "definitions must be distinct");
});

// ---- Presentation states: four states; error is an alert, others status ----
test("presentation states: four states, correct aria roles, unavailable != empty", () => {
  assert.deepEqual([...PRESENTATION_STATES], ["loading", "empty", "unavailable", "error"]);
  assert.equal(describePresentationState("error").ariaRole, "alert");
  for (const s of ["loading", "empty", "unavailable"] as const) assert.equal(describePresentationState(s).ariaRole, "status");
  assert.notEqual(describePresentationState("unavailable").label, describePresentationState("empty").label);
});

// ---- Evidence chain: complete ----
test("evidence: complete chain renders all present + scored + actionable", () => {
  const input: EvidenceChainInput = {
    recommendation: "Promote seller",
    supporting: [{ label: "Checklist complete", present: true }],
    missing: [],
    confidence: "high",
    nextAction: { label: "Promote" },
  };
  const v = deriveEvidenceView(input);
  assert.equal(v.recommendation.state, "present");
  assert.equal(v.supporting[0].state, "present");
  assert.equal(v.confidence.state, "scored");
  assert.equal((v.confidence as any).label, "High");
  assert.equal(v.nextAction.state, "actionable");
  assert.equal((v.nextAction as any).label, "Promote");
});

// ---- Evidence chain: partial (missing supporting visibly marked) ----
test("evidence: partial chain marks missing supporting facts", () => {
  const v = deriveEvidenceView({
    recommendation: "Keep qualifying",
    supporting: [{ label: "Contact made", present: true }, { label: "Motivation captured", present: false }],
    missing: ["Property linked"],
    confidence: "low",
    nextAction: { label: "Capture motivation" },
  });
  assert.deepEqual(v.supporting.map((s) => s.state), ["present", "missing"]);
  assert.deepEqual(v.missing, ["Property linked"]);
});

// ---- Evidence chain: honest empty/uncertain states, no fabrication ----
test("evidence: null confidence -> Not yet scored (no fabricated level)", () => {
  const v = deriveEvidenceView({ recommendation: "x", supporting: [], missing: [], confidence: null, nextAction: null });
  assert.equal(v.confidence.state, "not-scored");
  assert.equal(v.confidence.label, "Not yet scored");
  assert.ok(!("level" in v.confidence));
});
test("evidence: null recommendation -> No recommendation available", () => {
  const v = deriveEvidenceView({ recommendation: null, supporting: [], missing: [], confidence: "high", nextAction: null });
  assert.equal(v.recommendation.state, "none");
  assert.equal(v.recommendation.text, "No recommendation available");
});
test("evidence: empty-string recommendation is treated as none (not fabricated)", () => {
  const v = deriveEvidenceView({ recommendation: "   ", supporting: [], missing: [], confidence: null, nextAction: null });
  assert.equal(v.recommendation.state, "none");
});
test("evidence: review next action -> neutral review state, not false certainty", () => {
  const v = deriveEvidenceView({ recommendation: null, supporting: [], missing: [], confidence: null, nextAction: { review: true } });
  assert.equal(v.nextAction.state, "review");
  assert.match((v.nextAction as any).label, /Review/);
});
test("evidence: null next action -> none", () => {
  const v = deriveEvidenceView({ recommendation: "x", supporting: [], missing: [], confidence: "medium", nextAction: null });
  assert.equal(v.nextAction.state, "none");
});

// ---- Determinism: identical input -> identical output ----
test("evidence: deterministic from identical props", () => {
  const input: EvidenceChainInput = {
    recommendation: "Promote", supporting: [{ label: "a", present: true }], missing: ["b"], confidence: "medium", nextAction: { label: "go" },
  };
  assert.deepEqual(deriveEvidenceView(input), deriveEvidenceView(input));
});

// ---- Role-aware nav ----
const NAV: WorkspaceNavItem[] = [
  { href: "/dashboard", label: "Command Center", iconName: "dashboard", section: "M1", availability: "available" },
  { href: "/acquire", label: "Seller Queue", iconName: "phone", section: "M1", availability: "available", requires: "SELLER" },
  { href: "/analyzer", label: "Guided Underwriting", iconName: "analyzer", section: "Future", availability: "future" },
];

test("nav: permission-gated visibility via injected predicate", () => {
  const denySeller = visibleNavForRole(NAV, (r) => r !== "SELLER").map((i) => i.href);
  assert.ok(!denySeller.includes("/acquire"), "denied resource is hidden");
  const allowAll = visibleNavForRole(NAV, () => true).map((i) => i.href);
  assert.deepEqual(allowAll, ["/dashboard", "/acquire", "/analyzer"]);
});
test("nav: future items are visible-but-inactive (never presented as done)", () => {
  const resolved = resolveNavForRole(NAV, () => true);
  const future = resolved.find((i) => i.href === "/analyzer")!;
  assert.equal(future.visible, true);
  assert.equal(future.active, false);
  const available = resolved.find((i) => i.href === "/dashboard")!;
  assert.equal(available.active, true);
});
test("nav: deterministic + order-preserving", () => {
  assert.deepEqual(resolveNavForRole(NAV, () => true), resolveNavForRole(NAV, () => true));
});

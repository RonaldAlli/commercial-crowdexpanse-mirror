import { test } from "node:test";
import assert from "node:assert/strict";

import {
  structurabilityOf,
  primaryConstraintOf,
  buildGuidedUnderwritingView,
  pct,
  ratio,
  type GuidedFindingInput,
  type GuidedScenarioInput,
} from "@/lib/workspace-ui/guided-underwriting";

test("structurabilityOf: maps the existing engine recommendation 1:1; never fabricates", () => {
  assert.equal(structurabilityOf("PROCEED").verdict, "yes");
  assert.equal(structurabilityOf("PROCEED").recommendation, "Proceed");
  assert.equal(structurabilityOf("PROCEED_WITH_CONDITIONS").verdict, "conditional");
  assert.equal(structurabilityOf("PASS").verdict, "no");
  const none = structurabilityOf(null);
  assert.equal(none.verdict, "not-assessed");
  assert.equal(none.label, "Not yet assessed");
  assert.equal(none.recommendation, null); // honest — no fabricated verdict when none is persisted
});

test("primaryConstraintOf: top decisive WARNING/CRITICAL by severity then position; ignores non-decisive and INFO", () => {
  const findings: GuidedFindingInput[] = [
    { severity: "WARNING", decisive: true, title: "Thin debt yield", detail: "…", position: 1 },
    { severity: "CRITICAL", decisive: true, title: "DSCR below floor", detail: "…", position: 3 },
    { severity: "CRITICAL", decisive: false, title: "Non-decisive critical", detail: "…", position: 0 },
  ];
  const c = primaryConstraintOf(findings);
  assert.equal(c?.title, "DSCR below floor"); // CRITICAL beats WARNING; non-decisive ignored
  assert.equal(c?.severityLabel, "Critical");

  assert.equal(primaryConstraintOf([]), null); // none
  assert.equal(
    primaryConstraintOf([{ severity: "INFO", decisive: true, title: "Strong return", detail: "…", position: 0 }]),
    null, // INFO is not a constraint
  );
});

test("primaryConstraintOf: position breaks ties within the same severity", () => {
  const findings: GuidedFindingInput[] = [
    { severity: "WARNING", decisive: true, title: "second", detail: "…", position: 5 },
    { severity: "WARNING", decisive: true, title: "first", detail: "…", position: 2 },
  ];
  assert.equal(primaryConstraintOf(findings)?.title, "first");
});

test("formatters: null -> 'Not available'; values formatted deterministically", () => {
  assert.equal(pct(null), "Not available");
  assert.equal(pct(6.25), "6.3%");
  assert.equal(ratio(null), "Not available");
  assert.equal(ratio(1.354), "1.35×");
});

test("buildGuidedUnderwritingView: no scenario -> honest empty state", () => {
  const v = buildGuidedUnderwritingView({ opportunityName: "X", propertyLabel: null, scenario: null });
  assert.equal(v.state, "no-underwriting");
});

test("buildGuidedUnderwritingView: partial scenario marks absent metrics unavailable, never fabricates", () => {
  const scenario: GuidedScenarioInput = {
    label: "Base Case",
    version: 1,
    status: "LOCKED",
    scenarioVersion: "v1",
    recommendationLevel: null, // not assessed
    result: null, // no operating result
    primaryFinancing: { dscr: 1.35, sizedLoanUsd: 4_200_000, leveredIrrPct: null },
    findings: [],
  };
  const v = buildGuidedUnderwritingView({ opportunityName: "Oakleaf", propertyLabel: "Oakleaf Center", scenario });
  assert.equal(v.state, "present");
  if (v.state !== "present") return;
  assert.equal(v.structurability.verdict, "not-assessed");
  assert.equal(v.primaryConstraint, null);
  const byLabel = Object.fromEntries(v.metrics.map((m) => [m.label, m]));
  assert.equal(byLabel["NOI (annual)"].available, false);
  assert.equal(byLabel["NOI (annual)"].value, "Not available");
  assert.equal(byLabel["DSCR"].available, true);
  assert.equal(byLabel["DSCR"].value, "1.35×");
  assert.equal(byLabel["Sized debt"].value, "$4,200,000");
  assert.equal(byLabel["Levered IRR (exit)"].available, false);
  assert.equal(v.observed.status, "LOCKED");
  assert.equal(v.observed.version, "v1");
});

test("buildGuidedUnderwritingView: full scenario surfaces verdict + primary constraint from existing outputs", () => {
  const scenario: GuidedScenarioInput = {
    label: "Base Case",
    version: 2,
    status: "LOCKED",
    scenarioVersion: "v2",
    recommendationLevel: "PROCEED_WITH_CONDITIONS",
    result: { noiAnnualUsd: 780_000, capRate: 6.2, pricePerUnitUsd: 145_000 },
    primaryFinancing: { dscr: 1.35, sizedLoanUsd: 4_200_000, leveredIrrPct: 14.8 },
    findings: [{ severity: "WARNING", decisive: true, title: "Thin debt yield", detail: "Debt yield under 8%.", position: 0 }],
  };
  const v = buildGuidedUnderwritingView({ opportunityName: "Oakleaf", propertyLabel: "Oakleaf Center", scenario });
  assert.equal(v.state, "present");
  if (v.state !== "present") return;
  assert.equal(v.structurability.verdict, "conditional");
  assert.equal(v.structurability.recommendation, "Proceed with conditions");
  assert.equal(v.primaryConstraint?.title, "Thin debt yield");
  assert.equal(Object.fromEntries(v.metrics.map((m) => [m.label, m.value]))["Cap rate"], "6.2%");
});

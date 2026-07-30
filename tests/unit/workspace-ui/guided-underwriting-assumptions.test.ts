import { test } from "node:test";
import assert from "node:assert/strict";

import {
  buildGuidedAssumptionsView,
  type GuidedAssumptionsInput,
  type AssumptionItemView,
} from "@/lib/workspace-ui/guided-underwriting-assumptions";

const prov = (source: string | null, sourceField: string | null, sourceAsOf: string | null) => ({ source, sourceField, sourceAsOf });

function itemsOf(view: ReturnType<typeof buildGuidedAssumptionsView>): Map<string, AssumptionItemView> {
  if (view.state !== "present") throw new Error("expected present");
  return new Map(view.groups.flatMap((g) => g.items).map((i) => [i.key, i]));
}

test("no scenario -> no-underwriting (honest empty)", () => {
  const v = buildGuidedAssumptionsView({ hasScenario: false, hasFinancingCase: false, scenarioAssumptions: [], capitalAssumptions: [] });
  assert.equal(v.state, "no-underwriting");
});

test("three operational groups derived from existing key-sets; never invented", () => {
  const v = buildGuidedAssumptionsView({ hasScenario: true, hasFinancingCase: true, scenarioAssumptions: [], capitalAssumptions: [] });
  if (v.state !== "present") throw new Error();
  assert.deepEqual(v.groups.map((g) => g.title), ["Core underwriting inputs", "Projection", "Debt & capital"]);
});

test("present+full provenance -> complete; present+partial -> incomplete; expected+absent -> missing; provenance never fabricated", () => {
  const input: GuidedAssumptionsInput = {
    hasScenario: true,
    hasFinancingCase: true,
    scenarioAssumptions: [
      { key: "PURCHASE_PRICE", provenance: prov("MANUAL", "purchasePrice", "2026-07-01T00:00:00.000Z") }, // complete
      { key: "GROSS_INCOME", provenance: prov("MANUAL", null, null) }, // present value but partial provenance -> incomplete
    ],
    capitalAssumptions: [{ key: "LOAN_AMOUNT", provenance: prov("MANUAL", "loanAmount", "2026-07-01T00:00:00.000Z") }],
  };
  const items = itemsOf(buildGuidedAssumptionsView(input));

  assert.equal(items.get("PURCHASE_PRICE")!.status, "complete");
  assert.deepEqual(items.get("PURCHASE_PRICE")!.provenance, { source: "MANUAL", sourceField: "purchasePrice", sourceAsOf: "2026-07-01T00:00:00.000Z" });

  assert.equal(items.get("GROSS_INCOME")!.status, "incomplete");
  assert.equal(items.get("GROSS_INCOME")!.affects, "Feeds Net Operating Income."); // reason shown for a gap

  const missing = items.get("OPERATING_EXPENSES")!;
  assert.equal(missing.status, "missing");
  assert.equal(missing.provenance, null); // NEVER fabricated
  assert.equal(missing.blocking, false);

  assert.equal(items.get("LOAN_AMOUNT")!.status, "complete");
});

test("missing PURCHASE_PRICE is the sole blocking gap (engine hard precondition)", () => {
  const v = buildGuidedAssumptionsView({
    hasScenario: true,
    hasFinancingCase: true,
    scenarioAssumptions: [{ key: "GROSS_INCOME", provenance: prov("MANUAL", "t12", "2026-07-01T00:00:00.000Z") }],
    capitalAssumptions: [],
  });
  if (v.state !== "present") throw new Error();
  const pp = itemsOf(v).get("PURCHASE_PRICE")!;
  assert.equal(pp.status, "missing");
  assert.equal(pp.blocking, true);
  assert.equal(v.summary.blockingMissingKey, "PURCHASE_PRICE");
  // a missing non-required key is not blocking
  assert.equal(itemsOf(v).get("CLOSING_COSTS")!.blocking, false);
});

test("debt group is UNAVAILABLE (not missing) when there is no financing case", () => {
  const v = buildGuidedAssumptionsView({ hasScenario: true, hasFinancingCase: false, scenarioAssumptions: [], capitalAssumptions: [] });
  if (v.state !== "present") throw new Error();
  const items = itemsOf(v);
  assert.equal(items.get("LOAN_AMOUNT")!.status, "unavailable");
  assert.equal(items.get("MIN_DSCR")!.status, "unavailable");
  // scenario-side keys are still 'missing' (expected but absent), distinct from unavailable
  assert.equal(items.get("PURCHASE_PRICE")!.status, "missing");
  assert.ok(v.summary.unavailable >= 6);
});

test("summary counts reflect the four-state classification", () => {
  const v = buildGuidedAssumptionsView({
    hasScenario: true,
    hasFinancingCase: true,
    scenarioAssumptions: [
      { key: "PURCHASE_PRICE", provenance: prov("MANUAL", "pp", "2026-07-01T00:00:00.000Z") },
      { key: "GROSS_INCOME", provenance: prov("MANUAL", null, null) },
    ],
    capitalAssumptions: [],
  });
  if (v.state !== "present") throw new Error();
  assert.equal(v.summary.incomplete, 1);
  assert.equal(v.summary.blockingMissingKey, null); // PURCHASE_PRICE present
  assert.ok(v.summary.missing > 0);
});

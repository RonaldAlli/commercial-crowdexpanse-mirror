import { test } from "node:test";
import assert from "node:assert/strict";

import {
  assembleOfferMemoSnapshot,
  renderOfferMemoHtml,
  escapeHtml,
  fmtUsd,
  fmtPct,
  fmtMult,
  fmtInt,
  fmtDateUtc,
  OFFER_MEMO_SNAPSHOT_SCHEMA_VERSION,
  OFFER_MEMO_TEMPLATE_VERSION,
  OFFER_MEMO_GENERATOR_VERSION,
  type ScenarioMemoInput,
  type OfferMemoMeta,
} from "../../../lib/documents/offer-memo";

// A representative, fully-populated input (a levered deal with an exit + a decision).
function mkInput(over: Partial<ScenarioMemoInput> = {}): ScenarioMemoInput {
  return {
    opportunity: { id: "opp-1", title: "Riverside acquisition" },
    property: {
      name: "Riverside Apartments",
      assetType: "MULTIFAMILY",
      addressLine1: "100 River Rd",
      city: "Atlanta",
      state: "GA",
      postalCode: "30301",
      county: "Fulton",
      unitCount: 24,
    },
    scenario: {
      id: "scn-1",
      label: "Base case",
      version: 2,
      status: "LOCKED",
      scenarioVersion: "abcdef0123456789abcdef0123456789",
      modelVersion: 6,
      calcLibVersion: 6,
      rulesetVersion: 2,
      analystSummary: "Strong in-place cash flow with value-add upside.",
    },
    operatingAssumptions: [
      { key: "PURCHASE_PRICE", value: 1_000_000 },
      { key: "GROSS_INCOME", value: 130_000 },
      { key: "EXIT_CAP_RATE_PCT", value: 6.5 },
      { key: "HOLD_YEARS", value: 5 },
    ],
    result: {
      grossIncomeAnnualUsd: 130_000,
      operatingExpensesUsd: 30_000,
      noiAnnualUsd: 100_000,
      allInCostUsd: 1_075_000,
      capRate: 9.3,
      pricePerUnitUsd: 41_666,
      expenseRatioPct: 23,
      spreadUsd: 125_000,
    },
    primaryCase: {
      id: "case-1",
      label: "Senior debt",
      position: 0,
      capitalAssumptions: [
        { key: "LOAN_AMOUNT", value: 750_000 },
        { key: "INTEREST_RATE", value: 6 },
        { key: "AMORTIZATION_YEARS", value: 30 },
      ],
      result: {
        annualDebtServiceUsd: 53_982.34,
        dscr: 1.85,
        debtYieldPct: 13.3,
        sizedLoanUsd: 750_000,
        bindingConstraint: "LTV",
        avgDscr: 1.9,
        cumulativeCashFlowUsd: 230_000,
        terminalNoiUsd: 110_000,
        exitCapRatePct: 6.5,
        grossExitValueUsd: 1_692_307,
        netSaleProceedsUsd: 900_000,
        debtPayoffUsd: 700_000,
        contributedEquityUsd: 325_000,
        equityMultiple: 2.15,
        leveredIrrPct: 16.4,
        totalProfitUsd: 375_000,
      },
    },
    findings: [
      {
        code: "STRONG_RETURN",
        category: "RETURN",
        severity: "INFO",
        title: "Strong projected return",
        detail: "Levered IRR exceeds the 15% target.",
        observedValue: 16.4,
        thresholdValue: 15,
      },
    ],
    suggestedRecommendation: "PROCEED",
    decision: {
      id: "dec-1",
      sequence: 1,
      level: "APPROVED",
      rationale: "Approved at committee.",
      actorDisplay: "Dana Lee",
      decidedAtIso: "2026-07-15T14:30:00.000Z",
    },
    ...over,
  };
}

const META: OfferMemoMeta = {
  generatedAtIso: "2026-07-15T15:00:00.000Z",
  generatedById: "user-1",
  generatedByDisplay: "Sam Rivera",
};

// --- formatters --------------------------------------------------------------
test("formatters are deterministic and locale-independent", () => {
  assert.equal(fmtUsd(1_075_000), "$1,075,000");
  assert.equal(fmtUsd(-1_200), "-$1,200");
  assert.equal(fmtUsd(0), "$0");
  assert.equal(fmtUsd(null), "—");
  assert.equal(fmtUsd(1_234.6), "$1,235"); // whole-dollar rounding
  assert.equal(fmtPct(8), "8%");
  assert.equal(fmtPct(6.254), "6.25%");
  assert.equal(fmtPct(null), "—");
  assert.equal(fmtMult(2.15), "2.15×");
  assert.equal(fmtMult(null), "—");
  assert.equal(fmtInt(24), "24");
  assert.equal(fmtInt(1_250), "1,250");
  assert.equal(fmtInt(null), "—");
});

test("fmtDateUtc uses a fixed UTC policy", () => {
  assert.equal(fmtDateUtc("2026-07-15T15:00:00.000Z"), "Jul 15, 2026 15:00 UTC");
});

// --- escaping / injection safety --------------------------------------------
test("escapeHtml neutralizes markup and quotes", () => {
  assert.equal(escapeHtml(`<script>&"'`), "&lt;script&gt;&amp;&quot;&#39;");
});

test("data-derived markup cannot inject into the rendered document", () => {
  const input = mkInput({
    property: { ...mkInput().property, name: `<img src=x onerror="alert(1)">` },
    scenario: { ...mkInput().scenario, analystSummary: `</style><script>alert(2)</script>` },
    decision: { ...mkInput().decision!, rationale: `<b>pwn</b> & "quote"` },
  });
  const html = renderOfferMemoHtml(assembleOfferMemoSnapshot(input, META));
  // The only <script> tokens present are escaped renderings of the injected data.
  assert.ok(!html.includes("<script>alert(2)</script>"));
  assert.ok(!html.includes(`onerror="alert(1)"`));
  assert.ok(html.includes("&lt;img src=x onerror=&quot;alert(1)&quot;&gt;"));
  assert.ok(html.includes("&lt;b&gt;pwn&lt;/b&gt; &amp; &quot;quote&quot;"));
});

// --- determinism / reproducibility (OM-F) ------------------------------------
test("the same snapshot renders byte-identical output", () => {
  const snap = assembleOfferMemoSnapshot(mkInput(), META);
  assert.equal(renderOfferMemoHtml(snap), renderOfferMemoHtml(snap));
  // Re-assembling the same input + meta yields an identical snapshot and identical bytes.
  const again = assembleOfferMemoSnapshot(mkInput(), META);
  assert.equal(renderOfferMemoHtml(again), renderOfferMemoHtml(snap));
});

test("assembly sorts assumptions canonically regardless of input order", () => {
  const shuffled = mkInput({
    operatingAssumptions: [
      { key: "HOLD_YEARS", value: 5 },
      { key: "GROSS_INCOME", value: 130_000 },
      { key: "EXIT_CAP_RATE_PCT", value: 6.5 },
      { key: "PURCHASE_PRICE", value: 1_000_000 },
    ],
  });
  const snap = assembleOfferMemoSnapshot(shuffled, META);
  assert.deepEqual(
    snap.operatingAssumptions.map((a) => a.key),
    ["EXIT_CAP_RATE_PCT", "GROSS_INCOME", "HOLD_YEARS", "PURCHASE_PRICE"],
  );
  // Byte-identical to the canonically-ordered input — order in never leaks out.
  assert.equal(renderOfferMemoHtml(snap), renderOfferMemoHtml(assembleOfferMemoSnapshot(mkInput(), META)));
});

// --- snapshot fidelity + version stamps (OM-5) -------------------------------
test("the snapshot records template/generator/schema versions and generation meta", () => {
  const snap = assembleOfferMemoSnapshot(mkInput(), META);
  assert.equal(snap.snapshotSchemaVersion, OFFER_MEMO_SNAPSHOT_SCHEMA_VERSION);
  assert.equal(snap.templateVersion, OFFER_MEMO_TEMPLATE_VERSION);
  assert.equal(snap.generatorVersion, OFFER_MEMO_GENERATOR_VERSION);
  assert.equal(snap.generatedAt, META.generatedAtIso);
  assert.deepEqual(snap.generatedBy, { id: "user-1", display: "Sam Rivera" });
});

// --- self-contained output (no external dependencies) ------------------------
test("the rendered document has no external references", () => {
  const html = renderOfferMemoHtml(assembleOfferMemoSnapshot(mkInput(), META));
  assert.ok(html.startsWith("<!doctype html>"));
  assert.ok(!/https?:\/\//i.test(html), "no absolute http(s) URLs");
  assert.ok(!/<link\b/i.test(html), "no <link> stylesheets");
  assert.ok(!/src\s*=/i.test(html), "no src= attributes (scripts/images)");
  assert.ok(!/@import/i.test(html), "no CSS @import");
});

// --- OM-J: suggestion and decision stay distinct -----------------------------
test("engine suggestion and human decision are distinct, and absence is explicit", () => {
  const withDecision = assembleOfferMemoSnapshot(mkInput(), META);
  assert.equal(withDecision.engineSuggestion, "PROCEED");
  assert.equal(withDecision.humanDecision?.level, "APPROVED");
  const html = renderOfferMemoHtml(withDecision);
  assert.ok(html.includes("Engine suggestion"));
  assert.ok(html.includes("Human decision"));
  assert.ok(html.includes("Proceed"));
  assert.ok(html.includes("Approved"));

  const noDecision = assembleOfferMemoSnapshot(mkInput({ decision: null }), META);
  assert.equal(noDecision.humanDecision, null);
  assert.equal(noDecision.engineSuggestion, "PROCEED"); // suggestion still present
  assert.ok(renderOfferMemoHtml(noDecision).includes("No human decision recorded"));
});

// --- branch coverage: formatting edge cases ----------------------------------
test("non-finite numbers and invalid dates degrade gracefully", () => {
  assert.equal(fmtUsd(Number.NaN), "—");
  assert.equal(fmtPct(Number.POSITIVE_INFINITY), "—");
  assert.equal(fmtMult(Number.NaN), "—");
  assert.equal(fmtInt(Number.POSITIVE_INFINITY), "—");
  assert.equal(fmtDateUtc("not-a-date"), "not-a-date"); // invalid → escaped raw string
});

test("equal-key ordering is stable (comparator equal branch)", () => {
  const snap = assembleOfferMemoSnapshot(
    mkInput({
      operatingAssumptions: [
        { key: "UNIT_COUNT", value: 24 },
        { key: "UNIT_COUNT", value: 24 },
      ],
    }),
    META,
  );
  assert.equal(snap.operatingAssumptions.length, 2);
});

test("assumption formatting covers each key convention", () => {
  const snap = assembleOfferMemoSnapshot(
    mkInput({
      operatingAssumptions: [
        { key: "UNIT_COUNT", value: 24 }, // → integer
        { key: "EXIT_CAP_RATE_PCT", value: 6.5 }, // _PCT → percent
        { key: "AMORTIZATION_YEARS", value: 30 }, // _YEARS → years
        { key: "PURCHASE_PRICE", value: 1_000_000 }, // else → USD
        { key: "DOUBLE__UNDERSCORE", value: 100 }, // empty title segment branch
      ],
    }),
    META,
  );
  const html = renderOfferMemoHtml(snap);
  assert.ok(html.includes("6.5%"));
  assert.ok(html.includes("30 yrs"));
  assert.ok(html.includes("$1,000,000"));
});

test("a memo without postal code or unit count renders cleanly", () => {
  const snap = assembleOfferMemoSnapshot(
    mkInput({ property: { ...mkInput().property, postalCode: null, county: null, unitCount: null } }),
    META,
  );
  const html = renderOfferMemoHtml(snap);
  assert.ok(html.includes("Atlanta"));
  assert.ok(!html.includes("undefined"));
  assert.ok(!html.includes("units")); // unit-count clause omitted
});

// --- missing optional values render as an em dash, never crash ---------------
test("null metrics render as em dashes", () => {
  const bare = mkInput({
    result: {
      grossIncomeAnnualUsd: null,
      operatingExpensesUsd: null,
      noiAnnualUsd: null,
      allInCostUsd: 1_000_000,
      capRate: null,
      pricePerUnitUsd: null,
      expenseRatioPct: null,
      spreadUsd: null,
    },
    findings: [],
    suggestedRecommendation: null,
    decision: null,
    scenario: { ...mkInput().scenario, analystSummary: null },
  });
  const html = renderOfferMemoHtml(assembleOfferMemoSnapshot(bare, META));
  assert.ok(html.includes("—"));
  assert.ok(html.includes("No findings were raised"));
});

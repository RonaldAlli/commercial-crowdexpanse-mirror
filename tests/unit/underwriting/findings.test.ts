import { test } from "node:test";
import assert from "node:assert/strict";

import { deriveFindings, type OperatingFindingInput, type CaseFindingInput } from "../../../lib/underwriting/findings";

// A clean operating result (positive, healthy spread, moderate expenses).
const cleanOperating: OperatingFindingInput = { spreadUsd: 200_000, allInCostUsd: 1_000_000, expenseRatioPct: 40 };

function mkCase(over: Partial<CaseFindingInput> = {}): CaseFindingInput {
  return {
    id: over.id ?? "case-1",
    label: over.label ?? "Base",
    isPrimary: over.isPrimary ?? true,
    hasDebt: over.hasDebt ?? true,
    dscr: over.dscr ?? 1.4,
    minDscr: over.minDscr ?? null,
    debtYieldPct: over.debtYieldPct ?? 10,
    avgDscr: over.avgDscr ?? 1.4,
    year1CashFlowBeforeTaxUsd: over.year1CashFlowBeforeTaxUsd ?? 20_000,
    hasExit: over.hasExit ?? true,
    equityMultiple: over.equityMultiple ?? 1.8,
    leveredIrrPct: over.leveredIrrPct ?? 12,
    ...over,
  };
}
const codes = (r: ReturnType<typeof deriveFindings>) => r.findings.map((f) => f.code);

// --- clean deal --------------------------------------------------------------
test("a clean deal yields PROCEED and no risk findings", () => {
  const r = deriveFindings(cleanOperating, [mkCase({ dscr: 1.3, equityMultiple: 1.5, leveredIrrPct: 12 })]);
  assert.equal(r.recommendation, "PROCEED");
  assert.ok(!r.findings.some((f) => f.severity !== "INFO"));
});

// --- operating rules ---------------------------------------------------------
test("non-positive spread is CRITICAL and forces PASS", () => {
  const r = deriveFindings({ spreadUsd: 0, allInCostUsd: 1_000_000, expenseRatioPct: 40 }, []);
  assert.ok(codes(r).includes("NEGATIVE_SPREAD"));
  assert.equal(r.recommendation, "PASS");
});

test("a thin positive spread is a WARNING → PROCEED_WITH_CONDITIONS", () => {
  const r = deriveFindings({ spreadUsd: 10_000, allInCostUsd: 1_000_000, expenseRatioPct: 40 }, []);
  assert.ok(codes(r).includes("THIN_SPREAD"));
  assert.equal(r.recommendation, "PROCEED_WITH_CONDITIONS");
});

test("thin-spread rule is skipped when all-in cost is null or non-positive, and when spread is healthy", () => {
  assert.ok(!codes(deriveFindings({ spreadUsd: 10_000, allInCostUsd: null, expenseRatioPct: 40 }, [])).includes("THIN_SPREAD"));
  assert.ok(!codes(deriveFindings({ spreadUsd: 200_000, allInCostUsd: 1_000_000, expenseRatioPct: 40 }, [])).includes("THIN_SPREAD"));
});

test("a high operating expense ratio is a WARNING", () => {
  const r = deriveFindings({ spreadUsd: 200_000, allInCostUsd: 1_000_000, expenseRatioPct: 60 }, []);
  assert.ok(codes(r).includes("HIGH_EXPENSE_RATIO"));
  assert.equal(r.recommendation, "PROCEED_WITH_CONDITIONS");
});

// --- financing rules ---------------------------------------------------------
test("DSCR below 1.0 is CRITICAL → PASS", () => {
  const r = deriveFindings(cleanOperating, [mkCase({ dscr: 0.9 })]);
  assert.ok(codes(r).includes("DSCR_BELOW_ONE"));
  assert.equal(r.recommendation, "PASS");
});

test("DSCR below the case minimum (or the 1.25 fallback) is a WARNING", () => {
  const withMin = deriveFindings(cleanOperating, [mkCase({ dscr: 1.2, minDscr: 1.3 })]);
  assert.ok(codes(withMin).includes("DSCR_BELOW_MIN"));
  assert.equal(withMin.findings.find((f) => f.code === "DSCR_BELOW_MIN")?.thresholdValue, 1.3);
  const fallback = deriveFindings(cleanOperating, [mkCase({ dscr: 1.2, minDscr: null })]);
  assert.equal(fallback.findings.find((f) => f.code === "DSCR_BELOW_MIN")?.thresholdValue, 1.25);
});

test("a healthy DSCR (≥1.5) is an INFO signal and never escalates the recommendation", () => {
  const r = deriveFindings(cleanOperating, [mkCase({ dscr: 1.6 })]);
  assert.ok(codes(r).includes("HEALTHY_DSCR"));
  assert.equal(r.recommendation, "PROCEED");
});

test("a DSCR between the target and 1.5 produces no DSCR finding", () => {
  const r = deriveFindings(cleanOperating, [mkCase({ dscr: 1.35 })]);
  assert.ok(!codes(r).some((c) => c.startsWith("DSCR") || c === "HEALTHY_DSCR"));
});

test("thin debt yield and negative year-1 cash flow are WARNINGs; a null debt yield is skipped", () => {
  const r = deriveFindings(cleanOperating, [mkCase({ debtYieldPct: 6, year1CashFlowBeforeTaxUsd: -5_000 })]);
  assert.ok(codes(r).includes("THIN_DEBT_YIELD"));
  assert.ok(codes(r).includes("NEGATIVE_YEAR1_CF"));
  assert.ok(!codes(deriveFindings(cleanOperating, [mkCase({ debtYieldPct: null })])).includes("THIN_DEBT_YIELD"));
});

test("average DSCR below 1.0 is CRITICAL → PASS", () => {
  const r = deriveFindings(cleanOperating, [mkCase({ avgDscr: 0.95 })]);
  assert.ok(codes(r).includes("AVG_DSCR_BELOW_ONE"));
  assert.equal(r.recommendation, "PASS");
});

test("financing rules are skipped entirely for an all-cash (no-debt) case", () => {
  const r = deriveFindings(cleanOperating, [mkCase({ hasDebt: false, dscr: 0.1, debtYieldPct: 1, avgDscr: 0.1, year1CashFlowBeforeTaxUsd: -100 })]);
  assert.ok(!codes(r).some((c) => c.startsWith("DSCR") || c === "THIN_DEBT_YIELD" || c === "AVG_DSCR_BELOW_ONE" || c === "NEGATIVE_YEAR1_CF"));
});

// --- return rules ------------------------------------------------------------
test("equity multiple below 1.0 and a negative IRR are CRITICAL → PASS", () => {
  const r = deriveFindings(cleanOperating, [mkCase({ equityMultiple: 0.8, leveredIrrPct: -3 })]);
  assert.ok(codes(r).includes("EQUITY_MULTIPLE_BELOW_ONE"));
  assert.ok(codes(r).includes("NEGATIVE_IRR"));
  assert.equal(r.recommendation, "PASS");
});

test("an IRR between 0 and the 8% hurdle is a WARNING, not a critical", () => {
  const r = deriveFindings(cleanOperating, [mkCase({ leveredIrrPct: 5, equityMultiple: 1.3 })]);
  assert.ok(codes(r).includes("IRR_BELOW_HURDLE"));
  assert.ok(!codes(r).includes("NEGATIVE_IRR"));
  assert.equal(r.recommendation, "PROCEED_WITH_CONDITIONS");
});

test("a strong return (≥2.0x or ≥15% IRR) is an INFO signal", () => {
  assert.ok(codes(deriveFindings(cleanOperating, [mkCase({ equityMultiple: 2.2, leveredIrrPct: 12 })])).includes("STRONG_RETURN"));
  assert.ok(codes(deriveFindings(cleanOperating, [mkCase({ equityMultiple: 1.8, leveredIrrPct: 18 })])).includes("STRONG_RETURN"));
});

test("return rules are skipped when no exit is modeled", () => {
  const r = deriveFindings(cleanOperating, [mkCase({ hasExit: false, equityMultiple: 0.5, leveredIrrPct: -9 })]);
  assert.ok(!codes(r).some((c) => c === "EQUITY_MULTIPLE_BELOW_ONE" || c === "NEGATIVE_IRR" || c === "IRR_BELOW_HURDLE"));
});

// --- ownership / decisiveness (R-B) ------------------------------------------
test("a CRITICAL finding on a NON-primary case is reported but is NOT decisive", () => {
  const primary = mkCase({ id: "p", label: "Primary", isPrimary: true, dscr: 1.4 });
  const alt = mkCase({ id: "a", label: "Alt", isPrimary: false, dscr: 0.8 });
  const r = deriveFindings(cleanOperating, [primary, alt]);
  const critical = r.findings.find((f) => f.code === "DSCR_BELOW_ONE");
  assert.equal(critical?.financingCaseId, "a");
  assert.equal(critical?.decisive, false);
  // Primary is clean → the alt's critical does not force PASS.
  assert.equal(r.recommendation, "PROCEED");
});

test("findings cite their case id; operating findings have a null case id", () => {
  const r = deriveFindings({ spreadUsd: 0, allInCostUsd: 1_000_000, expenseRatioPct: 40 }, [mkCase({ id: "c9", dscr: 0.5 })]);
  assert.equal(r.findings.find((f) => f.code === "NEGATIVE_SPREAD")?.financingCaseId, null);
  assert.equal(r.findings.find((f) => f.code === "DSCR_BELOW_ONE")?.financingCaseId, "c9");
});

// --- ordering + determinism --------------------------------------------------
test("findings are ordered CRITICAL → WARNING → INFO and are deterministic", () => {
  const cases = [mkCase({ dscr: 0.9, debtYieldPct: 6, equityMultiple: 2.5 })];
  const r1 = deriveFindings({ spreadUsd: 10_000, allInCostUsd: 1_000_000, expenseRatioPct: 60 }, cases);
  const r2 = deriveFindings({ spreadUsd: 10_000, allInCostUsd: 1_000_000, expenseRatioPct: 60 }, cases);
  assert.deepEqual(codes(r1), codes(r2));
  const sev = r1.findings.map((f) => f.severity);
  const rank = { CRITICAL: 0, WARNING: 1, INFO: 2 } as const;
  for (let i = 1; i < sev.length; i++) assert.ok(rank[sev[i]] >= rank[sev[i - 1]], "severity is non-decreasing");
});

test("null operating metrics produce no operating findings", () => {
  const r = deriveFindings({ spreadUsd: null, allInCostUsd: null, expenseRatioPct: null }, []);
  assert.equal(r.findings.length, 0);
  assert.equal(r.recommendation, "PROCEED");
});

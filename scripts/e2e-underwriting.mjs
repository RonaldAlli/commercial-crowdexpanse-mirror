// Focused E2E for Commercial Underwriting (v1.3). Runs against the *_test DB with
// throwaway orgs. Proves: the canonical Underwriting → Scenario → Assumption →
// ScenarioResult model; ScenarioResult == the unchanged kernel (operating,
// behavior-preserving); the one-way ScenarioSeed snapshot (a Scenario never
// changes because the Property changes); deterministic + content-idempotent
// rebuild that NEVER reads current Property state; DRAFT/LOCKED/SUPERSEDED
// lifecycle + versioning; "every deterministic output belongs to exactly one
// Scenario"; the DealAnalysis backfill; org scoping; debt sizing + income/expense
// schedules; and (3b-iii) FinancingCase capital structures + multi-year cash flow
// under CF-1…CF-5 (capital owned by the case; operating economics shared; cash
// flow per case; independent reproducibility).
import { assertTestDatabase } from "./e2e-guard.mjs";

import { prisma } from "../lib/prisma.ts";
import { createPropertyRecord } from "../lib/properties.ts";
import { computeAnalysis } from "../lib/analysis.ts";
import { sizeDebt } from "../lib/underwriting/debt-sizing.ts";
import {
  saveAnalyzerScenario,
  rebuildScenarioResult,
  rebuildFinancingCase,
  lockScenario,
  createNextVersion,
  recordUnderwritingDecision,
  setScenarioAssumptions,
  setSensitivityAnalysis,
  rebuildSensitivity,
  rebuildFindings,
  getActiveScenarioResult,
  getScenarioComparison,
  getScenarioForMemo,
  resolveScenarioAssumptions,
  backfillUnderwritingFromDealAnalysis,
} from "../lib/underwriting.ts";
import { generateOfferMemo, listGeneratedMemos } from "../lib/documents/offer-memo-service.ts";
import { absolutePathFor, removeFile } from "../lib/storage.ts";
import fs from "node:fs";
import crypto from "node:crypto";

const TAG = "e2e-underwriting";
assertTestDatabase();
let ok = 0;
const fail = [];
function assert(cond, msg) { if (cond) { ok++; console.log(`  ✓ ${msg}`); } else { fail.push(msg); console.log(`  ✗ ${msg}`); } }
async function throws(fn, msg) { try { await fn(); assert(false, msg); } catch { assert(true, msg); } }

const op = (over = {}) => ({
  name: "Asset", assetType: "MULTIFAMILY", status: null, addressLine1: "1 Main St", city: "Atlanta", state: "GA",
  postalCode: null, county: null, sellerId: null, unitCount: null, acreage: null, occupancyRate: null,
  noiAnnualUsd: null, askingPriceUsd: null, estimatedValueUsd: null, capRate: null, ...over,
});

// The base deal (mirrors the analysis unit test). MANUAL is now OPERATING-ONLY
// (3b-iii, CF-1): capital lives on a FinancingCase. UNIT_COUNT + ESTIMATED_VALUE
// come from the Property as SEEDED assumptions.
const MANUAL = [
  { key: "PURCHASE_PRICE", value: 1_000_000 },
  { key: "RENOVATION_BUDGET", value: 50_000 },
  { key: "CLOSING_COSTS", value: 25_000 },
  { key: "GROSS_INCOME", value: 120_000 },
  { key: "OPERATING_EXPENSES", value: 40_000 },
];
const UNIT_COUNT = 10;
const EST_VALUE = 1_200_000;
// Operating (debt-free) kernel expectation for the base deal.
const expected = computeAnalysis({
  purchasePriceUsd: 1_000_000, renovationBudgetUsd: 50_000, closingCostsUsd: 25_000,
  grossIncomeAnnualUsd: 120_000, operatingExpensesUsd: 40_000, loanAmountUsd: null,
  interestRatePct: null, amortizationYears: null, unitCount: UNIT_COUNT, estimatedValueUsd: EST_VALUE,
});

const xmin = async (sid) => (await prisma.$queryRaw`SELECT xmin::text AS xmin FROM scenario_results WHERE "scenarioId" = ${sid}`)[0]?.xmin;
const strip = (r) => { const { id, ...rest } = r; return JSON.stringify(rest); };
const mkOpp = (orgId, propertyId, title = "Deal") =>
  prisma.opportunity.create({ data: { organizationId: orgId, propertyId, title } });

const orgIds = [];
const memoKeys = []; // generated memo storage keys to remove on cleanup (files live on disk)
const shaOf = (buf) => crypto.createHash("sha256").update(buf).digest("hex");
try {
  const a = await prisma.organization.create({ data: { name: TAG, slug: `${TAG}-${process.pid}-a` } });
  orgIds.push(a.id);
  const b = await prisma.organization.create({ data: { name: TAG, slug: `${TAG}-${process.pid}-b` } });
  orgIds.push(b.id);

  console.log("\n[1] Save → the operating ScenarioResult equals the unchanged kernel (behavior-preserving):");
  const prop = await createPropertyRecord(a.id, op({ unitCount: UNIT_COUNT, estimatedValueUsd: EST_VALUE }), {});
  const opp = await mkOpp(a.id, prop.id);
  const { scenarioId, result } = await saveAnalyzerScenario(a.id, opp.id, MANUAL);
  assert(result.allInCostUsd === expected.allInCostUsd && result.allInCostUsd === 1_075_000, "all-in cost matches the kernel");
  assert(result.noiAnnualUsd === expected.noiAnnualUsd && result.noiAnnualUsd === 80_000, "NOI matches the kernel");
  assert(result.capRate === expected.capRate && result.capRate === 8, "cap rate matches the kernel");
  assert(result.pricePerUnitUsd === expected.pricePerUnitUsd, "price/unit matches the kernel");
  assert(result.spreadUsd === expected.spreadUsd && result.spreadUsd === 125_000, "spread uses the SEEDED estimated value");
  assert(result.dscr === undefined, "operating ScenarioResult carries NO financing metric (dscr column gone, CF-2)");
  assert((await prisma.financingCase.count({ where: { scenarioId } })) === 0, "no financing case yet (no debt modeled)");

  console.log("\n[2] Assumption provenance — 5 MANUAL + 2 SEEDED, seeds carry field/asOf:");
  const rows = await resolveScenarioAssumptions(scenarioId);
  assert(rows.length === 7, "exactly 7 operating assumptions (5 manual + 2 seeded)");
  const seeded = await prisma.underwritingAssumption.findMany({ where: { scenarioId, source: "SEEDED" }, orderBy: { key: "asc" } });
  assert(seeded.length === 2 && seeded.every((s) => s.sourceField && s.sourceAsOf), "SEEDED assumptions carry sourceField + sourceAsOf");
  assert(seeded.find((s) => s.key === "ESTIMATED_VALUE").valueNumeric.toNumber() === EST_VALUE, "ESTIMATED_VALUE snapshotted from the property");

  console.log("\n[3] scenarioVersion is a stored, rebuildable fingerprint distinct per assumption set:");
  const sc1 = await prisma.underwritingScenario.findUnique({ where: { id: scenarioId } });
  assert(typeof sc1.scenarioVersion === "string" && sc1.scenarioVersion.length === 32, "scenario carries a 32-char scenarioVersion");
  assert(result.scenarioVersion === sc1.scenarioVersion, "the result reflects the scenario's current scenarioVersion (not stale)");
  assert(sc1.modelVersion === 6 && sc1.calcLibVersion === 6 && sc1.rulesetVersion === 2, "model lineage frozen on the scenario (3b-vi ruleset bump)");

  console.log("\n[4] ScenarioSeed is a ONE-WAY snapshot — a later Property change never mutates the Scenario:");
  await prisma.property.update({ where: { id: prop.id }, data: { estimatedValueUsd: 5_000_000 } });
  const again = await saveAnalyzerScenario(a.id, opp.id, MANUAL); // re-save reuses the DRAFT scenario
  assert(again.scenarioId === scenarioId, "re-save reuses the same active DRAFT scenario");
  assert(again.result.spreadUsd === 125_000, "spread UNCHANGED after the property's estimated value changed (snapshot, not live)");

  console.log("\n[5] Reconstruction — rebuild is deterministic, reads only frozen assumptions, and is zero-write idempotent:");
  const before = await prisma.scenarioResult.findUnique({ where: { scenarioId } });
  await prisma.scenarioResult.delete({ where: { scenarioId } });
  await rebuildScenarioResult(a.id, scenarioId);
  const after = await prisma.scenarioResult.findUnique({ where: { scenarioId } });
  assert(strip(before) === strip(after), "ScenarioResult reconstructs byte-for-byte (excl. surrogate id)");
  const recomputed = await prisma.underwritingScenario.findUnique({ where: { id: scenarioId } });
  assert(recomputed.scenarioVersion === sc1.scenarioVersion, "stored scenarioVersion == recomputed fingerprint");
  const x1 = await xmin(scenarioId);
  await rebuildScenarioResult(a.id, scenarioId);
  assert((await xmin(scenarioId)) === x1, "a no-op rebuild performs ZERO writes (xmin unchanged)");
  // Reconstruction must NOT read current Property state.
  await prisma.property.update({ where: { id: prop.id }, data: { estimatedValueUsd: 9_999_999 } });
  await prisma.scenarioResult.delete({ where: { scenarioId } });
  await rebuildScenarioResult(a.id, scenarioId);
  assert((await prisma.scenarioResult.findUnique({ where: { scenarioId } })).spreadUsd === 125_000, "rebuild ignores current Property state (frozen assumptions only)");

  console.log("\n[6] Every deterministic output belongs to exactly one Scenario (1:1, no orphan/duplicate):");
  await throws(
    () => prisma.scenarioResult.create({ data: { organizationId: a.id, scenarioId, scenarioVersion: "x", calcLibVersion: 1, allInCostUsd: 1 } }),
    "a second ScenarioResult for the same scenario is rejected (scenarioId unique)",
  );
  const resultCount = await prisma.scenarioResult.count({ where: { organizationId: a.id } });
  const scenarioCount = await prisma.underwritingScenario.count({ where: { organizationId: a.id } });
  assert(resultCount === 1 && scenarioCount === 1, "one scenario, one result — no free-floating output");

  console.log("\n[7] Lifecycle — LOCKED is immutable; a new version SUPERSEDES the prior and becomes the head:");
  const locked = await lockScenario(a.id, scenarioId);
  assert(locked.status === "LOCKED" && locked.lockedAt instanceof Date, "scenario transitions DRAFT → LOCKED");
  await throws(() => setScenarioAssumptions(a.id, scenarioId, [{ key: "PURCHASE_PRICE", value: 2, source: "MANUAL" }]), "editing a LOCKED scenario is rejected");
  const v2 = await createNextVersion(a.id, scenarioId);
  assert(v2.version === 2 && v2.status === "DRAFT", "createNextVersion yields a DRAFT v2");
  const src = await prisma.underwritingScenario.findUnique({ where: { id: scenarioId } });
  assert(src.status === "SUPERSEDED" && src.supersededById === v2.id, "the source is SUPERSEDED, pointing at v2");
  const uw = await prisma.underwriting.findUnique({ where: { opportunityId: opp.id } });
  assert(uw.activeScenarioId === v2.id, "the underwriting's active head is now v2");
  assert((await resolveScenarioAssumptions(v2.id)).length === 7, "v2 cloned all 7 operating assumptions from the locked source");
  await setScenarioAssumptions(a.id, v2.id, [{ key: "PURCHASE_PRICE", value: 2_000_000, source: "MANUAL" }]);
  await rebuildScenarioResult(a.id, v2.id);
  const v2res = await prisma.scenarioResult.findUnique({ where: { scenarioId: v2.id } });
  assert(v2res.capRate === computeAnalysis({ ...manualInputs(2_000_000), unitCount: UNIT_COUNT, estimatedValueUsd: EST_VALUE }).capRate, "v2 recomputes independently after an edit");

  console.log("\n[8] Backfill — a legacy DealAnalysis migrates to an equivalent model; idempotent:");
  const prop2 = await createPropertyRecord(a.id, op({ name: "Legacy", unitCount: 8, estimatedValueUsd: 900_000 }), {});
  const opp2 = await mkOpp(a.id, prop2.id, "Legacy deal");
  const legacyMetrics = computeAnalysis({ purchasePriceUsd: 800_000, renovationBudgetUsd: null, closingCostsUsd: null, grossIncomeAnnualUsd: 90_000, operatingExpensesUsd: 30_000, loanAmountUsd: 600_000, interestRatePct: 5.5, amortizationYears: 25, unitCount: 8, estimatedValueUsd: 900_000 });
  await prisma.dealAnalysis.create({ data: { organizationId: a.id, propertyId: prop2.id, opportunityId: opp2.id, purchasePriceUsd: 800_000, grossIncomeAnnualUsd: 90_000, operatingExpensesUsd: 30_000, loanAmountUsd: 600_000, interestRatePct: 5.5, amortizationYears: 25, analystSummary: "legacy note" } });
  const r1 = await backfillUnderwritingFromDealAnalysis(a.id);
  assert(r1.created === 1, "backfill created exactly one underwriting from the legacy row");
  const migrated = await getActiveScenarioResult(a.id, opp2.id);
  assert(migrated.result.capRate === legacyMetrics.capRate && migrated.result.noiAnnualUsd === legacyMetrics.noiAnnualUsd, "migrated operating result equals the kernel over the legacy inputs + property context");
  assert(migrated.analystSummary === "legacy note", "legacy analystSummary preserved onto the scenario");
  assert(migrated.financingCases.length === 1 && migrated.financingCases[0].result.annualDebtServiceUsd != null, "legacy debt migrated to a Base financing case (CF-1)");
  const r2 = await backfillUnderwritingFromDealAnalysis(a.id);
  assert(r2.created === 0 && r2.skipped === 1, "backfill is idempotent (second run skips the existing underwriting)");

  console.log("\n[9] Org scoping — org B sees none of org A's underwriting data:");
  assert((await prisma.underwriting.count({ where: { organizationId: b.id } })) === 0, "org B has no underwritings");
  assert((await prisma.scenarioResult.count({ where: { organizationId: b.id } })) === 0, "org B has no scenario results");
  await throws(() => saveAnalyzerScenario(b.id, opp.id, MANUAL), "org B cannot underwrite org A's opportunity (cross-org rejected)");

  console.log("\n[10] Debt sizing (3b-i) now lives on the FinancingCase (3b-iii) — deterministic sizing + rebuild:");
  const sp = await createPropertyRecord(a.id, op({ name: "Sizing", unitCount: UNIT_COUNT, estimatedValueUsd: 1_000_000 }), {});
  const sopp = await mkOpp(a.id, sp.id, "Sizing deal");
  const sizingOperating = [
    { key: "PURCHASE_PRICE", value: 1_000_000 },
    { key: "RENOVATION_BUDGET", value: 50_000 },
    { key: "CLOSING_COSTS", value: 25_000 },
    { key: "GROSS_INCOME", value: 130_000 },
    { key: "OPERATING_EXPENSES", value: 30_000 },
  ];
  const sizedCase = [{ label: "Sized", capital: [
    { key: "LOAN_AMOUNT", value: 750_000 }, { key: "INTEREST_RATE", value: 6 }, { key: "AMORTIZATION_YEARS", value: 30 },
    { key: "TARGET_LTV_PCT", value: 75 }, { key: "TARGET_LTC_PCT", value: 80 }, { key: "MIN_DSCR", value: 1.25 },
  ] }];
  await saveAnalyzerScenario(a.id, sopp.id, sizingOperating, { financingCases: sizedCase });
  const sActive = await getActiveScenarioResult(a.id, sopp.id);
  const fc = sActive.financingCases[0];
  const fcr = fc.result;
  // Cross-check against the pure kernel + sizing module: NOI 100k, allInCost 1.075M, estValue 1M (seeded).
  const km = computeAnalysis({ purchasePriceUsd: 1_000_000, renovationBudgetUsd: 50_000, closingCostsUsd: 25_000, grossIncomeAnnualUsd: 130_000, operatingExpensesUsd: 30_000, loanAmountUsd: 750_000, interestRatePct: 6, amortizationYears: 30, unitCount: UNIT_COUNT, estimatedValueUsd: 1_000_000 });
  const expSizing = sizeDebt({ estimatedValueUsd: 1_000_000, allInCostUsd: km.allInCostUsd, noiAnnualUsd: km.noiAnnualUsd, interestRatePct: 6, amortizationYears: 30, targetLtvPct: 75, targetLtcPct: 80, minDscr: 1.25 });
  assert(fcr.loanByLtvUsd === 750_000, "loan by LTV = 75% of estimated value (1M) = 750k");
  assert(fcr.loanByLtcUsd === expSizing.loanByLtcUsd && fcr.loanByLtcUsd === 860_000, "loan by LTC = 80% of all-in cost (1.075M) = 860k");
  assert(fcr.loanByDscrUsd === expSizing.loanByDscrUsd, "loan by DSCR matches the pure sizing module");
  assert(fcr.sizedLoanUsd === 750_000 && fcr.bindingConstraint === "LTV", "sized loan = min = LTV-bound 750k (on the FinancingCase)");
  assert(fcr.dscr === km.dscr && fcr.debtYieldPct === km.debtYieldPct, "case carries the kernel's debt service metrics");
  // The operating ScenarioResult has no sizing fields (relocated).
  assert(sActive.result.sizedLoanUsd === undefined, "operating ScenarioResult has no debt-sizing fields (CF-2)");
  // Rebuild the financing case deterministically (reads only frozen operating + capital).
  await rebuildFinancingCase(a.id, fc.id);
  const fcr2 = await prisma.financingCaseResult.findUnique({ where: { financingCaseId: fc.id } });
  assert(fcr2.sizedLoanUsd === 750_000 && fcr2.bindingConstraint === "LTV", "financing result reconstructs deterministically from frozen inputs");

  console.log("\n[11] Income/expense schedules (3b-ii) — roll up to NOI, override scalar, rebuild, revert:");
  const schedProp = await createPropertyRecord(a.id, op({ name: "Sched", unitCount: UNIT_COUNT, estimatedValueUsd: 1_200_000 }), {});
  const schedOpp = await mkOpp(a.id, schedProp.id, "Sched deal");
  const schedLines = [
    { kind: "INCOME", category: "Base Rent", amountAnnualUsd: 100_000 },
    { kind: "INCOME", category: "Other Income", amountAnnualUsd: 40_000 },
    { kind: "EXPENSE", category: "Taxes", amountAnnualUsd: 30_000 },
    { kind: "EXPENSE", category: "Insurance", amountAnnualUsd: 20_000 },
  ];
  // MANUAL carries scalar gross income 120k / opex 40k; the schedule (140k / 50k) overrides.
  const schedRes = (await saveAnalyzerScenario(a.id, schedOpp.id, MANUAL, { lines: schedLines })).result;
  assert(schedRes.grossIncomeAnnualUsd === 140_000, "effective gross income = income schedule sum (140k), overriding scalar 120k");
  assert(schedRes.operatingExpensesUsd === 50_000, "effective opex = expense schedule sum (50k), overriding scalar 40k");
  assert(schedRes.noiAnnualUsd === 90_000, "NOI = 140k − 50k = 90k, sourced from the schedule");
  const schedSid = schedRes.scenarioId;
  assert((await prisma.scenarioLineItem.count({ where: { scenarioId: schedSid } })) === 4, "4 schedule line items persisted");
  await prisma.scenarioResult.delete({ where: { scenarioId: schedSid } });
  await rebuildScenarioResult(a.id, schedSid);
  assert((await prisma.scenarioResult.findUnique({ where: { scenarioId: schedSid } })).noiAnnualUsd === 90_000, "schedule-derived NOI reconstructs from persisted line items");
  await saveAnalyzerScenario(a.id, schedOpp.id, MANUAL, { lines: [] });
  const cleared = (await getActiveScenarioResult(a.id, schedOpp.id)).result;
  assert(cleared.grossIncomeAnnualUsd === 120_000 && cleared.noiAnnualUsd === 80_000, "clearing the schedule reverts to scalar gross income 120k / NOI 80k");

  console.log("\n[12] Financing cases + cash flow (3b-iii, CF-1…CF-5) — per-case debt over shared operating NOI:");
  const cfProp = await createPropertyRecord(a.id, op({ name: "CashFlow", unitCount: UNIT_COUNT, estimatedValueUsd: 1_000_000 }), {});
  const cfOpp = await mkOpp(a.id, cfProp.id, "CashFlow deal");
  const cfOperating = [
    { key: "PURCHASE_PRICE", value: 1_000_000 },
    { key: "GROSS_INCOME", value: 130_000 },
    { key: "OPERATING_EXPENSES", value: 30_000 },
    { key: "INCOME_GROWTH_PCT", value: 0 },
    { key: "EXPENSE_GROWTH_PCT", value: 0 },
    { key: "HOLD_YEARS", value: 3 },
  ];
  const twoCases = [
    { label: "Debt", capital: [{ key: "LOAN_AMOUNT", value: 750_000 }, { key: "INTEREST_RATE", value: 6 }, { key: "AMORTIZATION_YEARS", value: 30 }] },
    { label: "All cash", capital: [] },
  ];
  await saveAnalyzerScenario(a.id, cfOpp.id, cfOperating, { financingCases: twoCases });
  const cf = await getActiveScenarioResult(a.id, cfOpp.id);
  assert(cf.financingCases.length === 2, "two financing cases persisted under one scenario");
  const [debtCase, cashCase] = cf.financingCases;
  // CF-2: operating NOI is shared; the operating result carries no debt.
  assert(cf.result.noiAnnualUsd === 100_000, "operating NOI (100k) is shared by both cases (CF-2)");
  // CF-5: each case's cash-flow NOI equals the shared operating NOI.
  assert(debtCase.cashFlow.length === 3 && debtCase.cashFlow[0].noiUsd === 100_000, "debt case projects 3 years; year-1 NOI = operating NOI (CF-5)");
  assert(cashCase.cashFlow[0].noiUsd === 100_000, "all-cash case shares the SAME operating NOI (CF-5)");
  // Debt case: levered cash flow < NOI; DSCR present.
  assert(debtCase.result.dscr != null && debtCase.result.annualDebtServiceUsd != null, "debt case has DSCR + debt service");
  assert(debtCase.cashFlow[0].cashFlowBeforeTaxUsd < 100_000, "levered cash flow < NOI (debt service deducted)");
  // All-cash case: NOI passes straight through, no DSCR.
  assert(cashCase.result.dscr === null && cashCase.result.annualDebtServiceUsd === null, "all-cash case has no debt service / DSCR");
  assert(cashCase.cashFlow[0].cashFlowBeforeTaxUsd === 100_000, "all-cash cash flow = the full NOI");
  // CF-3: cases share operating but differ by capital ⇒ distinct fingerprints + cash flow.
  assert(debtCase.financingCaseVersion !== cashCase.financingCaseVersion, "cases have distinct fingerprints (capital differs, CF-3)");
  assert(debtCase.cashFlow[0].cashFlowBeforeTaxUsd !== cashCase.cashFlow[0].cashFlowBeforeTaxUsd, "cases differ in cash flow");
  // CF-4: changing the operating scenario reprices EVERY case, but the case set is unchanged (financingCases omitted).
  await saveAnalyzerScenario(a.id, cfOpp.id, cfOperating.map((m) => (m.key === "GROSS_INCOME" ? { ...m, value: 150_000 } : m)));
  const cf2 = await getActiveScenarioResult(a.id, cfOpp.id);
  assert(cf2.result.noiAnnualUsd === 120_000, "operating NOI updated to 120k after the income edit");
  assert(cf2.financingCases.length === 2, "cases preserved (only refreshed) when financingCases is omitted (CF-4)");
  assert(cf2.financingCases[0].cashFlow[0].noiUsd === 120_000, "each case's cash flow reflects the new operating NOI (CF-4/CF-5)");

  console.log("\n[13] Exit valuation + equity returns (3b-iv, EX-1…EX-6):");
  const exProp = await createPropertyRecord(a.id, op({ name: "Exit", unitCount: UNIT_COUNT, estimatedValueUsd: 1_000_000 }), {});
  const exOpp = await mkOpp(a.id, exProp.id, "Exit deal");
  const exOperating = [
    { key: "PURCHASE_PRICE", value: 1_000_000 },
    { key: "GROSS_INCOME", value: 130_000 },
    { key: "OPERATING_EXPENSES", value: 30_000 },
    { key: "INCOME_GROWTH_PCT", value: 0 },
    { key: "EXPENSE_GROWTH_PCT", value: 0 },
    { key: "HOLD_YEARS", value: 5 },
    { key: "EXIT_CAP_RATE_PCT", value: 8 },
    { key: "SELLING_COSTS_PCT", value: 2 },
  ];
  const exCases = [
    { label: "Debt", capital: [{ key: "LOAN_AMOUNT", value: 750_000 }, { key: "INTEREST_RATE", value: 6 }, { key: "AMORTIZATION_YEARS", value: 30 }] },
    { label: "All cash", capital: [] },
  ];
  await saveAnalyzerScenario(a.id, exOpp.id, exOperating, { financingCases: exCases });
  const ex = await getActiveScenarioResult(a.id, exOpp.id);
  const dCase = ex.financingCases[0];
  const cCase = ex.financingCases[1];
  const dr = dCase.result;
  const cr = cCase.result;
  const rnd = (n) => Math.round(n * 100) / 100;
  // NOI 100k, hold 5, 0 growth ⇒ terminal NOI 100k; gross exit = 100k / 8% = 1.25M.
  assert(dr.terminalNoiUsd === 100_000 && dr.grossExitValueUsd === 1_250_000, "terminal value = exit-year NOI capitalized at the exit cap rate (EX-2)");
  assert(dr.sellingCostsUsd === 25_000, "selling costs = 2% of gross exit value");
  assert(dr.debtPayoffUsd > 690_000 && dr.debtPayoffUsd < 710_000, "amortized debt payoff at exit (~698k after 5 of 30 yrs, real amortization — EX-3)");
  assert(dr.netSaleProceedsUsd === rnd(1_250_000 - 25_000 - dr.debtPayoffUsd), "net sale proceeds = gross − selling − payoff");
  assert(dr.contributedEquityUsd === 250_000, "contributed equity = all-in cost (1.0M) − loan (750k)");
  assert(dr.equityMultiple > 1 && dr.leveredIrrPct > 0, "levered deal is profitable (multiple > 1, IRR > 0)");
  // All-cash case: no debt payoff, equity = full cost.
  assert(cr.debtPayoffUsd === 0 && cr.contributedEquityUsd === 1_000_000, "all-cash: no debt payoff, equity = all-in cost");
  assert(cr.netSaleProceedsUsd === 1_225_000, "all-cash net sale proceeds = gross − selling (1.225M)");
  // EX-1: the exit layer never changed the operating or cash-flow layers beneath it.
  assert(ex.result.noiAnnualUsd === 100_000, "EX-1: operating NOI unchanged by the exit layer");
  assert(dCase.cashFlow[0].noiUsd === 100_000 && dCase.cashFlow.length === 5, "EX-1: the 5-year cash flow beneath is unchanged");
  // Equity cash-flow series persisted (year 0..5) with EX-5 no-double-count.
  assert(dCase.equityCashFlow.length === 6, "equity series persisted: year 0..5 (EX-4)");
  assert(dCase.equityCashFlow[0].equityCashFlowUsd === -250_000, "year 0 = −contributed equity");
  assert(dCase.equityCashFlow[5].equityCashFlowUsd === rnd(dCase.cashFlow[4].cashFlowBeforeTaxUsd + dr.netSaleProceedsUsd), "EX-5: final year = operating CF + sale, counted once");
  assert(dCase.equityCashFlow[1].equityCashFlowUsd === dCase.cashFlow[0].cashFlowBeforeTaxUsd, "years 1..N−1 are the plain operating cash flow");
  // Reconstruction + zero-write idempotency (EX-2/EX-3).
  const fcrXmin = async (id) => (await prisma.$queryRaw`SELECT xmin::text AS xmin FROM financing_case_results WHERE "financingCaseId" = ${id}`)[0]?.xmin;
  await prisma.equityCashFlowYear.deleteMany({ where: { financingCaseId: dCase.id } });
  await prisma.financingCaseResult.delete({ where: { financingCaseId: dCase.id } });
  await rebuildFinancingCase(a.id, dCase.id);
  const rebuilt = await prisma.financingCaseResult.findUnique({ where: { financingCaseId: dCase.id } });
  assert(rebuilt.terminalNoiUsd === 100_000 && rebuilt.netSaleProceedsUsd === dr.netSaleProceedsUsd && rebuilt.equityMultiple === dr.equityMultiple, "exit + returns reconstruct deterministically from frozen inputs");
  assert((await prisma.equityCashFlowYear.count({ where: { financingCaseId: dCase.id } })) === 6, "equity series rebuilt (year 0..5)");
  const exZ = await fcrXmin(dCase.id);
  await rebuildFinancingCase(a.id, dCase.id);
  assert((await fcrXmin(dCase.id)) === exZ, "a no-op rebuild of the exit/returns result performs ZERO writes (xmin unchanged)");
  // Fingerprint sensitivity: an exit assumption feeds the FinancingCase fingerprint.
  const fpBefore = dCase.financingCaseVersion;
  await saveAnalyzerScenario(a.id, exOpp.id, exOperating.map((m) => (m.key === "EXIT_CAP_RATE_PCT" ? { ...m, value: 6 } : m)));
  const ex2 = await getActiveScenarioResult(a.id, exOpp.id);
  assert(ex2.financingCases[0].financingCaseVersion !== fpBefore, "changing an exit assumption flips the FinancingCase fingerprint");
  assert(ex2.financingCases[0].result.grossExitValueUsd === rnd(100_000 / 0.06), "a lower exit cap rate reprices the terminal value (6% ⇒ 1.667M)");

  console.log("\n[14] Sensitivity matrices (3b-v, SE-1…SE-7):");
  const seProp = await createPropertyRecord(a.id, op({ name: "Sensitivity", unitCount: UNIT_COUNT, estimatedValueUsd: 1_000_000 }), {});
  const seOpp = await mkOpp(a.id, seProp.id, "Sensitivity deal");
  const seOperating = [
    { key: "PURCHASE_PRICE", value: 1_000_000 },
    { key: "GROSS_INCOME", value: 130_000 },
    { key: "OPERATING_EXPENSES", value: 30_000 },
    { key: "INCOME_GROWTH_PCT", value: 0 },
    { key: "EXPENSE_GROWTH_PCT", value: 0 },
    { key: "HOLD_YEARS", value: 5 },
    { key: "EXIT_CAP_RATE_PCT", value: 8 },
    { key: "SELLING_COSTS_PCT", value: 2 },
  ];
  // Two-axis grid on the levered case. x = exit cap 6..10 (→ 6,7,8,9,10; baseline 8 lands on it);
  // y = interest 5..7 (→ 5,6,7; baseline 6 lands on it). One axis is operating, one is capital.
  const seSpec = { targetMetric: "LEVERED_IRR_PCT", xKey: "EXIT_CAP_RATE_PCT", xMin: 6, xMax: 10, xSteps: 5, yKey: "INTEREST_RATE", yMin: 5, yMax: 7, ySteps: 3 };
  const seCases = [
    { label: "Debt", capital: [{ key: "LOAN_AMOUNT", value: 750_000 }, { key: "INTEREST_RATE", value: 6 }, { key: "AMORTIZATION_YEARS", value: 30 }], sensitivity: seSpec },
  ];
  await saveAnalyzerScenario(a.id, seOpp.id, seOperating, { financingCases: seCases });
  const se = await getActiveScenarioResult(a.id, seOpp.id);
  const seCase = se.financingCases[0];
  const an = seCase.sensitivity;
  assert(an != null && an.cells.length === 15, "sensitivity grid persisted: 5 × 3 = 15 cells");
  assert(an.xKey === "EXIT_CAP_RATE_PCT" && an.yKey === "INTEREST_RATE" && an.targetMetric === "LEVERED_IRR_PCT", "spec persisted (both axes + target metric)");
  const xs = [...new Set(an.cells.map((c) => c.xValue))].sort((p, q) => p - q);
  const ys = [...new Set(an.cells.map((c) => c.yValue))].sort((p, q) => p - q);
  assert(JSON.stringify(xs) === JSON.stringify([6, 7, 8, 9, 10]) && JSON.stringify(ys) === JSON.stringify([5, 6, 7]), "SE-5: axes are deterministic evenly-spaced values");
  // SE-6: exactly one baseline cell, at the frozen (exit 8%, interest 6%) intersection.
  const seBase = an.cells.filter((c) => c.isBaseline);
  assert(seBase.length === 1 && seBase[0].xValue === 8 && seBase[0].yValue === 6, "SE-6: exactly one baseline cell, at the frozen (8%, 6%) values");
  assert(rnd(seBase[0].metricValue) === rnd(seCase.result.leveredIrrPct), "SE-2: the baseline cell reproduces the case's own leveredIrrPct exactly");
  assert(an.cells.every((c) => typeof c.metricValue === "number"), "every feasible cell carries a derived metric reading");
  const rowAt6 = an.cells.filter((c) => c.yValue === 6).sort((p, q) => p.xValue - q.xValue);
  assert(rowAt6[0].metricValue > rowAt6[4].metricValue, "a lower exit cap → higher IRR (6% beats 10% at the same interest rate)");
  // SE-1: the sensitivity layer never wrote its perturbations back onto the baseline.
  const seAssumptions = await resolveScenarioAssumptions(se.id);
  assert(seAssumptions.find((x) => x.key === "EXIT_CAP_RATE_PCT").value === 8, "SE-1: the baseline exit cap is still 8% (perturbations never persisted)");
  assert(Number(seCase.capitalAssumptions.find((x) => x.key === "INTEREST_RATE").valueNumeric) === 6, "SE-1: the baseline interest rate is still 6% (perturbations never persisted)");
  assert(se.result.noiAnnualUsd === 100_000, "SE-1: operating NOI unchanged by the sensitivity layer");

  // Reconstruction + zero-write idempotency (SE-4).
  const cellXmin = async (aid) => (await prisma.$queryRaw`SELECT xmin::text AS xmin FROM sensitivity_cells WHERE "sensitivityAnalysisId" = ${aid} ORDER BY "yIndex","xIndex" LIMIT 1`)[0]?.xmin;
  await prisma.sensitivityCell.deleteMany({ where: { sensitivityAnalysisId: an.id } });
  await rebuildSensitivity(a.id, seCase.id);
  const reAn = await prisma.sensitivityAnalysis.findUnique({ where: { id: an.id }, include: { cells: { orderBy: [{ yIndex: "asc" }, { xIndex: "asc" }] } } });
  assert(reAn.cells.length === 15 && rnd(reAn.cells.find((c) => c.isBaseline).metricValue) === rnd(seBase[0].metricValue), "cells reconstruct deterministically from frozen inputs");
  const seZ = await cellXmin(an.id);
  await rebuildSensitivity(a.id, seCase.id);
  assert((await cellXmin(an.id)) === seZ, "SE-4: a no-op sensitivity rebuild performs ZERO cell writes (xmin unchanged)");

  // The baseline fingerprint drives the grid: an operating change reflows it (SE-3).
  const svBefore = reAn.sensitivityVersion;
  await saveAnalyzerScenario(a.id, seOpp.id, seOperating.map((m) => (m.key === "GROSS_INCOME" ? { ...m, value: 150_000 } : m)));
  const seAfter = await getActiveScenarioResult(a.id, seOpp.id);
  assert(seAfter.financingCases[0].sensitivity.sensitivityVersion !== svBefore, "SE-3: a baseline (operating) change reflows the grid + flips the sensitivityVersion");

  // Standalone setter: one-axis (degenerate) analysis, baseline on the axis.
  await setSensitivityAnalysis(a.id, seCase.id, { targetMetric: "EQUITY_MULTIPLE", xKey: "HOLD_YEARS", xMin: 3, xMax: 7, xSteps: 5, yKey: null, yMin: null, yMax: null, ySteps: null });
  const oneAxis = await prisma.sensitivityAnalysis.findUnique({ where: { financingCaseId: seCase.id }, include: { cells: { orderBy: [{ yIndex: "asc" }, { xIndex: "asc" }] } } });
  assert(oneAxis.cells.length === 5 && oneAxis.cells.every((c) => c.yValue === null && c.yIndex === 0), "one-axis analysis: 5 cells, no Y value");
  assert(oneAxis.cells.filter((c) => c.isBaseline).length === 1 && oneAxis.cells.find((c) => c.isBaseline).xValue === 5, "one-axis baseline marked at the frozen hold (5 yrs)");

  // SE-6: a baseline that does NOT land on the axis is never snapped — no cell marked.
  await setSensitivityAnalysis(a.id, seCase.id, { targetMetric: "LEVERED_IRR_PCT", xKey: "EXIT_CAP_RATE_PCT", xMin: 6.5, xMax: 9.5, xSteps: 4, yKey: null, yMin: null, yMax: null, ySteps: null });
  const offGrid = await prisma.sensitivityAnalysis.findUnique({ where: { financingCaseId: seCase.id }, include: { cells: true } });
  assert(offGrid.cells.filter((c) => c.isBaseline).length === 0, "SE-6: an off-grid baseline (8% not among 6.5/7.5/8.5/9.5) marks NO cell");

  // Validation + lifecycle guards.
  await throws(() => setSensitivityAnalysis(a.id, seCase.id, { ...seSpec, xKey: "UNIT_COUNT" }), "an axis outside the allow-list is rejected");
  await setSensitivityAnalysis(a.id, seCase.id, null);
  assert((await prisma.sensitivityAnalysis.findUnique({ where: { financingCaseId: seCase.id } })) === null, "passing a null spec clears the analysis");
  // Re-establish a spec, then lock: sensitivity edits on a non-DRAFT scenario are rejected; the clone carries it.
  await setSensitivityAnalysis(a.id, seCase.id, seSpec);
  const seLocked = await lockScenario(a.id, se.id);
  await throws(() => setSensitivityAnalysis(a.id, seCase.id, seSpec), "editing a sensitivity analysis on a LOCKED scenario is rejected");
  const seV2 = await createNextVersion(a.id, seLocked.id);
  const seV2Active = await getActiveScenarioResult(a.id, seOpp.id);
  const seV2Case = seV2Active.financingCases[0];
  assert(seV2Active.id === seV2.id && seV2Case.sensitivity != null && seV2Case.sensitivity.cells.length === 15, "createNextVersion clones the sensitivity spec and rebuilds its 15 cells");
  assert(seV2Case.sensitivity.cells.filter((c) => c.isBaseline).length === 1, "the cloned grid re-marks its baseline cell");

  console.log("\n[15] Findings + suggested recommendation (3b-vi, FR-1…FR-6):");
  const rankOf = (s) => ({ CRITICAL: 0, WARNING: 1, INFO: 2 }[s]);
  const fProp = await createPropertyRecord(a.id, op({ name: "Findings", unitCount: UNIT_COUNT, estimatedValueUsd: 1_300_000 }), {});
  const fOpp = await mkOpp(a.id, fProp.id, "Findings deal");
  const fOperating = [
    { key: "PURCHASE_PRICE", value: 1_000_000 },
    { key: "GROSS_INCOME", value: 130_000 },
    { key: "OPERATING_EXPENSES", value: 30_000 },
    { key: "INCOME_GROWTH_PCT", value: 0 },
    { key: "EXPENSE_GROWTH_PCT", value: 0 },
    { key: "HOLD_YEARS", value: 5 },
    { key: "EXIT_CAP_RATE_PCT", value: 8 },
    { key: "SELLING_COSTS_PCT", value: 2 },
  ];
  // Primary "Conservative" is healthy (DSCR ~1.85); alt "Aggressive" is over-levered (DSCR <1).
  const fCases = [
    { label: "Conservative", capital: [{ key: "LOAN_AMOUNT", value: 750_000 }, { key: "INTEREST_RATE", value: 6 }, { key: "AMORTIZATION_YEARS", value: 30 }] },
    { label: "Aggressive", capital: [{ key: "LOAN_AMOUNT", value: 1_300_000 }, { key: "INTEREST_RATE", value: 8 }, { key: "AMORTIZATION_YEARS", value: 30 }] },
  ];
  await saveAnalyzerScenario(a.id, fOpp.id, fOperating, { financingCases: fCases });
  const fx = await getActiveScenarioResult(a.id, fOpp.id);
  const rec = fx.recommendation;
  const fcodes = fx.findings.map((f) => f.code);
  assert(rec != null && rec.level === "PROCEED", "healthy primary structure → suggested recommendation PROCEED");
  assert(rec.rulesetVersion === 2 && /^[0-9a-f]{32}$/.test(rec.findingsVersion), "recommendation carries ruleset 2 + a findings fingerprint");
  const dscrCrit = fx.findings.find((f) => f.code === "DSCR_BELOW_ONE");
  assert(dscrCrit != null && dscrCrit.decisive === false && dscrCrit.financingCaseId === fx.financingCases[1].id, "R-B: a CRITICAL on the NON-primary case is reported (cites the case) but is not decisive");
  assert(fx.findings.some((f) => f.code === "HEALTHY_DSCR" && f.decisive === true && f.financingCaseId === fx.financingCases[0].id), "the primary case's healthy DSCR is a decisive INFO signal");
  assert(fx.findings.every((f, i) => i === 0 || rankOf(fx.findings[i - 1].severity) <= rankOf(f.severity)), "findings ordered CRITICAL → WARNING → INFO");
  // FR-1: findings are derived from the settled results; the metrics themselves are untouched.
  assert(fx.result.noiAnnualUsd === 100_000 && fx.financingCases[0].result.dscr != null, "FR-1: findings never mutate the operating result or case metrics");

  // Reconstruction + zero-write idempotency (FR-3).
  const recXmin = async (sid) => (await prisma.$queryRaw`SELECT xmin::text AS xmin FROM scenario_recommendations WHERE "scenarioId" = ${sid}`)[0]?.xmin;
  await prisma.scenarioFinding.deleteMany({ where: { scenarioId: fx.id } });
  await prisma.scenarioRecommendation.delete({ where: { scenarioId: fx.id } });
  await rebuildFindings(a.id, fx.id);
  const fx2 = await getActiveScenarioResult(a.id, fOpp.id);
  assert(fx2.recommendation.level === "PROCEED" && fx2.findings.length === fx.findings.length && fx2.findings.map((f) => f.code).join() === fcodes.join(), "findings + recommendation reconstruct deterministically from the settled outputs");
  const fz = await recXmin(fx.id);
  await rebuildFindings(a.id, fx.id);
  assert((await recXmin(fx.id)) === fz, "FR-3: a no-op findings rebuild performs ZERO writes (xmin unchanged)");

  // An underwater, all-cash deal → PASS on a decisive operating finding.
  const pProp = await createPropertyRecord(a.id, op({ name: "Underwater", unitCount: UNIT_COUNT, estimatedValueUsd: 900_000 }), {});
  const pOpp = await mkOpp(a.id, pProp.id, "Underwater deal");
  await saveAnalyzerScenario(a.id, pOpp.id, [
    { key: "PURCHASE_PRICE", value: 1_000_000 },
    { key: "GROSS_INCOME", value: 130_000 },
    { key: "OPERATING_EXPENSES", value: 30_000 },
  ]);
  const px = await getActiveScenarioResult(a.id, pOpp.id);
  assert(px.recommendation.level === "PASS" && px.findings.some((f) => f.code === "NEGATIVE_SPREAD" && f.financingCaseId === null), "an underwater deal (estimated value < all-in cost) → PASS on a decisive operating NEGATIVE_SPREAD finding");

  console.log("\n[16] Decided recommendation + approval (3d, AP-1…AP-6):");
  const dProp = await createPropertyRecord(a.id, op({ name: "Decision", unitCount: UNIT_COUNT, estimatedValueUsd: 1_300_000 }), {});
  const dOpp = await mkOpp(a.id, dProp.id, "Decision deal");
  const { scenarioId: dScenarioId } = await saveAnalyzerScenario(a.id, dOpp.id, [
    { key: "PURCHASE_PRICE", value: 1_000_000 },
    { key: "GROSS_INCOME", value: 130_000 },
    { key: "OPERATING_EXPENSES", value: 30_000 },
  ], { financingCases: [{ label: "Base", capital: [{ key: "LOAN_AMOUNT", value: 750_000 }, { key: "INTEREST_RATE", value: 6 }, { key: "AMORTIZATION_YEARS", value: 30 }] }] });
  // AP-2: a decision may only be recorded on a LOCKED scenario.
  await throws(() => recordUnderwritingDecision(a.id, dScenarioId, { decision: "APPROVED", rationale: "too early", actorUserId: "user-approver" }), "AP-2: a decision on a DRAFT scenario is rejected");
  await lockScenario(a.id, dScenarioId);
  const beforeDec = await getActiveScenarioResult(a.id, dOpp.id); // settled outputs BEFORE any decision (AP-3 baseline)
  await throws(() => recordUnderwritingDecision(a.id, dScenarioId, { decision: "APPROVED", rationale: "   ", actorUserId: "user-approver" }), "a blank rationale is rejected");
  // Decision #1.
  const dec1 = await recordUnderwritingDecision(a.id, dScenarioId, { decision: "APPROVED", rationale: "Healthy DSCR and a strong spread.", actorUserId: "user-approver" });
  assert(dec1.sequence === 1 && dec1.decision === "APPROVED" && dec1.scenarioVersion === beforeDec.scenarioVersion, "AP-6: decision #1 snapshots the immutable scenarioVersion");
  assert(dec1.findingsVersion === beforeDec.recommendation.findingsVersion && dec1.suggestedLevel === beforeDec.recommendation.level, "the decision snapshots the findings fingerprint + engine suggestion it was made against");
  assert(dec1.actorUserId === "user-approver" && dec1.rationale.length > 0, "the decision records the actor + rationale (AP-1)");
  // AP-3: recording a decision changes NO deterministic output.
  const afterDec = await getActiveScenarioResult(a.id, dOpp.id);
  assert(afterDec.scenarioVersion === beforeDec.scenarioVersion && afterDec.result.noiAnnualUsd === beforeDec.result.noiAnnualUsd && afterDec.recommendation.findingsVersion === beforeDec.recommendation.findingsVersion && afterDec.findings.length === beforeDec.findings.length, "AP-3: a decision never alters metrics, findings, or the suggested recommendation");
  // Append-only supersession + immutability (AP-4).
  const decXmin = async (id) => (await prisma.$queryRaw`SELECT xmin::text AS xmin FROM underwriting_decisions WHERE id = ${id}`)[0]?.xmin;
  const z1 = await decXmin(dec1.id);
  const dec2 = await recordUnderwritingDecision(a.id, dScenarioId, { decision: "DECLINED", rationale: "Reconsidered — prefer to redeploy capital.", actorUserId: "user-approver" });
  assert(dec2.sequence === 2, "a superseding decision appends sequence 2");
  assert((await decXmin(dec1.id)) === z1, "AP-4: the prior decision row is immutable (xmin unchanged) — append-only, never mutated");
  assert((await prisma.underwritingDecision.count({ where: { scenarioId: dScenarioId } })) === 2, "both decisions are preserved (full audit history)");
  const withDec = await getActiveScenarioResult(a.id, dOpp.id);
  assert(withDec.decisions.length === 2 && withDec.decisions[0].decision === "DECLINED" && withDec.decisions[0].sequence === 2, "current decision = the highest sequence (DECLINED); history ordered desc");
  // AP-6 / AP-F: a new version carries NO decision.
  const dV2 = await createNextVersion(a.id, dScenarioId);
  assert((await prisma.underwritingDecision.count({ where: { scenarioId: dV2.id } })) === 0, "AP-6: decisions do NOT propagate to a new scenario version");
  assert((await prisma.underwritingDecision.count({ where: { scenarioId: dScenarioId } })) === 2, "the superseded scenario keeps its complete decision history");

  console.log("\n[17] Scenario comparison (3e — a read over independently-computed results, Principle 5):");
  const cProp = await createPropertyRecord(a.id, op({ name: "Compare", unitCount: UNIT_COUNT, estimatedValueUsd: 1_300_000 }), {});
  const cOpp = await mkOpp(a.id, cProp.id, "Compare deal");
  const { scenarioId: cV1 } = await saveAnalyzerScenario(a.id, cOpp.id, [
    { key: "PURCHASE_PRICE", value: 1_000_000 },
    { key: "GROSS_INCOME", value: 130_000 },
    { key: "OPERATING_EXPENSES", value: 30_000 },
  ], { financingCases: [{ label: "Base", capital: [{ key: "LOAN_AMOUNT", value: 750_000 }, { key: "INTEREST_RATE", value: 6 }, { key: "AMORTIZATION_YEARS", value: 30 }] }] });
  const v1Noi = (await getActiveScenarioResult(a.id, cOpp.id)).result.noiAnnualUsd;
  assert(v1Noi === 100_000, "v1 operating NOI = 100k");
  await lockScenario(a.id, cV1);
  const cV2 = await createNextVersion(a.id, cV1);
  // Change an input on v2 only.
  await saveAnalyzerScenario(a.id, cOpp.id, [
    { key: "PURCHASE_PRICE", value: 1_000_000 },
    { key: "GROSS_INCOME", value: 160_000 },
    { key: "OPERATING_EXPENSES", value: 30_000 },
  ]);
  const comp = await getScenarioComparison(a.id, cOpp.id);
  assert(comp.length === 2 && comp[0].version === 1 && comp[1].version === 2 && comp[1].id === cV2.id, "comparison lists both versions ordered by version");
  assert(comp[0].status === "SUPERSEDED" && comp[1].status === "DRAFT", "v1 is SUPERSEDED, v2 is the active DRAFT");
  assert(comp[0].result.noiAnnualUsd === 100_000 && comp[1].result.noiAnnualUsd === 130_000, "each version is computed independently from its own frozen assumptions (v1=100k, v2=130k)");
  assert(comp[0].result.noiAnnualUsd === v1Noi, "Principle 5: v1's metrics are unchanged by v2 — comparison never entangles them");
  assert(comp[0].financingCases.length === 1 && comp[1].financingCases.length === 1 && comp[1].financingCases[0].result != null, "each version surfaces its primary financing case + result");
  assert(comp[0].recommendation != null && comp[1].recommendation != null, "each version surfaces its own suggested recommendation");

  console.log("\n[18] Offer-memo generation (a Documents-owned generated artifact — OM-1…OM-12):");
  const mUser = await prisma.user.create({ data: { organizationId: a.id, name: "Gen User", email: `gen-${process.pid}@e2e.test`, hashedPassword: "x", role: "ANALYST" } });
  const mProp = await createPropertyRecord(a.id, op({ name: "Memo Tower", unitCount: 24, estimatedValueUsd: 1_300_000 }), {});
  const mOpp = await mkOpp(a.id, mProp.id, "Memo deal");
  const { scenarioId: mScn } = await saveAnalyzerScenario(a.id, mOpp.id, [
    { key: "PURCHASE_PRICE", value: 1_000_000 },
    { key: "GROSS_INCOME", value: 130_000 },
    { key: "OPERATING_EXPENSES", value: 30_000 },
    { key: "HOLD_YEARS", value: 5 },
    { key: "EXIT_CAP_RATE_PCT", value: 6.5 },
  ], { financingCases: [{ label: "Senior debt", capital: [{ key: "LOAN_AMOUNT", value: 750_000 }, { key: "INTEREST_RATE", value: 6 }, { key: "AMORTIZATION_YEARS", value: 30 }] }] });

  // OM-2 / OM-A: a DRAFT scenario cannot generate a memo (fail closed).
  await throws(() => getScenarioForMemo(a.id, mScn), "OM-2: getScenarioForMemo rejects a DRAFT scenario");
  await throws(() => generateOfferMemo(a.id, mScn, { id: "u", display: "U" }), "OM-2: generation is rejected on a DRAFT scenario");

  await lockScenario(a.id, mScn);
  const lockedScn = await prisma.underwritingScenario.findUnique({ where: { id: mScn } });

  // OM-3: generation must NOT recompute — the settled result is untouched (xmin stable).
  const beforeXmin = await xmin(mScn);
  const memo1 = await generateOfferMemo(a.id, mScn, { id: mUser.id, display: mUser.name });
  const doc1 = await prisma.document.findUnique({ where: { id: memo1.id } });
  memoKeys.push(doc1.storageKey);
  assert(await xmin(mScn) === beforeXmin, "OM-3: generation performs no calculation (scenario_results xmin unchanged)");

  // OM-1 / OM-7: an immutable GENERATED Document, sequence 1.
  assert(doc1.origin === "GENERATED" && doc1.documentType === "OFFER_MEMO", "OM-1: the memo is a GENERATED OFFER_MEMO document");
  assert(doc1.generationSequence === 1, "OM-7: the first memo is generation sequence 1");
  assert(doc1.mimeType === "text/html; charset=utf-8", "the memo is stored as self-contained HTML");

  // OM-4: the canonical snapshot holds the persisted values it was built from.
  const snap1 = doc1.contentSnapshot;
  assert(snap1.scenario.scenarioVersion === lockedScn.scenarioVersion, "OM-4: snapshot captures the exact scenarioVersion");
  assert(snap1.result.noiAnnualUsd === 100_000, "OM-4: snapshot NOI matches the persisted ScenarioResult (100k)");
  assert(snap1.primaryCase.result.leveredIrrPct != null, "OM-4: snapshot carries the primary case's settled returns");
  assert(doc1.scenarioVersionSnapshot === lockedScn.scenarioVersion, "OM-4: the row's scenarioVersion snapshot matches");

  // OM-5 / OM-6: version stamps + a SHA-256 that matches the stored bytes.
  assert(doc1.templateVersion === 1 && doc1.generatorVersion === 1 && doc1.snapshotSchemaVersion === 1, "OM-5: template/generator/schema versions recorded");
  const bytes1 = fs.readFileSync(absolutePathFor(doc1.storageKey));
  assert(shaOf(bytes1) === doc1.contentSha256, "OM-6: the stored file's SHA-256 matches the recorded hash");
  assert(bytes1.toString("utf-8").startsWith("<!doctype html>"), "the stored artifact is a complete HTML document");
  assert(!/https?:\/\//.test(bytes1.toString("utf-8")), "the stored artifact has no external URLs (self-contained)");

  // OM-J: no decision yet → the snapshot says so explicitly.
  assert(snap1.humanDecision === null && snap1.engineSuggestion != null, "OM-J: engine suggestion present, human decision null before any decision");

  // OM-8 (later decision): recording a decision does NOT alter the earlier memo.
  await recordUnderwritingDecision(a.id, mScn, { decision: "APPROVED", rationale: "Approved at committee", actorUserId: mUser.id });
  const doc1After = await prisma.document.findUnique({ where: { id: memo1.id } });
  assert(doc1After.contentSha256 === doc1.contentSha256, "OM-8: a later decision does not change the earlier memo (hash unchanged)");
  assert(doc1After.contentSnapshot.humanDecision === null, "OM-8: the earlier memo's snapshot still shows no decision");
  assert(shaOf(fs.readFileSync(absolutePathFor(doc1.storageKey))) === doc1.contentSha256, "OM-8: the earlier memo's stored bytes are unchanged");

  // OM-7: regeneration appends sequence 2 and now includes the decision.
  const memo2 = await generateOfferMemo(a.id, mScn, { id: mUser.id, display: mUser.name });
  const doc2 = await prisma.document.findUnique({ where: { id: memo2.id } });
  memoKeys.push(doc2.storageKey);
  assert(doc2.generationSequence === 2, "OM-7: regeneration appends generation sequence 2");
  assert(doc2.id !== doc1.id && doc2.storageKey !== doc1.storageKey, "OM-7: regeneration is a NEW row + NEW artifact, never an overwrite");
  assert(doc2.contentSnapshot.humanDecision?.level === "APPROVED", "OM-J: the new memo captures the current human decision");
  assert(doc2.decisionSequenceSnapshot === 1, "the new memo snapshots the decision sequence");
  assert(doc1.contentSnapshot.generatedBy.display === "Gen User", "the generator's display name is resolved into the snapshot");
  assert(doc2.contentSnapshot.humanDecision.actorDisplay === "Gen User", "the decision actor's display name is resolved into the snapshot");

  // OM-8 (later version): superseding the scenario does NOT alter an existing memo.
  await createNextVersion(a.id, mScn);
  const doc1Final = await prisma.document.findUnique({ where: { id: memo1.id } });
  assert(doc1Final.contentSha256 === doc1.contentSha256, "OM-8: creating a new scenario version leaves the earlier memo untouched");

  // OM-7: the append-only history lists both memos, newest first.
  const history = await listGeneratedMemos(a.id, mScn);
  assert(history.length === 2 && history[0].generationSequence === 2 && history[1].generationSequence === 1, "OM-7: memo history is append-only, newest first");

  // OM-12: cross-org access is rejected (org B cannot read or generate from org A's scenario).
  await throws(() => getScenarioForMemo(b.id, mScn), "OM-12: cross-org getScenarioForMemo is rejected");
  await throws(() => generateOfferMemo(b.id, mScn, { id: "x", display: "X" }), "OM-12: cross-org generation is rejected");
} finally {
  console.log("\nCleaning up throwaway orgs (cascade)...");
  for (const key of memoKeys) await removeFile(key).catch(() => {});
  for (const id of orgIds) await prisma.organization.delete({ where: { id } }).catch((e) => console.log(`  cleanup warn: ${e.message}`));
  await prisma.$disconnect();
}

function manualInputs(purchase) {
  return { purchasePriceUsd: purchase, renovationBudgetUsd: 50_000, closingCostsUsd: 25_000, grossIncomeAnnualUsd: 120_000, operatingExpensesUsd: 40_000, loanAmountUsd: null, interestRatePct: null, amortizationYears: null };
}

console.log(`\n${fail.length === 0 ? "PASS" : "FAIL"} — ${ok} assertions passed, ${fail.length} failed`);
if (fail.length) { for (const f of fail) console.log(`  - ${f}`); process.exit(1); }

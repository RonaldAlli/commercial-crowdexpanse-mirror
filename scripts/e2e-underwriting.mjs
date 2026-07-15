// Focused E2E for Commercial Underwriting (v1.3, Commit 3a). Runs against the
// *_test DB with throwaway orgs. Proves: the canonical Underwriting → Scenario →
// Assumption → ScenarioResult model; ScenarioResult == the unchanged kernel
// (behavior-preserving); the one-way ScenarioSeed snapshot (a Scenario never
// changes because the Property changes); deterministic + content-idempotent
// rebuild that NEVER reads current Property state; DRAFT/LOCKED/SUPERSEDED
// lifecycle + versioning; "every deterministic output belongs to exactly one
// Scenario"; the DealAnalysis backfill; and org scoping.
import { assertTestDatabase } from "./e2e-guard.mjs";

import { prisma } from "../lib/prisma.ts";
import { createPropertyRecord } from "../lib/properties.ts";
import { computeAnalysis } from "../lib/analysis.ts";
import { sizeDebt } from "../lib/underwriting/debt-sizing.ts";
import {
  saveAnalyzerScenario,
  rebuildScenarioResult,
  lockScenario,
  createNextVersion,
  setScenarioAssumptions,
  getActiveScenarioResult,
  resolveScenarioAssumptions,
  backfillUnderwritingFromDealAnalysis,
} from "../lib/underwriting.ts";

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

// The base deal (mirrors the analysis unit test). Manual = the 8 analyst inputs;
// UNIT_COUNT + ESTIMATED_VALUE come from the Property as SEEDED assumptions.
const MANUAL = [
  { key: "PURCHASE_PRICE", value: 1_000_000 },
  { key: "RENOVATION_BUDGET", value: 50_000 },
  { key: "CLOSING_COSTS", value: 25_000 },
  { key: "GROSS_INCOME", value: 120_000 },
  { key: "OPERATING_EXPENSES", value: 40_000 },
  { key: "LOAN_AMOUNT", value: 750_000 },
  { key: "INTEREST_RATE", value: 6 },
  { key: "AMORTIZATION_YEARS", value: 30 },
];
const UNIT_COUNT = 10;
const EST_VALUE = 1_200_000;
const expected = computeAnalysis({
  purchasePriceUsd: 1_000_000, renovationBudgetUsd: 50_000, closingCostsUsd: 25_000,
  grossIncomeAnnualUsd: 120_000, operatingExpensesUsd: 40_000, loanAmountUsd: 750_000,
  interestRatePct: 6, amortizationYears: 30, unitCount: UNIT_COUNT, estimatedValueUsd: EST_VALUE,
});

const xmin = async (sid) => (await prisma.$queryRaw`SELECT xmin::text AS xmin FROM scenario_results WHERE "scenarioId" = ${sid}`)[0]?.xmin;
const strip = (r) => { const { id, ...rest } = r; return JSON.stringify(rest); };
const mkOpp = (orgId, propertyId, title = "Deal") =>
  prisma.opportunity.create({ data: { organizationId: orgId, propertyId, title } });

const orgIds = [];
try {
  const a = await prisma.organization.create({ data: { name: TAG, slug: `${TAG}-${process.pid}-a` } });
  orgIds.push(a.id);
  const b = await prisma.organization.create({ data: { name: TAG, slug: `${TAG}-${process.pid}-b` } });
  orgIds.push(b.id);

  console.log("\n[1] Save → the ScenarioResult equals the unchanged kernel (behavior-preserving):");
  const prop = await createPropertyRecord(a.id, op({ unitCount: UNIT_COUNT, estimatedValueUsd: EST_VALUE }), {});
  const opp = await mkOpp(a.id, prop.id);
  const { scenarioId, result } = await saveAnalyzerScenario(a.id, opp.id, MANUAL);
  assert(result.allInCostUsd === expected.allInCostUsd && result.allInCostUsd === 1_075_000, "all-in cost matches the kernel");
  assert(result.noiAnnualUsd === expected.noiAnnualUsd && result.noiAnnualUsd === 80_000, "NOI matches the kernel");
  assert(result.capRate === expected.capRate && result.capRate === 8, "cap rate matches the kernel");
  assert(result.dscr === expected.dscr && result.pricePerUnitUsd === expected.pricePerUnitUsd, "dscr + price/unit match the kernel");
  assert(result.spreadUsd === expected.spreadUsd && result.spreadUsd === 125_000, "spread uses the SEEDED estimated value");
  assert(result.sizedLoanUsd === null && result.bindingConstraint === null, "no debt-sizing constraints ⇒ null sizing (3a behavior preserved)");

  console.log("\n[2] Assumption provenance — 8 MANUAL + 2 SEEDED, seeds carry field/asOf:");
  const rows = await resolveScenarioAssumptions(scenarioId);
  assert(rows.length === 10, "exactly 10 assumptions (8 manual + 2 seeded)");
  const seeded = await prisma.underwritingAssumption.findMany({ where: { scenarioId, source: "SEEDED" }, orderBy: { key: "asc" } });
  assert(seeded.length === 2 && seeded.every((s) => s.sourceField && s.sourceAsOf), "SEEDED assumptions carry sourceField + sourceAsOf");
  assert(seeded.find((s) => s.key === "ESTIMATED_VALUE").valueNumeric.toNumber() === EST_VALUE, "ESTIMATED_VALUE snapshotted from the property");

  console.log("\n[3] scenarioVersion is a stored, rebuildable fingerprint distinct per assumption set:");
  const sc1 = await prisma.underwritingScenario.findUnique({ where: { id: scenarioId } });
  assert(typeof sc1.scenarioVersion === "string" && sc1.scenarioVersion.length === 32, "scenario carries a 32-char scenarioVersion");
  assert(result.scenarioVersion === sc1.scenarioVersion, "the result reflects the scenario's current scenarioVersion (not stale)");
  assert(sc1.modelVersion === 2 && sc1.calcLibVersion === 2 && sc1.rulesetVersion === 1, "model lineage frozen on the scenario (3b-i bump)");

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
  assert((await resolveScenarioAssumptions(v2.id)).length === 10, "v2 cloned all 10 assumptions from the locked source");
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
  assert(migrated.result.capRate === legacyMetrics.capRate && migrated.result.noiAnnualUsd === legacyMetrics.noiAnnualUsd, "migrated result equals the kernel over the legacy inputs + property context");
  assert(migrated.analystSummary === "legacy note", "legacy analystSummary preserved onto the scenario");
  const r2 = await backfillUnderwritingFromDealAnalysis(a.id);
  assert(r2.created === 0 && r2.skipped === 1, "backfill is idempotent (second run skips the existing underwriting)");

  console.log("\n[9] Org scoping — org B sees none of org A's underwriting data:");
  assert((await prisma.underwriting.count({ where: { organizationId: b.id } })) === 0, "org B has no underwritings");
  assert((await prisma.scenarioResult.count({ where: { organizationId: b.id } })) === 0, "org B has no scenario results");
  await throws(() => saveAnalyzerScenario(b.id, opp.id, MANUAL), "org B cannot underwrite org A's opportunity (cross-org rejected)");

  console.log("\n[10] Debt sizing (3b-i) — deterministic sizing by LTV/LTC/DSCR, binding constraint, rebuilds:");
  const sp = await createPropertyRecord(a.id, op({ name: "Sizing", unitCount: UNIT_COUNT, estimatedValueUsd: 1_000_000 }), {});
  const sopp = await mkOpp(a.id, sp.id, "Sizing deal");
  const sizingManual = [
    ...MANUAL.filter((m) => m.key !== "GROSS_INCOME" && m.key !== "OPERATING_EXPENSES"),
    { key: "GROSS_INCOME", value: 130_000 },
    { key: "OPERATING_EXPENSES", value: 30_000 },
    { key: "TARGET_LTV_PCT", value: 75 },
    { key: "TARGET_LTC_PCT", value: 80 },
    { key: "MIN_DSCR", value: 1.25 },
  ];
  const sres = (await saveAnalyzerScenario(a.id, sopp.id, sizingManual)).result;
  // Cross-check against the pure kernel: NOI 100k, allInCost = 1.075M, estValue 1M (seeded).
  const km = computeAnalysis({ purchasePriceUsd: 1_000_000, renovationBudgetUsd: 50_000, closingCostsUsd: 25_000, grossIncomeAnnualUsd: 130_000, operatingExpensesUsd: 30_000, loanAmountUsd: 750_000, interestRatePct: 6, amortizationYears: 30, unitCount: UNIT_COUNT, estimatedValueUsd: 1_000_000 });
  const expSizing = sizeDebt({ estimatedValueUsd: 1_000_000, allInCostUsd: km.allInCostUsd, noiAnnualUsd: km.noiAnnualUsd, interestRatePct: 6, amortizationYears: 30, targetLtvPct: 75, targetLtcPct: 80, minDscr: 1.25 });
  assert(sres.loanByLtvUsd === 750_000, "loan by LTV = 75% of estimated value (1M) = 750k");
  assert(sres.loanByLtcUsd === expSizing.loanByLtcUsd && sres.loanByLtcUsd === 860_000, "loan by LTC = 80% of all-in cost (1.075M) = 860k");
  assert(sres.loanByDscrUsd === expSizing.loanByDscrUsd, "loan by DSCR matches the pure sizing module");
  assert(sres.sizedLoanUsd === 750_000 && sres.bindingConstraint === "LTV", "sized loan = min = LTV-bound 750k");
  // Rebuild is deterministic for the sized result too (reads only frozen assumptions).
  await prisma.scenarioResult.delete({ where: { scenarioId: sres.scenarioId } });
  await rebuildScenarioResult(a.id, sres.scenarioId);
  const sAfter = await prisma.scenarioResult.findUnique({ where: { scenarioId: sres.scenarioId } });
  assert(sAfter.sizedLoanUsd === 750_000 && sAfter.bindingConstraint === "LTV", "sized result reconstructs deterministically from frozen assumptions");
} finally {
  console.log("\nCleaning up throwaway orgs (cascade)...");
  for (const id of orgIds) await prisma.organization.delete({ where: { id } }).catch((e) => console.log(`  cleanup warn: ${e.message}`));
  await prisma.$disconnect();
}

function manualInputs(purchase) {
  return { purchasePriceUsd: purchase, renovationBudgetUsd: 50_000, closingCostsUsd: 25_000, grossIncomeAnnualUsd: 120_000, operatingExpensesUsd: 40_000, loanAmountUsd: 750_000, interestRatePct: 6, amortizationYears: 30 };
}

console.log(`\n${fail.length === 0 ? "PASS" : "FAIL"} — ${ok} assertions passed, ${fail.length} failed`);
if (fail.length) { for (const f of fail) console.log(`  - ${f}`); process.exit(1); }

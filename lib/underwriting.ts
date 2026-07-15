// Commercial Underwriting (v1.3, Commit 3a) — the DB orchestration for the
// canonical underwriting model. This layer OWNS the Decimal↔number boundary
// (D-6), the DRAFT/LOCKED/SUPERSEDED lifecycle (D-4), the one-way ScenarioSeed
// snapshot from the Version 1.2 platform, and the content-idempotent, rebuildable
// ScenarioResult. It never writes to any 1.2 layer (UW-1) — it only READS the
// Property once, at scenario creation, and freezes the values as SEEDED
// assumptions. All financial math is delegated unchanged to lib/analysis.ts.
//
// Invariants honored here:
//   • Every deterministic output (metrics/scenarioVersion) belongs to exactly one
//     Scenario — ScenarioResult is 1:1 with a Scenario; there are no free metrics.
//   • A Scenario never changes because the underlying Property changes — SEEDED
//     assumptions are snapshotted ONCE and never re-read.
//   • ScenarioResult rebuild reads ONLY frozen assumptions + model lineage + the
//     pure kernel — never current Property projections.
import { Prisma } from "@prisma/client";
import type { AssumptionSource, LineItemKind } from "@prisma/client";

import { prisma } from "@/lib/prisma";
import {
  type AssumptionKey,
  type ResolvedAssumption,
  assumptionValue,
  CAPITAL_ASSUMPTION_KEYS,
  validateAssumptions,
} from "@/lib/underwriting/assumptions";
import { deriveFinancingCase } from "@/lib/underwriting/financing";
import {
  CURRENT_MODEL_LINEAGE,
  computeFinancingCaseVersion,
  computeScenarioVersion,
  type FingerprintAssumption,
  type FingerprintLine,
  type ModelLineage,
} from "@/lib/underwriting/model-version";
import { deriveScenarioResult } from "@/lib/underwriting/scenario-result";
import type { ResolvedLine } from "@/lib/underwriting/schedule";

type Db = Prisma.TransactionClient | typeof prisma;

/** One assumption to write. A null value REMOVES the key (maps to null in the kernel). */
export type AssumptionEntry = {
  key: AssumptionKey;
  value: number | null;
  source: AssumptionSource;
  sourceField?: string | null;
  sourceAsOf?: Date | null;
};

// --- pure-ish helpers ---------------------------------------------------------

/** Read a scenario's assumptions and resolve them to the calculation boundary. */
export async function resolveScenarioAssumptions(scenarioId: string, db: Db = prisma): Promise<ResolvedAssumption[]> {
  const rows = await db.underwritingAssumption.findMany({ where: { scenarioId }, orderBy: { key: "asc" } });
  return rows.map((r) => ({
    key: r.key as AssumptionKey,
    value: r.valueNumeric.toNumber(),
    source: r.source,
    // Decimal.js normalizes (strips trailing zeros), so numerically-equal values
    // canonicalize identically regardless of the DB column scale.
    canonical: r.valueNumeric.toString(),
  }));
}

function lineageOf(s: { modelVersion: number; calcLibVersion: number; rulesetVersion: number }): ModelLineage {
  return { modelVersion: s.modelVersion, calcLibVersion: s.calcLibVersion, rulesetVersion: s.rulesetVersion };
}

/** Read a scenario's schedule line items and resolve them to the calculation boundary. */
export async function resolveScenarioLines(scenarioId: string, db: Db = prisma): Promise<ResolvedLine[]> {
  const rows = await db.scenarioLineItem.findMany({ where: { scenarioId }, orderBy: { position: "asc" } });
  return rows.map((r) => ({
    kind: r.kind,
    category: r.category,
    amountAnnualUsd: r.amountAnnualUsd.toNumber(),
    position: r.position,
    canonical: r.amountAnnualUsd.toString(),
  }));
}

function toFingerprintLines(lines: ResolvedLine[]): FingerprintLine[] {
  return lines.map((l) => ({ kind: l.kind, category: l.category, canonical: l.canonical }));
}

/** Recompute + persist scenario.scenarioVersion from its assumptions + line items (zero-write if unchanged). */
async function refreshScenarioVersion(organizationId: string, scenarioId: string, db: Db): Promise<string> {
  const assumptions = await resolveScenarioAssumptions(scenarioId, db);
  const lines = await resolveScenarioLines(scenarioId, db);
  const scenario = await db.underwritingScenario.findFirstOrThrow({ where: { id: scenarioId, organizationId } });
  const scenarioVersion = computeScenarioVersion(assumptions, lineageOf(scenario), toFingerprintLines(lines));
  if (scenario.scenarioVersion !== scenarioVersion) {
    await db.underwritingScenario.update({ where: { id: scenarioId }, data: { scenarioVersion } });
  }
  return scenarioVersion;
}

// OPERATING-ONLY as of 3b-iii (CF-2): every financing-dependent metric moved to
// FinancingCaseResult. A Scenario's result carries no debt economics.
const RESULT_METRIC_KEYS = [
  // Effective schedule totals (3b-ii)
  "grossIncomeAnnualUsd",
  "operatingExpensesUsd",
  "noiAnnualUsd",
  "allInCostUsd",
  "capRate",
  "pricePerUnitUsd",
  "expenseRatioPct",
  "spreadUsd",
] as const;

/**
 * Rebuild a scenario's ScenarioResult PURELY from its frozen assumptions + model
 * lineage (never from current Property state). Content-idempotent: a rebuild with
 * unchanged derived content performs ZERO writes.
 */
export async function rebuildScenarioResult(organizationId: string, scenarioId: string, db: Db = prisma) {
  const assumptions = await resolveScenarioAssumptions(scenarioId, db);
  const invalid = validateAssumptions(assumptions);
  if (invalid) throw new Error(`Cannot derive ScenarioResult: ${invalid}`);
  const lines = await resolveScenarioLines(scenarioId, db);
  const scenario = await db.underwritingScenario.findFirstOrThrow({ where: { id: scenarioId, organizationId } });
  const { scenarioVersion, metrics, effective } = deriveScenarioResult(assumptions, lines, lineageOf(scenario));

  const values = {
    scenarioVersion,
    calcLibVersion: scenario.calcLibVersion,
    grossIncomeAnnualUsd: effective.grossIncomeAnnualUsd,
    operatingExpensesUsd: effective.operatingExpensesUsd,
    ...pickMetrics(metrics),
  };
  const existing = await db.scenarioResult.findUnique({ where: { scenarioId } });
  const unchanged =
    existing != null &&
    existing.scenarioVersion === values.scenarioVersion &&
    existing.calcLibVersion === values.calcLibVersion &&
    RESULT_METRIC_KEYS.every((k) => existing[k] === (values as Record<string, unknown>)[k]);
  if (unchanged) return existing; // zero-write idempotent rebuild

  return db.scenarioResult.upsert({
    where: { scenarioId },
    create: { organizationId, scenarioId, ...values },
    update: { organizationId, ...values },
  });
}

function pickMetrics(m: import("@/lib/analysis").AnalysisMetrics) {
  // Operating-only (CF-2): debt service / DSCR / debt yield belong to the FinancingCase.
  return {
    noiAnnualUsd: m.noiAnnualUsd,
    allInCostUsd: m.allInCostUsd,
    capRate: m.capRate,
    pricePerUnitUsd: m.pricePerUnitUsd,
    expenseRatioPct: m.expenseRatioPct,
    spreadUsd: m.spreadUsd,
  };
}

// --- assumption writes --------------------------------------------------------

/** Upsert/remove assumption rows on a DRAFT scenario, then refresh its fingerprint. */
export async function setScenarioAssumptions(
  organizationId: string,
  scenarioId: string,
  entries: AssumptionEntry[],
  db: Db = prisma,
): Promise<void> {
  const scenario = await db.underwritingScenario.findFirstOrThrow({ where: { id: scenarioId, organizationId } });
  if (scenario.status !== "DRAFT") throw new Error("Cannot modify assumptions on a non-DRAFT scenario");

  for (const e of entries) {
    if (e.value == null) {
      await db.underwritingAssumption.deleteMany({ where: { scenarioId, key: e.key } });
      continue;
    }
    const data = {
      valueNumeric: new Prisma.Decimal(e.value),
      source: e.source,
      sourceField: e.sourceField ?? null,
      sourceAsOf: e.sourceAsOf ?? null,
    };
    await db.underwritingAssumption.upsert({
      where: { scenarioId_key: { scenarioId, key: e.key } },
      create: { organizationId, scenarioId, key: e.key, ...data },
      update: data,
    });
  }
  await refreshScenarioVersion(organizationId, scenarioId, db);
}

/** One schedule line to write. */
export type LineItemEntry = { kind: LineItemKind; category: string; amountAnnualUsd: number; source?: AssumptionSource };

/**
 * Replace a DRAFT scenario's entire schedule with the given line items (in order),
 * then refresh its fingerprint. Replace-whole (not per-row upsert) keeps the schedule
 * a clean deterministic set — position is the array index.
 */
export async function setScenarioLineItems(
  organizationId: string,
  scenarioId: string,
  lines: LineItemEntry[],
  db: Db = prisma,
): Promise<void> {
  const scenario = await db.underwritingScenario.findFirstOrThrow({ where: { id: scenarioId, organizationId } });
  if (scenario.status !== "DRAFT") throw new Error("Cannot modify the schedule on a non-DRAFT scenario");

  await db.scenarioLineItem.deleteMany({ where: { scenarioId } });
  for (let i = 0; i < lines.length; i++) {
    const l = lines[i];
    await db.scenarioLineItem.create({
      data: {
        organizationId,
        scenarioId,
        kind: l.kind,
        category: l.category,
        amountAnnualUsd: new Prisma.Decimal(l.amountAnnualUsd),
        position: i,
        source: l.source ?? "MANUAL",
      },
    });
  }
  await refreshScenarioVersion(organizationId, scenarioId, db);
}

// --- financing cases (v1.3, Commit 3b-iii) ------------------------------------

/** Read a FinancingCase's capital assumptions, resolved to the calculation boundary. */
async function resolveFinancingCapital(financingCaseId: string, db: Db = prisma): Promise<ResolvedAssumption[]> {
  const rows = await db.financingAssumption.findMany({ where: { financingCaseId }, orderBy: { key: "asc" } });
  return rows.map((r) => ({
    key: r.key as AssumptionKey,
    value: r.valueNumeric.toNumber(),
    source: r.source,
    canonical: r.valueNumeric.toString(),
  }));
}

const FCR_METRIC_KEYS = [
  "annualDebtServiceUsd",
  "dscr",
  "debtYieldPct",
  "loanByLtvUsd",
  "loanByLtcUsd",
  "loanByDscrUsd",
  "sizedLoanUsd",
  "bindingConstraint",
  "projectionYears",
  "avgDscr",
  "cumulativeCashFlowUsd",
  // Exit + returns (3b-iv)
  "terminalNoiUsd",
  "exitCapRatePct",
  "sellingCostsPct",
  "grossExitValueUsd",
  "sellingCostsUsd",
  "debtPayoffUsd",
  "netSaleProceedsUsd",
  "contributedEquityUsd",
  "equityMultiple",
  "leveredIrrPct",
  "totalProfitUsd",
] as const;

/**
 * Rebuild ONE FinancingCase's derived state (CF-3): its fingerprint, its result,
 * and its multi-year cash flow — PURELY from the Scenario's frozen operating
 * economics + the case's own capital + model lineage (never current Property,
 * never another case). Content-idempotent: an unchanged rebuild performs zero
 * writes to the result and to the cash-flow rows.
 */
export async function rebuildFinancingCase(organizationId: string, financingCaseId: string, db: Db = prisma) {
  const fc = await db.financingCase.findFirstOrThrow({
    where: { id: financingCaseId, organizationId },
    include: { scenario: true },
  });
  const scenario = fc.scenario;

  // Operating economics (frozen) — derived exactly as the ScenarioResult is (CF-5).
  const assumptions = await resolveScenarioAssumptions(scenario.id, db);
  const lines = await resolveScenarioLines(scenario.id, db);
  const { scenarioVersion, inputs } = deriveScenarioResult(assumptions, lines, lineageOf(scenario));

  // Capital economics (owned by the case, CF-1).
  const capital = await resolveFinancingCapital(financingCaseId, db);
  const cap = (k: AssumptionKey) => assumptionValue(capital, k);
  const derived = deriveFinancingCase({
    operatingInputs: inputs,
    incomeGrowthPct: assumptionValue(assumptions, "INCOME_GROWTH_PCT"),
    expenseGrowthPct: assumptionValue(assumptions, "EXPENSE_GROWTH_PCT"),
    holdYears: assumptionValue(assumptions, "HOLD_YEARS"),
    exitCapRatePct: assumptionValue(assumptions, "EXIT_CAP_RATE_PCT"),
    sellingCostsPct: assumptionValue(assumptions, "SELLING_COSTS_PCT"),
    loanAmountUsd: cap("LOAN_AMOUNT"),
    interestRatePct: cap("INTEREST_RATE"),
    amortizationYears: cap("AMORTIZATION_YEARS"),
    targetLtvPct: cap("TARGET_LTV_PCT"),
    targetLtcPct: cap("TARGET_LTC_PCT"),
    minDscr: cap("MIN_DSCR"),
  });

  const fpCapital: FingerprintAssumption[] = capital.map((c) => ({ key: c.key, canonical: c.canonical, source: c.source }));
  const financingCaseVersion = computeFinancingCaseVersion(scenarioVersion, fpCapital, lineageOf(scenario));
  if (fc.financingCaseVersion !== financingCaseVersion) {
    await db.financingCase.update({ where: { id: financingCaseId }, data: { financingCaseVersion } });
  }

  const values = {
    financingCaseVersion,
    calcLibVersion: scenario.calcLibVersion,
    annualDebtServiceUsd: derived.annualDebtServiceUsd,
    dscr: derived.dscr,
    debtYieldPct: derived.debtYieldPct,
    loanByLtvUsd: derived.sizing.loanByLtvUsd,
    loanByLtcUsd: derived.sizing.loanByLtcUsd,
    loanByDscrUsd: derived.sizing.loanByDscrUsd,
    sizedLoanUsd: derived.sizing.sizedLoanUsd,
    bindingConstraint: derived.sizing.bindingConstraint,
    projectionYears: derived.summary.projectionYears > 0 ? derived.summary.projectionYears : null,
    avgDscr: derived.summary.avgDscr,
    cumulativeCashFlowUsd: derived.summary.cumulativeCashFlowUsd,
    // Exit + returns (3b-iv) — all null when no exit is modeled.
    terminalNoiUsd: derived.exit?.terminalNoiUsd ?? null,
    exitCapRatePct: derived.exit?.exitCapRatePct ?? null,
    sellingCostsPct: derived.exit?.sellingCostsPct ?? null,
    grossExitValueUsd: derived.exit?.grossExitValueUsd ?? null,
    sellingCostsUsd: derived.exit?.sellingCostsUsd ?? null,
    debtPayoffUsd: derived.exit?.debtPayoffUsd ?? null,
    netSaleProceedsUsd: derived.exit?.netSaleProceedsUsd ?? null,
    contributedEquityUsd: derived.exit?.contributedEquityUsd ?? null,
    equityMultiple: derived.exit?.equityMultiple ?? null,
    leveredIrrPct: derived.exit?.leveredIrrPct ?? null,
    totalProfitUsd: derived.exit?.totalProfitUsd ?? null,
  };

  // Content-idempotent result upsert.
  const existing = await db.financingCaseResult.findUnique({ where: { financingCaseId } });
  const resultUnchanged =
    existing != null &&
    existing.financingCaseVersion === values.financingCaseVersion &&
    existing.calcLibVersion === values.calcLibVersion &&
    FCR_METRIC_KEYS.every((k) => existing[k] === (values as Record<string, unknown>)[k]);
  if (!resultUnchanged) {
    await db.financingCaseResult.upsert({
      where: { financingCaseId },
      create: { organizationId, financingCaseId, ...values },
      update: { organizationId, ...values },
    });
  }

  // Cash-flow rows: disposable + rebuildable. Compare to avoid churn (zero-write
  // when unchanged), else replace the whole series in deterministic year order.
  const existingRows = await db.cashFlowYear.findMany({ where: { financingCaseId }, orderBy: { year: "asc" } });
  const cfUnchanged =
    existingRows.length === derived.cashFlow.length &&
    derived.cashFlow.every((r, idx) => {
      const e = existingRows[idx];
      return (
        e != null &&
        e.year === r.year &&
        e.noiUsd === r.noiUsd &&
        e.debtServiceUsd === r.debtServiceUsd &&
        e.cashFlowBeforeTaxUsd === r.cashFlowBeforeTaxUsd &&
        e.dscr === r.dscr
      );
    });
  if (!cfUnchanged) {
    await db.cashFlowYear.deleteMany({ where: { financingCaseId } });
    for (const r of derived.cashFlow) {
      await db.cashFlowYear.create({
        data: {
          organizationId,
          financingCaseId,
          year: r.year,
          noiUsd: r.noiUsd,
          debtServiceUsd: r.debtServiceUsd,
          cashFlowBeforeTaxUsd: r.cashFlowBeforeTaxUsd,
          dscr: r.dscr,
        },
      });
    }
  }

  // Equity cash-flow series (3b-iv): disposable + rebuildable like the cash flow.
  // Year index = array position (0 = the negative equity contribution). Empty when
  // no exit is modeled. Zero-write when unchanged.
  const equitySeries = derived.exit?.equityCashFlow ?? [];
  const existingEquity = await db.equityCashFlowYear.findMany({ where: { financingCaseId }, orderBy: { year: "asc" } });
  const equityUnchanged =
    existingEquity.length === equitySeries.length &&
    equitySeries.every((v, idx) => existingEquity[idx] != null && existingEquity[idx].year === idx && existingEquity[idx].equityCashFlowUsd === v);
  if (!equityUnchanged) {
    await db.equityCashFlowYear.deleteMany({ where: { financingCaseId } });
    for (let year = 0; year < equitySeries.length; year++) {
      await db.equityCashFlowYear.create({
        data: { organizationId, financingCaseId, year, equityCashFlowUsd: equitySeries[year] },
      });
    }
  }

  return db.financingCaseResult.findUnique({ where: { financingCaseId } });
}

/** Rebuild every FinancingCase under a scenario (after the operating side changes). */
async function rebuildAllFinancingCases(organizationId: string, scenarioId: string, db: Db): Promise<void> {
  const cases = await db.financingCase.findMany({ where: { scenarioId }, orderBy: { position: "asc" } });
  for (const fc of cases) await rebuildFinancingCase(organizationId, fc.id, db);
}

/** One capital structure to write. */
export type FinancingCaseEntry = { label: string; source?: AssumptionSource; capital: { key: AssumptionKey; value: number | null }[] };

/**
 * Replace a DRAFT scenario's entire set of financing cases (in order), then rebuild
 * each. Replace-whole (cascade drops each case's capital/result/cash-flow) keeps the
 * set a clean deterministic list — position is the array index. Only CAPITAL keys
 * are accepted (CF-1); anything else is ignored.
 */
export async function setFinancingCases(
  organizationId: string,
  scenarioId: string,
  cases: FinancingCaseEntry[],
  db: Db = prisma,
): Promise<void> {
  const scenario = await db.underwritingScenario.findFirstOrThrow({ where: { id: scenarioId, organizationId } });
  if (scenario.status !== "DRAFT") throw new Error("Cannot modify financing cases on a non-DRAFT scenario");

  await db.financingCase.deleteMany({ where: { scenarioId } });
  for (let i = 0; i < cases.length; i++) {
    const c = cases[i];
    const fc = await db.financingCase.create({
      data: { organizationId, scenarioId, label: c.label, position: i, source: c.source ?? "MANUAL", financingCaseVersion: "" },
    });
    for (const cap of c.capital) {
      if (cap.value == null || !CAPITAL_ASSUMPTION_KEYS.includes(cap.key)) continue;
      await db.financingAssumption.create({
        data: { organizationId, financingCaseId: fc.id, key: cap.key, valueNumeric: new Prisma.Decimal(cap.value), source: c.source ?? "MANUAL" },
      });
    }
  }
  await rebuildAllFinancingCases(organizationId, scenarioId, db);
}

/** Read the Property context ONCE and freeze it as SEEDED assumptions (ScenarioSeed). */
async function seedScenarioFromProperty(
  organizationId: string,
  scenarioId: string,
  propertyId: string,
  asOf: Date,
  db: Db,
): Promise<void> {
  const property = await db.property.findFirst({
    where: { id: propertyId, organizationId },
    select: { unitCount: true, estimatedValueUsd: true },
  });
  const seeds: AssumptionEntry[] = [
    { key: "UNIT_COUNT", value: property?.unitCount ?? null, source: "SEEDED", sourceField: "unitCount", sourceAsOf: asOf },
    { key: "ESTIMATED_VALUE", value: property?.estimatedValueUsd ?? null, source: "SEEDED", sourceField: "estimatedValueUsd", sourceAsOf: asOf },
  ];
  await setScenarioAssumptions(organizationId, scenarioId, seeds, db);
}

// --- lifecycle ----------------------------------------------------------------

/** Ensure an Underwriting exists for an opportunity (anchored on the Opportunity, U-G). */
export async function getOrCreateUnderwriting(
  organizationId: string,
  opportunityId: string,
  db: Db = prisma,
  createdByUserId?: string,
) {
  // Org-scoped: opportunityId is globally unique, so a bare findUnique would return
  // ANOTHER org's underwriting. Scope by organizationId; if none here, the
  // opportunity lookup below (also org-scoped) rejects cross-org access.
  const existing = await db.underwriting.findFirst({ where: { opportunityId, organizationId } });
  if (existing) return existing;
  const opp = await db.opportunity.findFirstOrThrow({
    where: { id: opportunityId, organizationId },
    select: { propertyId: true },
  });
  return db.underwriting.create({
    data: { organizationId, opportunityId, propertyId: opp.propertyId, createdByUserId: createdByUserId ?? null },
  });
}

async function getOrCreateActiveScenarioTx(
  organizationId: string,
  opportunityId: string,
  db: Db,
  opts: { createdByUserId?: string },
) {
  const uw = await getOrCreateUnderwriting(organizationId, opportunityId, db, opts.createdByUserId);
  if (uw.activeScenarioId) {
    const active = await db.underwritingScenario.findFirst({
      where: { id: uw.activeScenarioId, organizationId, status: "DRAFT" },
    });
    if (active) return active;
  }
  const max = await db.underwritingScenario.aggregate({ where: { underwritingId: uw.id }, _max: { version: true } });
  const version = (max._max.version ?? 0) + 1;
  const scenario = await db.underwritingScenario.create({
    data: {
      organizationId,
      underwritingId: uw.id,
      label: `Scenario ${version}`,
      version,
      status: "DRAFT",
      ...CURRENT_MODEL_LINEAGE,
      scenarioVersion: "",
      createdByUserId: opts.createdByUserId ?? null,
    },
  });
  // ScenarioSeed: one-way snapshot of Property context at creation. `asOf` is an
  // operational provenance marker (not part of the deterministic fingerprint).
  await seedScenarioFromProperty(organizationId, scenario.id, uw.propertyId, new Date(), db);
  await db.underwriting.update({ where: { id: uw.id }, data: { activeScenarioId: scenario.id } });
  return db.underwritingScenario.findFirstOrThrow({ where: { id: scenario.id } });
}

/**
 * The analyzer entrypoint: ensure the opportunity's active DRAFT scenario (seeding
 * it from the Property on first creation), write the analyst's MANUAL assumptions,
 * and rebuild the result — all in one transaction. Behavior-preserving: the same
 * inputs yield the same metrics as the legacy analyzer (identical kernel).
 */
export async function saveAnalyzerScenario(
  organizationId: string,
  opportunityId: string,
  manual: { key: AssumptionKey; value: number | null }[],
  opts: { createdByUserId?: string; analystSummary?: string | null; lines?: LineItemEntry[]; financingCases?: FinancingCaseEntry[] } = {},
) {
  return prisma.$transaction(async (tx) => {
    const scenario = await getOrCreateActiveScenarioTx(organizationId, opportunityId, tx, opts);
    await setScenarioAssumptions(
      organizationId,
      scenario.id,
      manual.map((m) => ({ key: m.key, value: m.value, source: "MANUAL" as AssumptionSource })),
      tx,
    );
    if (opts.lines !== undefined) {
      await setScenarioLineItems(organizationId, scenario.id, opts.lines, tx);
    }
    if (opts.analystSummary !== undefined) {
      await tx.underwritingScenario.update({
        where: { id: scenario.id },
        data: { analystSummary: opts.analystSummary },
      });
    }
    const result = await rebuildScenarioResult(organizationId, scenario.id, tx);
    // Financing cases consume the (now rebuilt) operating economics (CF-4/CF-5).
    // A provided list replaces the set; otherwise refresh existing cases against
    // the operating change.
    if (opts.financingCases !== undefined) {
      await setFinancingCases(organizationId, scenario.id, opts.financingCases, tx);
    } else {
      await rebuildAllFinancingCases(organizationId, scenario.id, tx);
    }
    // Re-affirm the active head — idempotent in value, but bumps Underwriting.updatedAt
    // each save so "latest underwriting" ordering (dashboard) tracks analyst activity.
    await tx.underwriting.update({ where: { opportunityId }, data: { activeScenarioId: scenario.id } });
    return { scenarioId: scenario.id, result };
  });
}

/** Read the active scenario + its result for display (or null if none yet). */
export async function getActiveScenarioResult(organizationId: string, opportunityId: string) {
  const uw = await prisma.underwriting.findUnique({ where: { opportunityId } });
  if (!uw || uw.organizationId !== organizationId || !uw.activeScenarioId) return null;
  const scenario = await prisma.underwritingScenario.findFirst({
    where: { id: uw.activeScenarioId, organizationId },
    include: {
      result: true,
      assumptions: true,
      lineItems: { orderBy: { position: "asc" } },
      financingCases: {
        orderBy: { position: "asc" },
        include: {
          result: true,
          capitalAssumptions: true,
          cashFlow: { orderBy: { year: "asc" } },
          equityCashFlow: { orderBy: { year: "asc" } },
        },
      },
    },
  });
  return scenario;
}

/** DRAFT → LOCKED: freeze the scenario after ensuring its fingerprint + result are current. */
export async function lockScenario(organizationId: string, scenarioId: string, opts: { actorUserId?: string } = {}) {
  return prisma.$transaction(async (tx) => {
    const scenario = await tx.underwritingScenario.findFirstOrThrow({ where: { id: scenarioId, organizationId } });
    if (scenario.status !== "DRAFT") throw new Error("Only a DRAFT scenario can be locked");
    const assumptions = await resolveScenarioAssumptions(scenarioId, tx);
    const invalid = validateAssumptions(assumptions);
    if (invalid) throw new Error(`Cannot lock scenario: ${invalid}`);
    await refreshScenarioVersion(organizationId, scenarioId, tx);
    await rebuildScenarioResult(organizationId, scenarioId, tx);
    await rebuildAllFinancingCases(organizationId, scenarioId, tx);
    void opts.actorUserId;
    return tx.underwritingScenario.update({
      where: { id: scenarioId },
      data: { status: "LOCKED", lockedAt: new Date() },
    });
  });
}

/**
 * Branch a LOCKED scenario into a new DRAFT version: clone its assumptions (the
 * source is preserved, never edited), mark the source SUPERSEDED, and make the new
 * DRAFT the active head. The new version adopts the CURRENT model lineage, so an
 * identical assumption set under a bumped model still gets a distinct fingerprint.
 */
export async function createNextVersion(organizationId: string, scenarioId: string, opts: { actorUserId?: string } = {}) {
  return prisma.$transaction(async (tx) => {
    const source = await tx.underwritingScenario.findFirstOrThrow({
      where: { id: scenarioId, organizationId },
      include: {
        assumptions: true,
        lineItems: { orderBy: { position: "asc" } },
        financingCases: { orderBy: { position: "asc" }, include: { capitalAssumptions: true } },
      },
    });
    if (source.status !== "LOCKED") throw new Error("Only a LOCKED scenario can be branched into a new version");
    const max = await tx.underwritingScenario.aggregate({
      where: { underwritingId: source.underwritingId },
      _max: { version: true },
    });
    const version = (max._max.version ?? 0) + 1;
    const next = await tx.underwritingScenario.create({
      data: {
        organizationId,
        underwritingId: source.underwritingId,
        label: `Scenario ${version}`,
        version,
        status: "DRAFT",
        ...CURRENT_MODEL_LINEAGE,
        scenarioVersion: "",
        createdByUserId: opts.actorUserId ?? null,
      },
    });
    for (const a of source.assumptions) {
      await tx.underwritingAssumption.create({
        data: {
          organizationId,
          scenarioId: next.id,
          key: a.key,
          valueNumeric: a.valueNumeric,
          source: a.source,
          sourceField: a.sourceField,
          sourceAsOf: a.sourceAsOf,
        },
      });
    }
    for (const l of source.lineItems) {
      await tx.scenarioLineItem.create({
        data: {
          organizationId,
          scenarioId: next.id,
          kind: l.kind,
          category: l.category,
          amountAnnualUsd: l.amountAnnualUsd,
          position: l.position,
          source: l.source,
        },
      });
    }
    // Clone financing cases + their capital (the source is preserved, never edited).
    for (const fc of source.financingCases) {
      const nfc = await tx.financingCase.create({
        data: { organizationId, scenarioId: next.id, label: fc.label, position: fc.position, source: fc.source, financingCaseVersion: "" },
      });
      for (const cap of fc.capitalAssumptions) {
        await tx.financingAssumption.create({
          data: {
            organizationId,
            financingCaseId: nfc.id,
            key: cap.key,
            valueNumeric: cap.valueNumeric,
            source: cap.source,
            sourceField: cap.sourceField,
            sourceAsOf: cap.sourceAsOf,
          },
        });
      }
    }
    await refreshScenarioVersion(organizationId, next.id, tx);
    await rebuildScenarioResult(organizationId, next.id, tx);
    await rebuildAllFinancingCases(organizationId, next.id, tx);
    await tx.underwritingScenario.update({ where: { id: source.id }, data: { status: "SUPERSEDED", supersededById: next.id } });
    await tx.underwriting.update({ where: { id: source.underwritingId }, data: { activeScenarioId: next.id } });
    return next;
  });
}

// --- migration backfill (DealAnalysis → Underwriting) -------------------------

// OPERATING assumptions only (3b-iii, CF-1) — the legacy loan terms become a
// "Base financing" FinancingCase, not Scenario assumptions.
const BACKFILL_MANUAL_MAP: { key: AssumptionKey; field: keyof import("@prisma/client").DealAnalysis }[] = [
  { key: "PURCHASE_PRICE", field: "purchasePriceUsd" },
  { key: "RENOVATION_BUDGET", field: "renovationBudgetUsd" },
  { key: "CLOSING_COSTS", field: "closingCostsUsd" },
  { key: "GROSS_INCOME", field: "grossIncomeAnnualUsd" },
  { key: "OPERATING_EXPENSES", field: "operatingExpensesUsd" },
];

// Legacy debt columns → the Base financing case's capital assumptions.
const BACKFILL_CAPITAL_MAP: { key: AssumptionKey; field: keyof import("@prisma/client").DealAnalysis }[] = [
  { key: "LOAN_AMOUNT", field: "loanAmountUsd" },
  { key: "INTEREST_RATE", field: "interestRatePct" },
  { key: "AMORTIZATION_YEARS", field: "amortizationYears" },
];

/**
 * Idempotently migrate every legacy DealAnalysis in an org into the canonical
 * model (one Underwriting + one DRAFT scenario with MANUAL inputs + a ScenarioSeed
 * snapshot of the current Property context, asOf the analysis's createdAt). Prod
 * has 0 rows → a clean no-op; validated on synthetic test rows.
 */
export async function backfillUnderwritingFromDealAnalysis(organizationId: string) {
  const analyses = await prisma.dealAnalysis.findMany({ where: { organizationId } });
  let created = 0;
  let skipped = 0;
  for (const a of analyses) {
    const exists = await prisma.underwriting.findUnique({ where: { opportunityId: a.opportunityId } });
    if (exists) {
      skipped++;
      continue;
    }
    await prisma.$transaction(async (tx) => {
      const uw = await tx.underwriting.create({
        data: { organizationId, opportunityId: a.opportunityId, propertyId: a.propertyId, createdAt: a.createdAt },
      });
      const scenario = await tx.underwritingScenario.create({
        data: {
          organizationId,
          underwritingId: uw.id,
          label: "Scenario 1",
          version: 1,
          status: "DRAFT",
          ...CURRENT_MODEL_LINEAGE,
          scenarioVersion: "",
          analystSummary: a.analystSummary,
          createdAt: a.createdAt,
        },
      });
      const manual: AssumptionEntry[] = BACKFILL_MANUAL_MAP.map((m) => ({
        key: m.key,
        value: (a[m.field] as number | null) ?? null,
        source: "MANUAL",
      }));
      await setScenarioAssumptions(organizationId, scenario.id, manual, tx);
      await seedScenarioFromProperty(organizationId, scenario.id, a.propertyId, a.createdAt, tx);
      await refreshScenarioVersion(organizationId, scenario.id, tx);
      await rebuildScenarioResult(organizationId, scenario.id, tx);
      // Legacy debt → a single Base financing case (only if any debt term was set).
      const capital = BACKFILL_CAPITAL_MAP.map((m) => ({ key: m.key, value: (a[m.field] as number | null) ?? null })).filter(
        (c) => c.value != null,
      );
      if (capital.length > 0) {
        await setFinancingCases(organizationId, scenario.id, [{ label: "Base financing", capital }], tx);
      }
      await tx.underwriting.update({ where: { id: uw.id }, data: { activeScenarioId: scenario.id } });
    });
    created++;
  }
  return { created, skipped };
}

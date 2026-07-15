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
import type { AssumptionSource } from "@prisma/client";

import { prisma } from "@/lib/prisma";
import {
  type AssumptionKey,
  type ResolvedAssumption,
  validateAssumptions,
} from "@/lib/underwriting/assumptions";
import {
  CURRENT_MODEL_LINEAGE,
  computeScenarioVersion,
  type ModelLineage,
} from "@/lib/underwriting/model-version";
import { deriveScenarioResult } from "@/lib/underwriting/scenario-result";

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

/** Recompute + persist scenario.scenarioVersion from its current assumptions (zero-write if unchanged). */
async function refreshScenarioVersion(organizationId: string, scenarioId: string, db: Db): Promise<string> {
  const assumptions = await resolveScenarioAssumptions(scenarioId, db);
  const scenario = await db.underwritingScenario.findFirstOrThrow({ where: { id: scenarioId, organizationId } });
  // ResolvedAssumption carries { key, canonical, source } → feeds the fingerprint directly.
  const scenarioVersion = computeScenarioVersion(assumptions, lineageOf(scenario));
  if (scenario.scenarioVersion !== scenarioVersion) {
    await db.underwritingScenario.update({ where: { id: scenarioId }, data: { scenarioVersion } });
  }
  return scenarioVersion;
}

const RESULT_METRIC_KEYS = [
  "noiAnnualUsd",
  "allInCostUsd",
  "capRate",
  "pricePerUnitUsd",
  "expenseRatioPct",
  "annualDebtServiceUsd",
  "dscr",
  "debtYieldPct",
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
  const scenario = await db.underwritingScenario.findFirstOrThrow({ where: { id: scenarioId, organizationId } });
  const { scenarioVersion, metrics } = deriveScenarioResult(assumptions, lineageOf(scenario));

  const values = { scenarioVersion, calcLibVersion: scenario.calcLibVersion, ...pickMetrics(metrics) };
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
  return {
    noiAnnualUsd: m.noiAnnualUsd,
    allInCostUsd: m.allInCostUsd,
    capRate: m.capRate,
    pricePerUnitUsd: m.pricePerUnitUsd,
    expenseRatioPct: m.expenseRatioPct,
    annualDebtServiceUsd: m.annualDebtServiceUsd,
    dscr: m.dscr,
    debtYieldPct: m.debtYieldPct,
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
  opts: { createdByUserId?: string; analystSummary?: string | null } = {},
) {
  return prisma.$transaction(async (tx) => {
    const scenario = await getOrCreateActiveScenarioTx(organizationId, opportunityId, tx, opts);
    await setScenarioAssumptions(
      organizationId,
      scenario.id,
      manual.map((m) => ({ key: m.key, value: m.value, source: "MANUAL" as AssumptionSource })),
      tx,
    );
    if (opts.analystSummary !== undefined) {
      await tx.underwritingScenario.update({
        where: { id: scenario.id },
        data: { analystSummary: opts.analystSummary },
      });
    }
    const result = await rebuildScenarioResult(organizationId, scenario.id, tx);
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
    include: { result: true, assumptions: true },
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
      include: { assumptions: true },
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
    await refreshScenarioVersion(organizationId, next.id, tx);
    await rebuildScenarioResult(organizationId, next.id, tx);
    await tx.underwritingScenario.update({ where: { id: source.id }, data: { status: "SUPERSEDED", supersededById: next.id } });
    await tx.underwriting.update({ where: { id: source.underwritingId }, data: { activeScenarioId: next.id } });
    return next;
  });
}

// --- migration backfill (DealAnalysis → Underwriting) -------------------------

const BACKFILL_MANUAL_MAP: { key: AssumptionKey; field: keyof import("@prisma/client").DealAnalysis }[] = [
  { key: "PURCHASE_PRICE", field: "purchasePriceUsd" },
  { key: "RENOVATION_BUDGET", field: "renovationBudgetUsd" },
  { key: "CLOSING_COSTS", field: "closingCostsUsd" },
  { key: "GROSS_INCOME", field: "grossIncomeAnnualUsd" },
  { key: "OPERATING_EXPENSES", field: "operatingExpensesUsd" },
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
      await tx.underwriting.update({ where: { id: uw.id }, data: { activeScenarioId: scenario.id } });
    });
    created++;
  }
  return { created, skipped };
}

// Commercial Underwriting (v1.3, Commit 3a) — MODEL LINEAGE + the deterministic
// scenarioVersion fingerprint. Pure: no Prisma, no framework, no clock, no
// randomness — safe to unit-test in isolation and to import from anywhere.
//
// Model lineage (U-K) names three independently-versioned things:
//   • UNDERWRITING_MODEL_VERSION   — the underwriting MODEL (which assumptions
//     exist, how a scenario maps to inputs).
//   • CALCULATION_LIBRARY_VERSION  — the pure calculation kernel (lib/analysis.ts).
//   • RULESET_VERSION              — the findings/risk ruleset (arrives in 3c;
//     declared now so lineage is complete and a later bump needs no migration).
// Bumping any one lets a consumer distinguish an assumption change from a
// calculation-model change (UW-2/UW-3).
//
// Lineage history:
//   v1 (3a) — model 1 / calc 1 / rules 1: the core kernel + snapshot ownership.
//   v2 (3b-i) — model 2 (new debt-sizing assumptions exist) / calc 2 (new
//     deterministic debt-sizing calculation) / rules 1 (unchanged).
//   v3 (3b-ii) — model 3 (scenario line-item schedules exist) / calc 3 (new
//     deterministic schedule roll-up feeding NOI) / rules 1 (unchanged).
//   v4 (3b-iii) — model 4 (FinancingCase capital structures + projection
//     assumptions exist; capital relocated off the Scenario) / calc 4 (new
//     deterministic multi-year cash-flow projection) / rules 1 (unchanged).
import { createHash } from "node:crypto";

export const UNDERWRITING_MODEL_VERSION = 4;
export const CALCULATION_LIBRARY_VERSION = 4;
export const RULESET_VERSION = 1;

export type ModelLineage = {
  modelVersion: number;
  calcLibVersion: number;
  rulesetVersion: number;
};

export const CURRENT_MODEL_LINEAGE: ModelLineage = {
  modelVersion: UNDERWRITING_MODEL_VERSION,
  calcLibVersion: CALCULATION_LIBRARY_VERSION,
  rulesetVersion: RULESET_VERSION,
};

/** One assumption as it participates in the fingerprint — a canonical STRING value. */
export type FingerprintAssumption = { key: string; canonical: string; source: string };

/** One schedule line as it participates in the fingerprint (position excluded — presentation only). */
export type FingerprintLine = { kind: string; category: string; canonical: string };

/**
 * Deterministic scenario FINGERPRINT: a pure function of the frozen assumption
 * set + a canonical (by-key) ordering + the model lineage — no wall-clock, no
 * randomness, no insertion order — so it is rebuildable and stable across
 * processes. Makes Scenario → ScenarioVersion → ScenarioResult explicit: an
 * assumption change flips `value`/`source`; a calculation-model change flips the
 * lineage; either flips the fingerprint. Values are canonical decimal strings so
 * that numerically-equal Decimals (e.g. trailing zeros) fingerprint identically.
 */
export function computeScenarioVersion(
  assumptions: FingerprintAssumption[],
  lineage: ModelLineage,
  lines: FingerprintLine[] = [],
): string {
  const sortedA = [...assumptions].sort((a, b) => a.key.localeCompare(b.key));
  const rows: string[][] = [];
  for (const x of sortedA) rows.push([x.key, x.canonical, x.source]);
  // Canonical, position-independent line ordering: reordering a schedule is a
  // presentation change (UW-8), so it must not flip the fingerprint.
  const sortedL = [...lines].sort(
    (a, b) => a.kind.localeCompare(b.kind) || a.category.localeCompare(b.category) || a.canonical.localeCompare(b.canonical),
  );
  const lineRows: string[][] = [];
  for (const l of sortedL) lineRows.push([l.kind, l.category, l.canonical]);
  const { modelVersion, calcLibVersion, rulesetVersion } = lineage;
  const canonical = JSON.stringify({ model: modelVersion, calc: calcLibVersion, rules: rulesetVersion, a: rows, s: lineRows });
  return createHash("sha256").update(canonical).digest("hex").slice(0, 32);
}

/**
 * Deterministic FINGERPRINT for one FinancingCase (v1.3, Commit 3b-iii, CF-3). A
 * pure function of the operating scenarioVersion it consumes (CF-4/CF-5 — it reads
 * the Scenario's frozen operating economics, so the operating fingerprint fully
 * captures that dependency), its own canonical capital assumptions, and the model
 * lineage. Two cases under one Scenario differ iff their capital differs; a case
 * changes iff the operating scenario OR its capital OR the lineage changes.
 */
export function computeFinancingCaseVersion(
  scenarioVersion: string,
  capital: FingerprintAssumption[],
  lineage: ModelLineage,
): string {
  const sorted = [...capital].sort((a, b) => a.key.localeCompare(b.key));
  const rows: string[][] = [];
  for (const x of sorted) rows.push([x.key, x.canonical, x.source]);
  const { modelVersion, calcLibVersion, rulesetVersion } = lineage;
  const canonical = JSON.stringify({ model: modelVersion, calc: calcLibVersion, rules: rulesetVersion, sv: scenarioVersion, c: rows });
  return createHash("sha256").update(canonical).digest("hex").slice(0, 32);
}

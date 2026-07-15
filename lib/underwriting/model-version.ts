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
// calculation-model change (UW-2/UW-3). All start at 1.
import { createHash } from "node:crypto";

export const UNDERWRITING_MODEL_VERSION = 1;
export const CALCULATION_LIBRARY_VERSION = 1;
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

/**
 * Deterministic scenario FINGERPRINT: a pure function of the frozen assumption
 * set + a canonical (by-key) ordering + the model lineage — no wall-clock, no
 * randomness, no insertion order — so it is rebuildable and stable across
 * processes. Makes Scenario → ScenarioVersion → ScenarioResult explicit: an
 * assumption change flips `value`/`source`; a calculation-model change flips the
 * lineage; either flips the fingerprint. Values are canonical decimal strings so
 * that numerically-equal Decimals (e.g. trailing zeros) fingerprint identically.
 */
export function computeScenarioVersion(assumptions: FingerprintAssumption[], lineage: ModelLineage): string {
  const sorted = [...assumptions].sort((a, b) => a.key.localeCompare(b.key));
  const rows: string[][] = [];
  for (const x of sorted) rows.push([x.key, x.canonical, x.source]);
  const { modelVersion, calcLibVersion, rulesetVersion } = lineage;
  const canonical = JSON.stringify({ model: modelVersion, calc: calcLibVersion, rules: rulesetVersion, a: rows });
  return createHash("sha256").update(canonical).digest("hex").slice(0, 32);
}

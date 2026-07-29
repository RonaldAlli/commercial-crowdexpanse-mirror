// BE-3 Candidate Compatibility Contract — Increment 2 (compatibility integration + suspension).
//
// ISOLATED, DIAGNOSTIC. A pure, deterministic function that decides whether candidate evaluation may
// proceed or must be SUSPENDED, by comparing an accepted contract to a current one across eight fields
// evaluated INDEPENDENTLY. It does NOT change candidate identity (civ-1/civ-2), candidate
// classification, baselines, evidence, migration, rename handling, the detector, or language rules,
// and it introduces no blocking CI. It regenerates no IDs and mutates nothing.
//
// On any incompatibility it returns a suspension decision that stops BEFORE any candidate
// classification — no partial evaluation, no best-effort, no fallback, no silent regeneration.

export const COMPATIBILITY_CONTRACT_VERSION = "cc-1";

export type CompatibilityFields = {
  findingIdentityVersion: string;
  candidateIdentityVersion: string;
  classificationAlgorithmVersion: string;
  detectorVersion: string;
  ruleSetHash: string;
  scopeHash: string;
  measurementSeriesId: string;
  baselineTag: string;
};

// Deterministic precedence: identity-version → detector/rule/scope → measurement → baseline.
const FIELD_ORDER: (keyof CompatibilityFields)[] = [
  "findingIdentityVersion",
  "candidateIdentityVersion",
  "classificationAlgorithmVersion",
  "detectorVersion",
  "ruleSetHash",
  "scopeHash",
  "measurementSeriesId",
  "baselineTag",
];

const FIELD_GROUP: Record<keyof CompatibilityFields, string> = {
  findingIdentityVersion: "identity-version",
  candidateIdentityVersion: "identity-version",
  classificationAlgorithmVersion: "identity-version",
  detectorVersion: "detector-rule-scope",
  ruleSetHash: "detector-rule-scope",
  scopeHash: "detector-rule-scope",
  measurementSeriesId: "measurement",
  baselineTag: "baseline",
};

export type Incompatibility = { field: keyof CompatibilityFields; group: string; expected: string; actual: string; reason: string };

export type CompatibilityResult = {
  contractVersion: string;
  mode: "compatible" | "suspended";
  compatible: boolean;
  classification: "none" | null;
  candidateEvaluation: "proceed" | "skipped";
  incompatibilities: Incompatibility[];
  reason: string | null;
};

/**
 * Evaluate compatibility of `current` against `accepted`. Deterministic, side-effect-free. Each field
 * is compared independently; ALL incompatibilities are reported in the fixed precedence order (never
 * collapsed into a generic failure). Any incompatibility ⇒ suspended (candidate evaluation skipped).
 */
export function evaluateCompatibility(accepted: CompatibilityFields, current: CompatibilityFields): CompatibilityResult {
  const incompatibilities: Incompatibility[] = [];
  for (const field of FIELD_ORDER) {
    const expected = accepted[field];
    const actual = current[field];
    if (expected !== actual) {
      incompatibilities.push({ field, group: FIELD_GROUP[field], expected, actual, reason: `${field} incompatible (expected '${expected}', got '${actual}')` });
    }
  }
  if (incompatibilities.length === 0) {
    return { contractVersion: COMPATIBILITY_CONTRACT_VERSION, mode: "compatible", compatible: true, classification: null, candidateEvaluation: "proceed", incompatibilities: [], reason: null };
  }
  const reason =
    "Candidate evaluation suspended — incompatible fields: " +
    incompatibilities.map((i) => `${i.field} (expected '${i.expected}', got '${i.actual}')`).join("; ") +
    ". New baseline acceptance or approved migration required.";
  return {
    contractVersion: COMPATIBILITY_CONTRACT_VERSION,
    mode: "suspended",
    compatible: false,
    classification: "none",
    candidateEvaluation: "skipped",
    incompatibilities,
    reason,
  };
}

function sortKeysDeep(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortKeysDeep);
  if (value && typeof value === "object") return Object.fromEntries(Object.keys(value as Record<string, unknown>).sort().map((k) => [k, sortKeysDeep((value as Record<string, unknown>)[k])]));
  return value;
}
export function stableStringifyCompatibility(result: CompatibilityResult): string {
  return JSON.stringify(sortKeysDeep(result), null, 2) + "\n";
}

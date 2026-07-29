// BE-3 Evidence Manifest — Increment 5A (migrationSchemaVersion + immutable Evidence Manifest foundation).
//
// ISOLATED, DIAGNOSTIC, NON-AUTHORITATIVE. Establishes the versioned evidence-container foundation
// required BEFORE any authoritative-readiness evidence is generated. It defines `migrationSchemaVersion`
// (the migration-evidence FORMAT/SEMANTICS — NOT candidate identity), a typed immutable Evidence
// Manifest, deterministic manifest construction + canonical serialization, and manifest compatibility
// validation that SUSPENDS on any governed-identifier mismatch.
//
// It does NOT run the readiness corpus, produce a baseline, tag, or switch authority. It consumes no
// live/accepted candidates. It changes none of Increments 1–4 (byte-identical). It regenerates no IDs
// and mutates nothing.
//
// migrationSchemaVersion versions the migration-evidence structure and semantics. It does not version
// candidate identity.
// The Evidence Manifest establishes reproducibility metadata. It does not authorize a baseline or an
// authority switch.

import { createHash } from "node:crypto";

export const MANIFEST_CONTRACT_VERSION = "emc-1";
export const MIGRATION_SCHEMA_VERSION = "msv-1";
export const SUPPORTED_MIGRATION_SCHEMA_VERSIONS = ["msv-1"] as const;
export const GENERATOR_VERSION = "genv-1";
const US = "\u001f"; // canonical field delimiter (ASCII unit separator, escape sequence; rejected inside values)

// generatedAt policy: EXPLICIT INPUT (never wall-clock). It is part of the manifest and the canonical
// digest; reproducibility holds because it is a supplied input — identical inputs → identical output.
export type EvidenceManifest = {
  findingIdentityVersion: string;
  candidateIdentityVersion: string;
  classificationAlgorithmVersion: string;
  migrationSchemaVersion: string;
  detectorVersion: string;
  ruleSetHash: string;
  scopeHash: string;
  measurementSeriesId: string;
  baselineTag: string;
  generatorVersion: string;
  generatedAt: string; // explicit, deterministic input
};

// Explicit field ordering — canonical serialization depends on this, never on JS insertion order.
export const MANIFEST_FIELD_ORDER: (keyof EvidenceManifest)[] = [
  "findingIdentityVersion",
  "candidateIdentityVersion",
  "classificationAlgorithmVersion",
  "migrationSchemaVersion",
  "detectorVersion",
  "ruleSetHash",
  "scopeHash",
  "measurementSeriesId",
  "baselineTag",
  "generatorVersion",
  "generatedAt",
];

// Governed identifiers used for compatibility (generatedAt is provenance, NOT a compatibility field).
export const GOVERNED_COMPAT_FIELDS: (keyof EvidenceManifest)[] = MANIFEST_FIELD_ORDER.filter((f) => f !== "generatedAt");

export type ConstructResult = { status: "ok"; manifest: Readonly<EvidenceManifest> } | { status: "rejected"; reason: string };

/** Deterministic, strict manifest construction. Unknown fields are REJECTED (explicit strict policy). */
export function constructManifest(input: Record<string, unknown>): ConstructResult {
  const required = new Set<string>(MANIFEST_FIELD_ORDER as string[]);
  for (const k of Object.keys(input)) if (!required.has(k)) return { status: "rejected", reason: `unknown field '${k}' (strict policy: unknown fields rejected)` };
  const out = {} as EvidenceManifest;
  for (const f of MANIFEST_FIELD_ORDER) {
    const v = input[f];
    if (v === undefined || v === null) return { status: "rejected", reason: `missing required field '${f}'` };
    if (typeof v !== "string" || v === "") return { status: "rejected", reason: `field '${f}' must be a non-empty string` };
    if (v.includes(US)) return { status: "rejected", reason: `field '${f}' contains reserved delimiter` };
    (out as Record<string, string>)[f] = v;
  }
  if (!(SUPPORTED_MIGRATION_SCHEMA_VERSIONS as readonly string[]).includes(out.migrationSchemaVersion)) {
    return { status: "rejected", reason: `unsupported migrationSchemaVersion '${out.migrationSchemaVersion}' (supported: ${SUPPORTED_MIGRATION_SCHEMA_VERSIONS.join(", ")}) — no automatic schema upgrade` };
  }
  return { status: "ok", manifest: Object.freeze(out) };
}

/** Canonical serialization: fixed field order, explicit delimiter. No insertion-order / runtime-state dependence. */
export function canonicalizeManifest(m: EvidenceManifest): string {
  return `${MANIFEST_CONTRACT_VERSION}${US}` + MANIFEST_FIELD_ORDER.map((f) => `${f}=${m[f]}`).join(US);
}
export function manifestDigest(m: EvidenceManifest): string {
  return "EM-" + createHash("sha256").update(canonicalizeManifest(m)).digest("hex").slice(0, 24);
}

export type Incompatibility = { field: keyof EvidenceManifest; expected: string; actual: string; reason: string };
export type ManifestValidation = {
  contractVersion: string;
  mode: "compatible" | "suspended";
  evidenceGeneration: "permitted" | "skipped";
  baselineProposal: "none"; // always none in Increment 5A
  authorityChange: "none"; // always none in Increment 5A
  incompatibilities: Incompatibility[];
  reason: string | null;
};

/** Suspend evaluation when any GOVERNED identifier differs from the accepted contract. */
export function validateManifest(accepted: EvidenceManifest, current: EvidenceManifest): ManifestValidation {
  const incompatibilities: Incompatibility[] = [];
  for (const f of GOVERNED_COMPAT_FIELDS) {
    if (accepted[f] !== current[f]) incompatibilities.push({ field: f, expected: accepted[f], actual: current[f], reason: `${f} incompatible (expected '${accepted[f]}', got '${current[f]}')` });
  }
  if (incompatibilities.length === 0) {
    return { contractVersion: MANIFEST_CONTRACT_VERSION, mode: "compatible", evidenceGeneration: "permitted", baselineProposal: "none", authorityChange: "none", incompatibilities: [], reason: null };
  }
  const reason = "Evidence generation suspended — incompatible manifest fields: " + incompatibilities.map((i) => `${i.field} (expected '${i.expected}', got '${i.actual}')`).join("; ") + ". No fallback, no silent substitution, no automatic schema upgrade.";
  return { contractVersion: MANIFEST_CONTRACT_VERSION, mode: "suspended", evidenceGeneration: "skipped", baselineProposal: "none", authorityChange: "none", incompatibilities, reason };
}

function sortKeysDeep(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortKeysDeep);
  if (value && typeof value === "object") return Object.fromEntries(Object.keys(value as Record<string, unknown>).sort().map((k) => [k, sortKeysDeep((value as Record<string, unknown>)[k])]));
  return value;
}
export function stableStringify(value: unknown): string {
  return JSON.stringify(sortKeysDeep(value), null, 2) + "\n";
}

import assert from "node:assert/strict";
import { test } from "node:test";

import {
  constructManifest, canonicalizeManifest, manifestDigest, validateManifest, stableStringify,
  GOVERNED_COMPAT_FIELDS, MIGRATION_SCHEMA_VERSION, type EvidenceManifest,
} from "@/lib/governance/be3-evidence-manifest";

const M: EvidenceManifest = {
  findingIdentityVersion: "fiv-1",
  candidateIdentityVersion: "civ-2",
  classificationAlgorithmVersion: "cav-1",
  migrationSchemaVersion: "msv-1",
  detectorVersion: "be3-detector-v1.0",
  ruleSetHash: "rs",
  scopeHash: "sc",
  measurementSeriesId: "ms",
  baselineTag: "be3-candidate-mode-v1.0",
  generatorVersion: "genv-1",
  generatedAt: "2026-07-29T00:00:00Z",
};
const ok = (input: Record<string, unknown>): EvidenceManifest => {
  const r = constructManifest(input); assert.equal(r.status, "ok"); return (r as any).manifest;
};

test("valid msv-1 manifest constructs", () => {
  const r = constructManifest({ ...M });
  assert.equal(r.status, "ok");
  assert.equal((r as any).manifest.migrationSchemaVersion, MIGRATION_SCHEMA_VERSION);
});
test("repeated generation is byte-identical (canonical + digest)", () => {
  assert.equal(canonicalizeManifest(ok(M)), canonicalizeManifest(ok(M)));
  assert.equal(manifestDigest(ok(M)), manifestDigest(ok(M)));
  assert.ok(manifestDigest(ok(M)).startsWith("EM-"));
});
test("shuffled input construction → identical canonical output", () => {
  const shuffled = Object.fromEntries(Object.entries(M).reverse());
  assert.equal(canonicalizeManifest(ok(shuffled)), canonicalizeManifest(ok(M)));
  assert.equal(manifestDigest(ok(shuffled)), manifestDigest(ok(M)));
});
test("explicit deterministic generatedAt: value comes from input; different generatedAt → different digest", () => {
  assert.equal(ok(M).generatedAt, "2026-07-29T00:00:00Z");
  assert.notEqual(manifestDigest(ok(M)), manifestDigest(ok({ ...M, generatedAt: "2026-08-01T00:00:00Z" })));
});
test("generatedAt is NOT a compatibility field", () => {
  const r = validateManifest(ok(M), ok({ ...M, generatedAt: "2026-12-31T00:00:00Z" }));
  assert.equal(r.mode, "compatible");
  assert.equal(r.incompatibilities.length, 0);
});
for (const f of GOVERNED_COMPAT_FIELDS) {
  test(`single-field mismatch suspends: ${f}`, () => {
    const r = validateManifest(ok(M), ok({ ...M, [f]: f === "migrationSchemaVersion" ? "msv-1" : "XX", ...(f === "migrationSchemaVersion" ? {} : {}) }) as any);
    // migrationSchemaVersion must stay supported to construct; mutate it to another supported-shaped value via a compatible manifest
    if (f === "migrationSchemaVersion") { assert.equal(r.mode, "compatible"); return; }
    assert.equal(r.mode, "suspended");
    assert.equal(r.evidenceGeneration, "skipped");
    assert.equal(r.baselineProposal, "none");
    assert.equal(r.authorityChange, "none");
    assert.ok(r.incompatibilities.some((i) => i.field === f));
  });
}
test("migrationSchemaVersion mismatch suspends (via unsupported-shaped current bypassing construct)", () => {
  const current = { ...ok(M), migrationSchemaVersion: "msv-2" } as EvidenceManifest;
  const r = validateManifest(ok(M), current);
  assert.equal(r.mode, "suspended");
  assert.ok(r.incompatibilities.some((i) => i.field === "migrationSchemaVersion"));
});
test("multiple mismatches reported in deterministic precedence order", () => {
  const cur = ok({ ...M, baselineTag: "B", candidateIdentityVersion: "civ-9", detectorVersion: "D" });
  const r = validateManifest(ok(M), cur);
  assert.deepEqual(r.incompatibilities.map((i) => i.field), ["candidateIdentityVersion", "detectorVersion", "baselineTag"]);
});
test("no baseline proposal / no authority change even when compatible", () => {
  const r = validateManifest(ok(M), ok(M));
  assert.equal(r.baselineProposal, "none");
  assert.equal(r.authorityChange, "none");
});
test("input objects remain unmodified (frozen input accepted)", () => {
  const frozen = Object.freeze({ ...M });
  assert.doesNotThrow(() => constructManifest(frozen as any));
  assert.equal((frozen as any).generatedAt, "2026-07-29T00:00:00Z");
});
test("unsupported schema version is rejected (no automatic upgrade)", () => {
  const r = constructManifest({ ...M, migrationSchemaVersion: "msv-2" });
  assert.equal(r.status, "rejected");
  assert.match((r as any).reason, /unsupported migrationSchemaVersion/);
});
test("missing required field is rejected", () => {
  const { generatedAt, ...missing } = M as any;
  const r = constructManifest(missing);
  assert.equal(r.status, "rejected");
  assert.match((r as any).reason, /missing required field 'generatedAt'/);
});
test("unknown fields rejected (explicit strict policy)", () => {
  const r = constructManifest({ ...M, extra: "x" });
  assert.equal(r.status, "rejected");
  assert.match((r as any).reason, /unknown field 'extra'/);
});
test("canonical digest stable across repeated runs; stableStringify deterministic", () => {
  const m = ok(M);
  assert.equal(manifestDigest(m), manifestDigest(m));
  assert.equal(stableStringify(validateManifest(m, m)), stableStringify(validateManifest(m, m)));
});

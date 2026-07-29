#!/usr/bin/env -S node --import tsx
// BE-3 Increment 5A — Evidence Manifest diagnostic CLI.
//
// ISOLATED, READ-ONLY, NON-AUTHORITATIVE. Constructs two Evidence Manifests (accepted, current) from
// explicit JSON inputs, canonicalizes them, and reports whether evidence generation would be PERMITTED
// or SUSPENDED under the manifest compatibility contract. It performs NO corpus run, proposes NO
// baseline, and switches NO authority. It refuses to write into accepted v1.0 evidence paths.
//
// Usage:
//   be3-evidence-manifest.ts --accepted accepted.json --current current.json [--json-out out.json]
//
// Each input JSON is a flat object with the 11 Evidence Manifest fields. Exit code is always 0 for a
// well-formed diagnostic run (compatible OR suspended). Exit 2 only for a usage/IO/protected-path error.

import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  constructManifest, canonicalizeManifest, manifestDigest, validateManifest, stableStringify,
  MANIFEST_CONTRACT_VERSION, MIGRATION_SCHEMA_VERSION,
} from "../../lib/governance/be3-evidence-manifest.ts";

// Refuse to overwrite accepted, authoritative v1.0 evidence — this tool is non-authoritative by design.
const PROTECTED_DIR = /(^|\/)docs\/business\/evolution\/be-3\/evidence(\/|$)/;
const PROTECTED_FILE = /(baseline|accepted|-v1\.0)[^/]*\.json$/i;

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(name);
  return i >= 0 ? process.argv[i + 1] : undefined;
}
function fail(msg: string): never {
  process.stderr.write(`be3-evidence-manifest: ${msg}\n`);
  process.exit(2);
}
function build(path: string, role: string) {
  let raw: unknown;
  try { raw = JSON.parse(readFileSync(resolve(path), "utf8")); } catch (e) { fail(`cannot read/parse ${role} input '${path}': ${(e as Error).message}`); }
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) fail(`${role} input '${path}' must be a JSON object`);
  const r = constructManifest(raw as Record<string, unknown>);
  if (r.status === "rejected") fail(`${role} manifest rejected: ${r.reason}`);
  return r.manifest;
}

const acceptedPath = arg("--accepted");
const currentPath = arg("--current");
if (!acceptedPath || !currentPath) fail("required: --accepted <json> --current <json> [--json-out <path>]");

const accepted = build(acceptedPath, "accepted");
const current = build(currentPath, "current");
const validation = validateManifest(accepted, current);

const report = {
  tool: "be3-evidence-manifest",
  manifestContractVersion: MANIFEST_CONTRACT_VERSION,
  migrationSchemaVersion: MIGRATION_SCHEMA_VERSION,
  accepted: { digest: manifestDigest(accepted), canonical: canonicalizeManifest(accepted) },
  current: { digest: manifestDigest(current), canonical: canonicalizeManifest(current) },
  validation,
  note: "Diagnostic only. Establishes reproducibility metadata; authorizes no baseline and no authority switch.",
};

const out = arg("--json-out");
if (out) {
  const abs = resolve(out);
  if (PROTECTED_DIR.test(abs) || PROTECTED_FILE.test(abs)) fail(`refusing to write into protected accepted-evidence path '${out}'`);
  writeFileSync(abs, stableStringify(report));
  process.stdout.write(`wrote ${out}\n`);
}
process.stdout.write(
  `manifest: ${validation.mode.toUpperCase()} — evidenceGeneration=${validation.evidenceGeneration}, ` +
  `baselineProposal=${validation.baselineProposal}, authorityChange=${validation.authorityChange}` +
  (validation.incompatibilities.length ? `\nincompatibilities:\n` + validation.incompatibilities.map((i) => `  - ${i.reason}`).join("\n") + "\n" : "\n"),
);
process.exit(0);

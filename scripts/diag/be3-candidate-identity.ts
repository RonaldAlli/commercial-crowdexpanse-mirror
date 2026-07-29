// BE-3 Candidate Identity (civ-2) diagnostic CLI — ISOLATED, NON-AUTHORITATIVE, deterministic.
// Reads a JSON array of identity inputs and prints the canonical identity results. It does not touch
// the candidate classifier, compatibility, baselines, evidence, or production behavior. Exit 0.
//
// Usage: node --import tsx scripts/diag/be3-candidate-identity.ts --in <inputs.json> [--json-out <p>]

import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";

import { generateIdentities, stableStringifyIdentities, type IdentityInput } from "@/lib/governance/be3-candidate-identity";

function parseArgs(argv: string[]) {
  const out: { in?: string; jsonOut?: string } = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i], v = argv[i + 1];
    if (a === "--in") { out.in = v; i++; }
    else if (a === "--json-out") { out.jsonOut = v; i++; }
    else throw new Error(`Unknown argument: ${a}`);
  }
  if (!out.in) throw new Error("required: --in <inputs.json> (array of IdentityInput)");
  return out;
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const inputs = JSON.parse(readFileSync(resolve(args.in!), "utf8")) as IdentityInput[];
  const report = generateIdentities(inputs);
  const json = stableStringifyIdentities(report);
  if (args.jsonOut) { mkdirSync(dirname(resolve(args.jsonOut)), { recursive: true }); writeFileSync(resolve(args.jsonOut), json, "utf8"); }
  process.stdout.write(json);
  process.exit(0); // NON-BLOCKING, diagnostic only
}

main();

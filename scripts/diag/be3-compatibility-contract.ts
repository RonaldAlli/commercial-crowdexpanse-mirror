// BE-3 Candidate Compatibility Contract diagnostic CLI — ISOLATED, deterministic, NON-BLOCKING.
// Reads { "accepted": {...}, "current": {...} } and prints the compatibility result. It changes no
// candidate identity, classification, baseline, or evidence; it emits only compatibility results and
// always exits 0 (diagnostic, not enforcement).

import { readFileSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";

import { evaluateCompatibility, stableStringifyCompatibility, type CompatibilityFields } from "@/lib/governance/be3-compatibility-contract";

function parseArgs(argv: string[]) {
  const out: { in?: string; jsonOut?: string } = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i], v = argv[i + 1];
    if (a === "--in") { out.in = v; i++; }
    else if (a === "--json-out") { out.jsonOut = v; i++; }
    else throw new Error(`Unknown argument: ${a}`);
  }
  if (!out.in) throw new Error("required: --in <file.json> with {accepted, current}");
  return out;
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const doc = JSON.parse(readFileSync(resolve(args.in!), "utf8")) as { accepted: CompatibilityFields; current: CompatibilityFields };
  const result = evaluateCompatibility(doc.accepted, doc.current);
  const json = stableStringifyCompatibility(result);
  if (args.jsonOut) { mkdirSync(dirname(resolve(args.jsonOut)), { recursive: true }); writeFileSync(resolve(args.jsonOut), json, "utf8"); }
  process.stdout.write(json);
  process.exit(0); // diagnostic, non-blocking
}

main();

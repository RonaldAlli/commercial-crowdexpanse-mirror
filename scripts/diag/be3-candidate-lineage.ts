// BE-3 Candidate Lineage diagnostic CLI — ISOLATED, deterministic, NON-BLOCKING (exit 0).
// Reads { "previous": [...], "current": [...], "renames": [...] } and prints the lineage report.
// Diagnostic only: changes no identity, compatibility, classification, baseline, or evidence.

import { readFileSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";

import { evaluateLineage, stableStringifyLineage, type PreviousCandidate, type CurrentFinding, type VerifiedRename } from "@/lib/governance/be3-candidate-lineage";

function parseArgs(argv: string[]) {
  const out: { in?: string; jsonOut?: string } = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i], v = argv[i + 1];
    if (a === "--in") { out.in = v; i++; }
    else if (a === "--json-out") { out.jsonOut = v; i++; }
    else throw new Error(`Unknown argument: ${a}`);
  }
  if (!out.in) throw new Error("required: --in <file.json> with {previous, current, renames}");
  return out;
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const doc = JSON.parse(readFileSync(resolve(args.in!), "utf8")) as { previous: PreviousCandidate[]; current: CurrentFinding[]; renames?: VerifiedRename[] };
  const report = evaluateLineage(doc.previous ?? [], doc.current ?? [], doc.renames ?? []);
  const json = stableStringifyLineage(report);
  if (args.jsonOut) { mkdirSync(dirname(resolve(args.jsonOut)), { recursive: true }); writeFileSync(resolve(args.jsonOut), json, "utf8"); }
  process.stdout.write(json);
  process.exit(0); // diagnostic, non-blocking
}

main();

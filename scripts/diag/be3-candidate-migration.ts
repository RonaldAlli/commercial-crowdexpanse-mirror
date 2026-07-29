// BE-3 Candidate Migration diagnostic CLI — READ-ONLY, deterministic, NON-BLOCKING.
// Reads { "old": [...], "new": [...], "linkage": [...] } and writes the migration EVIDENCE report to an
// EXPLICIT output path. It proposes mappings only; it performs no migration and switches no authority.
// It NEVER modifies accepted artifacts and REFUSES to write into any accepted v1.0 evidence location.
//
// Successful diagnostic → exit 0 (non-blocking). Usage/safety refusals (missing/forbidden output path)
// → exit 2, writing nothing.

import { readFileSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";

import { evaluateMigration, stableStringifyMigration, type MigrationInput } from "@/lib/governance/be3-candidate-migration";

// Accepted v1.0 evidence must never be an output target.
const PROTECTED_DIR = /\/be-3\/(evidence|measurement|prevention|candidate|blocking-readiness)\//;
const PROTECTED_FILE = /(BE3-[A-Z0-9-]+-v1\.0(\.report)?\.(json|md)|corpus\.json|CANDIDATE_IDENTITY_INCREMENT\d+_(ACCEPTANCE|REPORT)\.md)$/i;

function refuse(msg: string): never { process.stderr.write(`[be3-migration] REFUSED: ${msg}\n`); process.exit(2); }

function parseArgs(argv: string[]) {
  const out: { in?: string; jsonOut?: string } = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i], v = argv[i + 1];
    if (a === "--in") { out.in = v; i++; }
    else if (a === "--json-out") { out.jsonOut = v; i++; }
    else refuse(`unknown argument: ${a}`);
  }
  if (!out.in) refuse("required: --in <file.json>");
  if (!out.jsonOut) refuse("required: --json-out <path> (explicit output path is mandatory)");
  return out as { in: string; jsonOut: string };
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const outAbs = resolve(args.jsonOut);
  if (PROTECTED_DIR.test(outAbs.replace(/\\/g, "/")) || PROTECTED_FILE.test(outAbs)) {
    refuse(`output path targets accepted v1.0 evidence — accepted artifacts are immutable: ${args.jsonOut}`);
  }
  const doc = JSON.parse(readFileSync(resolve(args.in), "utf8")) as MigrationInput;
  const report = evaluateMigration({ old: doc.old ?? [], new: doc.new ?? [], linkage: doc.linkage ?? [] });
  mkdirSync(dirname(outAbs), { recursive: true });
  writeFileSync(outAbs, stableStringifyMigration(report), "utf8");
  process.stdout.write(stableStringifyMigration(report));
  process.exit(0); // diagnostic, non-blocking
}

main();

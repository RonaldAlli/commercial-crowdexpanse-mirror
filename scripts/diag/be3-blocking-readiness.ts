// BE-3 Blocking Readiness Evaluation CLI — read-only, deterministic, NON-BLOCKING (always exits 0).
// Runs the evaluation harness over a synthetic corpus and emits the canonical evidence JSON + report.
// It never modifies product behavior, the classifier, the detector, or the source tree.

import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";

import { evaluate, renderEvidenceReport, stableStringifyEvidence, type Corpus } from "@/lib/governance/be3-blocking-readiness";

type Cli = { corpus?: string; jsonOut?: string; markdownOut?: string; format: "json" | "text"; evaluatedAtActive: string; evaluatedAtExpired: string };

function parseArgs(argv: string[]): Cli {
  // Deterministic default evaluation timestamps (never wall-clock).
  const out: Cli = { format: "text", evaluatedAtActive: "2026-07-30", evaluatedAtExpired: "2026-08-02" };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i], v = argv[i + 1];
    switch (a) {
      case "--corpus": out.corpus = v; i++; break;
      case "--json-out": out.jsonOut = v; i++; break;
      case "--markdown-out": out.markdownOut = v; i++; break;
      case "--format": if (v !== "json" && v !== "text") throw new Error(`bad --format ${v}`); out.format = v; i++; break;
      case "--evaluated-at-active": out.evaluatedAtActive = v; i++; break;
      case "--evaluated-at-expired": out.evaluatedAtExpired = v; i++; break;
      default: throw new Error(`Unknown argument: ${a}`);
    }
  }
  if (!out.corpus) throw new Error("required: --corpus <corpus.json>");
  return out;
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const raw = readFileSync(resolve(args.corpus!), "utf8");
  const corpus = JSON.parse(raw) as Corpus;
  const corpusDigest = createHash("sha256").update(raw).digest("hex");
  const ev = evaluate(corpus, { evaluatedAtActive: args.evaluatedAtActive, evaluatedAtExpired: args.evaluatedAtExpired, corpusDigest });
  if (args.jsonOut) { mkdirSync(dirname(resolve(args.jsonOut)), { recursive: true }); writeFileSync(resolve(args.jsonOut), stableStringifyEvidence(ev), "utf8"); }
  if (args.markdownOut) { mkdirSync(dirname(resolve(args.markdownOut)), { recursive: true }); writeFileSync(resolve(args.markdownOut), renderEvidenceReport(ev), "utf8"); }
  process.stdout.write(args.format === "json" ? stableStringifyEvidence(ev) : renderEvidenceReport(ev));
  process.exit(0); // NON-BLOCKING
}

main();

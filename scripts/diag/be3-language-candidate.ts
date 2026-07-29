// BE-3 Candidate Mode CLI — NON-BLOCKING. Always exits 0.
//
// Classifies a current detector run against the accepted advisory/grandfathered baseline into
// existing / candidate-new / moved / ambiguous / resolved (see lib/governance/be3-language-candidate.ts
// and docs/business/evolution/be-3/CANDIDATE_MODE_PLAN.md). Emits canonical JSON + a derived review
// report. It writes only the caller-specified artifacts; it never modifies the scanned source, and it
// never fails CI.

import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";

import { renderCandidateReport, runCandidate, stableStringifyCandidate, FINDING_IDENTITY_VERSION, type CandidateInput, type Finding } from "@/lib/governance/be3-language-candidate";

type Cli = {
  current?: string;
  baselineFindings?: string;
  acceptedMeasurement?: string;
  baselineTag: string;
  renames: Record<string, string>;
  aliases: Record<string, string>;
  recreated: string[];
  format: "json" | "text";
  jsonOut?: string;
  markdownOut?: string;
};

function parseKV(store: Record<string, string>, kv: string) {
  const i = kv.indexOf("=");
  if (i < 0) throw new Error(`Expected key=value, got: ${kv}`);
  store[kv.slice(0, i)] = kv.slice(i + 1);
}

function parseArgs(argv: string[]): Cli {
  const out: Cli = { baselineTag: "be3-measurement-baseline-v1.0", renames: {}, aliases: {}, recreated: [], format: "text" };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i], v = argv[i + 1];
    switch (a) {
      case "--current": out.current = v; i++; break;
      case "--baseline-findings": out.baselineFindings = v; i++; break;
      case "--accepted-measurement": out.acceptedMeasurement = v; i++; break;
      case "--baseline-tag": out.baselineTag = v; i++; break;
      case "--rename": parseKV(out.renames, v); i++; break;
      case "--alias": parseKV(out.aliases, v); i++; break;
      case "--recreated": out.recreated.push(v); i++; break;
      case "--format": if (v !== "json" && v !== "text") throw new Error(`bad --format ${v}`); out.format = v; i++; break;
      case "--json-out": out.jsonOut = v; i++; break;
      case "--markdown-out": out.markdownOut = v; i++; break;
      default: throw new Error(`Unknown argument: ${a}`);
    }
  }
  if (!out.current || !out.baselineFindings || !out.acceptedMeasurement) {
    throw new Error("required: --current <detector.json> --baseline-findings <evidence.json> --accepted-measurement <measurement.json>");
  }
  return out;
}

function loadJson(p: string): any {
  return JSON.parse(readFileSync(resolve(p), "utf8"));
}
function findingsOf(doc: any): Finding[] {
  const arr = Array.isArray(doc?.findings) ? doc.findings : [];
  return arr.map((f: any): Finding => ({ ruleId: String(f.ruleId), lId: String(f.lId), matched: String(f.matched), file: String(f.file), line: Number(f.line) }));
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const measurement = loadJson(args.acceptedMeasurement);
  const series = measurement.series ?? {};
  const accepted = {
    detectorVersion: String(series.detectorVersion),
    ruleSetHash: String(series.ruleSetHash),
    scopeHash: String(series.scopeHash),
    measurementSeriesId: String(measurement.measurementSeriesId),
    baselineTag: args.baselineTag,
    findingIdentityVersion: FINDING_IDENTITY_VERSION,
  };
  // At the accepted baseline the current run shares the accepted compat keys; a future PR run would
  // supply differing values (which the Prevention Compatibility Contract then suspends on).
  const curCompat = {
    detectorVersion: accepted.detectorVersion,
    ruleSetHash: accepted.ruleSetHash,
    scopeHash: accepted.scopeHash,
    measurementSeriesId: accepted.measurementSeriesId,
  };
  const input: CandidateInput = {
    current: { compat: curCompat, findings: findingsOf(loadJson(args.current)) },
    baseline: { findings: findingsOf(loadJson(args.baselineFindings)) },
    accepted,
    options: { renames: args.renames, aliases: args.aliases, recreatedFiles: args.recreated },
  };
  const report = runCandidate(input);
  if (args.jsonOut) { mkdirSync(dirname(resolve(args.jsonOut)), { recursive: true }); writeFileSync(resolve(args.jsonOut), stableStringifyCandidate(report), "utf8"); }
  if (args.markdownOut) { mkdirSync(dirname(resolve(args.markdownOut)), { recursive: true }); writeFileSync(resolve(args.markdownOut), renderCandidateReport(report), "utf8"); }
  process.stdout.write(args.format === "json" ? stableStringifyCandidate(report) : renderCandidateReport(report));
  process.exit(0); // NON-BLOCKING by contract
}

main();

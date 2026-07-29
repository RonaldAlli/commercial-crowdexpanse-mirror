#!/usr/bin/env -S node --import tsx
// BE-3 Increment 5B — corpus-rerun evidence diagnostic CLI.
//
// ISOLATED, READ-ONLY, NON-AUTHORITATIVE. Reads the accepted corpus + approved additions + the accepted
// v1.0 blocking-readiness evidence (for side-by-side comparison), reruns the hardened identity stack,
// and writes the canonical evidence JSON + derived report. It performs no migration, proposes no
// baseline, creates no tag, and switches no authority. Deterministic — generatedAt/evaluatedAt are
// explicit inputs. It REFUSES to write into accepted-evidence paths.
//
// Usage:
//   be3-corpus-rerun.ts --corpus <accepted.json> --additions <additions.json> --prior <v1.0.json>
//                       --generated-at <ISO> --evaluated-at <ISO>
//                       [--json-out <path>] [--report-out <path>]

import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { runRerun, renderRerunReport, stableStringifyRerun, type PriorV1 } from "../../lib/governance/be3-corpus-rerun.ts";

function arg(name: string): string | undefined { const i = process.argv.indexOf(name); return i >= 0 ? process.argv[i + 1] : undefined; }
function fail(msg: string): never { process.stderr.write(`be3-corpus-rerun: ${msg}\n`); process.exit(2); }
function readJson(path: string, role: string): any { try { return JSON.parse(readFileSync(resolve(path), "utf8")); } catch (e) { fail(`cannot read/parse ${role} '${path}': ${(e as Error).message}`); } }

// Refuse to overwrite accepted, authoritative evidence/baselines — this tool is non-authoritative.
const PROTECTED = /(^|\/)(evidence|measurement|prevention|candidate|blocking-readiness)\/BE3-[A-Z-]+-v1\.0\.(json|md)$/;
function guard(out: string) { const abs = resolve(out); if (PROTECTED.test(abs) || /-BASELINE-v1\.0\.(json|md)$/.test(abs)) fail(`refusing to write into protected accepted-evidence path '${out}'`); return abs; }
function writeOut(out: string, content: string) { const abs = guard(out); mkdirSync(dirname(abs), { recursive: true }); writeFileSync(abs, content); process.stdout.write(`wrote ${out}\n`); }

const corpusPath = arg("--corpus"), additionsPath = arg("--additions"), priorPath = arg("--prior");
const generatedAt = arg("--generated-at"), evaluatedAt = arg("--evaluated-at");
if (!corpusPath || !additionsPath || !priorPath || !generatedAt || !evaluatedAt) fail("required: --corpus --additions --prior --generated-at --evaluated-at [--json-out] [--report-out]");

const corpus = readJson(corpusPath, "accepted corpus");
const additions = readJson(additionsPath, "additions");
const priorRaw = readJson(priorPath, "prior v1.0 evidence");

// Extract the prior v1.0 reference (read-only) from the accepted blocking-readiness evidence.
const s = priorRaw.candidateIdentityStability ?? {};
const cf = priorRaw.confusion ?? {};
const civSusp = (priorRaw.suspensionOutcomes ?? []).find((x: any) => x.trigger === "candidateIdentityVersion changed");
const prior: PriorV1 = {
  candidateIdentityStability: { classificationIndependence: !!s.classificationIndependence, renames: !!s.renames, repeats: !!s.repeats, removeReintroduce: !!s.removeReintroduce, pathCanonicalization: !!s.pathCanonicalization, baselineEvolution: !!s.baselineEvolution },
  confusion: { truePositives: cf.truePositives ?? 0, falsePositives: cf.falsePositives ?? 0, trueNegatives: cf.trueNegatives ?? 0, falseNegatives: cf.falseNegatives ?? 0, silentFalseNegatives: cf.silentFalseNegatives ?? 0, ambiguousFalseNegatives: cf.ambiguousFalseNegatives ?? 0, unclassified: cf.unclassified ?? 0 },
  candidateIdentityVersionSuspension: civSusp && civSusp.result === "suspended" ? "wired" : "not-wired",
};

const ev = runRerun(corpus, additions, prior, { generatedAt, evaluatedAt });
const json = stableStringifyRerun(ev);
const report = renderRerunReport(ev);

const jsonOut = arg("--json-out"), reportOut = arg("--report-out");
if (jsonOut) writeOut(jsonOut, json);
if (reportOut) writeOut(reportOut, report);
if (!jsonOut && !reportOut) process.stdout.write(json);

process.stdout.write(`\nmanifestDigest=${ev.manifestDigest}  corpusDigest=${ev.provenance.corpusDigest.slice(0, 16)}…  deterministic=${ev.selfCheck.deterministic}\n`);
process.stdout.write(`confusion: TP=${ev.confusion.truePositives} FP=${ev.confusion.falsePositives} TN=${ev.confusion.trueNegatives} FN=${ev.confusion.falseNegatives} (silent=${ev.confusion.silentFalseNegatives}, ambiguous=${ev.confusion.ambiguousFalseNegatives}) suspension=${ev.confusion.suspension} unclassified=${ev.confusion.unclassified}\n`);
process.exit(0);

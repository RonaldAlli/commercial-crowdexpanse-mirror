import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import assert from "node:assert/strict";

import type { DetectorReport, Finding } from "../../../lib/governance/be3-language-detector";
import type { MeasurementReport } from "../../../lib/governance/be3-language-measure";
import { runBe3Measurement } from "../../../lib/governance/be3-language-measure";
import { runBe3Prevention, stableStringifyPrevention } from "../../../lib/governance/be3-language-prevent";

const ROOT = process.cwd();
const ACCEPTED_EVIDENCE = JSON.parse(
  readFileSync(join(ROOT, "docs/business/evolution/be-3/evidence/BE3-EVIDENCE-BASELINE-v1.0.json"), "utf8"),
) as DetectorReport;
const ACCEPTED_MEASUREMENT = JSON.parse(
  readFileSync(join(ROOT, "docs/business/evolution/be-3/measurement/BE3-MEASUREMENT-BASELINE-v1.0.json"), "utf8"),
) as MeasurementReport;

function makeFinding(overrides: Partial<Finding> = {}): Finding {
  return {
    confidence: 1,
    file: "app/example.ts",
    glossaryTerm: "Seller",
    lId: "L2",
    line: 1,
    matched: "target",
    ruleId: "R-SYN-002",
    severity: "error",
    ...overrides,
  };
}

function makeDetectorReport(findings: Finding[]): DetectorReport {
  const errorFindings = findings.filter((finding) => finding.severity === "error");
  const byLId = new Map<string, number>();
  const byRule = new Map<string, { count: number; lId: string; ruleId: string; severity: "error" | "info" }>();

  for (const finding of findings) {
    if (finding.severity === "error") {
      byLId.set(finding.lId, (byLId.get(finding.lId) ?? 0) + 1);
    }
    const rule = byRule.get(finding.ruleId) ?? {
      count: 0,
      lId: finding.lId,
      ruleId: finding.ruleId,
      severity: finding.severity,
    };
    rule.count += 1;
    byRule.set(finding.ruleId, rule);
  }

  return {
    alignmentScore: {
      byLId: Array.from(byLId.entries()).map(([lId, count]) => ({ count, lId })),
      errorFindingCount: errorFindings.length,
      percentage: null,
      phase: "Phase 1 input only",
    },
    detectorId: "BE3-DET",
    findings,
    inputs: {
      config: { blob: ACCEPTED_EVIDENCE.inputs.config.blob, path: ACCEPTED_EVIDENCE.inputs.config.path },
      glossary: { blob: ACCEPTED_EVIDENCE.inputs.glossary.blob, path: ACCEPTED_EVIDENCE.inputs.glossary.path },
      rules: { blob: ACCEPTED_EVIDENCE.inputs.rules.blob, path: ACCEPTED_EVIDENCE.inputs.rules.path },
      sourceCommit: ACCEPTED_EVIDENCE.inputs.sourceCommit,
    },
    scope: {
      ignoredPathFragments: [...ACCEPTED_EVIDENCE.scope.ignoredPathFragments],
      includeExtensions: [...ACCEPTED_EVIDENCE.scope.includeExtensions],
    },
    summaries: {
      byLId: Array.from(byLId.entries()).map(([lId, count]) => ({ count, lId })),
      byRule: Array.from(byRule.values()).map((row) => ({ count: row.count, lId: row.lId, ruleId: row.ruleId, severity: row.severity })),
    },
  };
}

test("accepted baseline classifies entirely as grandfathered in advisory mode", () => {
  const report = runBe3Prevention({
    acceptedEvidence: ACCEPTED_EVIDENCE,
    acceptedMeasurement: ACCEPTED_MEASUREMENT,
    detectorReport: ACCEPTED_EVIDENCE,
    rootDir: ROOT,
  });

  assert.equal(report.mode, "advisory");
  assert.equal(report.compatibility.compatible, true);
  assert.equal(report.summary.grandfatheredCount, 117);
  assert.equal(report.summary.newDriftCount, 0);
  assert.equal(report.summary.informationalCount, 0);
});

test("pure line renumbering stays grandfathered", () => {
  const accepted = makeDetectorReport([makeFinding({ file: "app/example.ts", line: 10, matched: "target" })]);
  const acceptedMeasurement = runBe3Measurement({
    baseline: { errorFindingCount: 1, ref: "be3-evidence-baseline-v1.0" },
    detectorReport: accepted,
    detectorVersion: "be3-detector-v1.0",
  });
  const current = makeDetectorReport([makeFinding({ file: "app/example.ts", line: 99, matched: "target" })]);

  const report = runBe3Prevention({
    acceptedEvidence: accepted,
    acceptedMeasurement,
    detectorReport: current,
    rootDir: ROOT,
  });

  assert.equal(report.summary.grandfatheredCount, 1);
  assert.equal(report.summary.newDriftCount, 0);
});

test("count increase for the same stable key becomes new drift", () => {
  const accepted = makeDetectorReport([makeFinding({ file: "app/example.ts", line: 10, matched: "target" })]);
  const acceptedMeasurement = runBe3Measurement({
    baseline: { errorFindingCount: 1, ref: "be3-evidence-baseline-v1.0" },
    detectorReport: accepted,
    detectorVersion: "be3-detector-v1.0",
  });
  const current = makeDetectorReport([
    makeFinding({ file: "app/example.ts", line: 10, matched: "target" }),
    makeFinding({ file: "app/example.ts", line: 22, matched: "target" }),
  ]);

  const report = runBe3Prevention({
    acceptedEvidence: accepted,
    acceptedMeasurement,
    detectorReport: current,
    rootDir: ROOT,
  });

  assert.equal(report.summary.grandfatheredCount, 1);
  assert.equal(report.summary.newDriftCount, 1);
  assert.equal(report.classifications.newDrift[0]?.occurrence, 2);
});

test("boundary or coverage-less findings remain informational", () => {
  const accepted = makeDetectorReport([makeFinding({ ruleId: "R-RET-001", lId: "L0", matched: "lead" })]);
  const acceptedMeasurement = runBe3Measurement({
    baseline: { errorFindingCount: 1, ref: "be3-evidence-baseline-v1.0" },
    detectorReport: accepted,
    detectorVersion: "be3-detector-v1.0",
  });
  const current = makeDetectorReport([
    makeFinding({ ruleId: "R-BND-001", lId: "BOUNDARY", matched: "buyer", severity: "info" }),
    makeFinding({ ruleId: "R-PLAT-001", lId: "L9", matched: "deal", severity: "error" }),
  ]);

  const report = runBe3Prevention({
    acceptedEvidence: accepted,
    acceptedMeasurement,
    detectorReport: current,
    rootDir: ROOT,
  });

  assert.equal(report.summary.informationalCount, 2);
  assert.equal(report.summary.newDriftCount, 0);
  assert.equal(report.summary.grandfatheredCount, 0);
});

test("compatibility mismatch suspends evaluation", () => {
  const report = runBe3Prevention({
    acceptedEvidence: ACCEPTED_EVIDENCE,
    acceptedMeasurement: ACCEPTED_MEASUREMENT,
    baselineTag: "be3-measurement-baseline-v1.1",
    detectorReport: ACCEPTED_EVIDENCE,
    detectorVersion: "be3-detector-v1.1",
    rootDir: ROOT,
  });

  assert.equal(report.mode, "suspended");
  assert.equal(report.compatibility.compatible, false);
  assert.ok(report.compatibility.reasons.includes("detectorVersion changed"));
  assert.ok(report.compatibility.reasons.includes("baselineTag changed"));
  assert.equal(report.reason, "Prevention baseline incompatible. New baseline acceptance required.");
  assert.equal(report.summary.totalEvaluatedFindings, 0);
});

test("prevention output is deterministic for unchanged inputs", () => {
  const first = stableStringifyPrevention(
    runBe3Prevention({
      acceptedEvidence: ACCEPTED_EVIDENCE,
      acceptedMeasurement: ACCEPTED_MEASUREMENT,
      detectorReport: ACCEPTED_EVIDENCE,
      rootDir: ROOT,
    }),
  );
  const second = stableStringifyPrevention(
    runBe3Prevention({
      acceptedEvidence: ACCEPTED_EVIDENCE,
      acceptedMeasurement: ACCEPTED_MEASUREMENT,
      detectorReport: ACCEPTED_EVIDENCE,
      rootDir: ROOT,
    }),
  );
  assert.equal(first, second);
});

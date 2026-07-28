import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import assert from "node:assert/strict";

import type { DetectorReport, Finding } from "../../../lib/governance/be3-language-detector";
import { runBe3Measurement, stableStringifyMeasurement } from "../../../lib/governance/be3-language-measure";

const ROOT = process.cwd();
const BASELINE_REPORT = JSON.parse(
  readFileSync(join(ROOT, "docs/business/evolution/be-3/evidence/BE3-EVIDENCE-BASELINE-v1.0.json"), "utf8"),
) as DetectorReport;

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

  for (const finding of errorFindings) {
    byLId.set(finding.lId, (byLId.get(finding.lId) ?? 0) + 1);
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
      config: { blob: "config-blob", path: "config/be3-language-detector.json" },
      glossary: { blob: "glossary-blob", path: "docs/business/evolution/be-3/CANONICAL_GLOSSARY.md" },
      rules: { blob: "rules-blob", path: "docs/business/evolution/be-3/LANGUAGE_RULES.md" },
      sourceCommit: null,
    },
    scope: {
      ignoredPathFragments: ["node_modules", "docs/"],
      includeExtensions: [".ts", ".tsx", ".prisma"],
    },
    summaries: {
      byLId: Array.from(byLId.entries()).map(([lId, count]) => ({ count, lId })),
      byRule: Array.from(byRule.values()),
    },
  };
}

test("measurement reconciles the accepted v1.0 baseline honestly", () => {
  const measurement = runBe3Measurement({ detectorReport: BASELINE_REPORT, detectorVersion: "be3-detector-v1.0", rootDir: ROOT });
  const l5 = measurement.byLId.find((row) => row.lId === "L5");

  assert.equal(measurement.repo.errorFindings, 117);
  assert.equal(measurement.repo.distinctDeviations, 19);
  assert.equal(measurement.repo.remediationSurface, 19);
  assert.equal(measurement.repo.burndownPct, 0);
  assert.ok(measurement.repo.scannedSloc !== null && measurement.repo.scannedSloc > 0);
  assert.ok(measurement.repo.densityPerKSloc !== null && measurement.repo.densityPerKSloc > 0);
  assert.ok(measurement.measurementSeriesId.length > 20);
  assert.equal(measurement.compatibleWithPrevious, null);
  assert.equal(measurement.trend, null);
  assert.ok(l5);
  assert.equal(l5?.findings, 70);
  assert.equal(l5?.distinctMatched, 7);
  assert.equal(l5?.remediationSurface, 7);
});

test("measurement output is deterministic for unchanged input", () => {
  const first = stableStringifyMeasurement(runBe3Measurement({ detectorReport: BASELINE_REPORT, detectorVersion: "be3-detector-v1.0", rootDir: ROOT }));
  const second = stableStringifyMeasurement(runBe3Measurement({ detectorReport: BASELINE_REPORT, detectorVersion: "be3-detector-v1.0", rootDir: ROOT }));
  assert.equal(first, second);
});

test("compatible measurements compute a bounded trend within one series", () => {
  const previousMeasurement = runBe3Measurement({
    baseline: { errorFindingCount: 2, ref: "baseline-v1" },
    detectorReport: makeDetectorReport([
      makeFinding({ matched: "target" }),
      makeFinding({ file: "app/other.ts", line: 2, matched: "lead", ruleId: "R-RET-001", lId: "L0", glossaryTerm: "Seller" }),
    ]),
    detectorVersion: "be3-detector-v1.0",
  });

  const currentMeasurement = runBe3Measurement({
    baseline: { errorFindingCount: 2, ref: "baseline-v1" },
    detectorReport: makeDetectorReport([makeFinding({ matched: "target" })]),
    detectorVersion: "be3-detector-v1.0",
    previousMeasurement,
  });

  assert.equal(currentMeasurement.compatibleWithPrevious, true);
  assert.equal(currentMeasurement.reason, null);
  assert.notEqual(currentMeasurement.trend, null);
  assert.notEqual(currentMeasurement.trend, "unavailable");
  if (currentMeasurement.trend && currentMeasurement.trend !== "unavailable") {
    assert.equal(currentMeasurement.trend.deltaErrorFindings, -1);
    assert.equal(currentMeasurement.trend.previousErrorFindings, 2);
    assert.equal(currentMeasurement.trend.previousBurndownPct, 0);
    assert.equal(currentMeasurement.trend.deltaBurndownPct, 0.5);
    assert.equal(currentMeasurement.trend.direction, "improved");
  }
});

test("series compatibility contract blocks cross-series trends", () => {
  const previousMeasurement = runBe3Measurement({
    detectorReport: makeDetectorReport([makeFinding({ matched: "target" })]),
    detectorVersion: "be3-detector-v1.0",
  });

  const currentMeasurement = runBe3Measurement({
    detectorReport: makeDetectorReport([makeFinding({ matched: "target" })]),
    detectorVersion: "be3-detector-v1.1",
    previousMeasurement,
  });

  assert.equal(currentMeasurement.compatibleWithPrevious, false);
  assert.deepEqual(currentMeasurement.compatibilityReasons, ["detectorVersion changed"]);
  assert.equal(currentMeasurement.trend, "unavailable");
  assert.equal(currentMeasurement.reason, "measurement series changed; new baseline required");
});

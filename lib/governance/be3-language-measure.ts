import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";

import type { DetectorReport, Finding } from "@/lib/governance/be3-language-detector";

type MeasurementBaseline = {
  errorFindingCount: number;
  ref: string;
};

type MeasurementSeries = {
  detectorVersion: string;
  ruleSetHash: string;
  scopeHash: string;
};

type MeasurementRuleSummary = {
  distinctFiles: number;
  distinctMatched: number;
  findings: number;
  lId: string;
  ruleId: string;
};

type MeasurementLIdSummary = {
  distinctFiles: number;
  distinctMatched: number;
  findings: number;
  lId: string;
  remediationSurface: number;
  sharePct: number;
};

type MeasurementTrend = {
  deltaBurndownPct: number;
  deltaErrorFindings: number;
  direction: "improved" | "regressed" | "unchanged";
  previousBurndownPct: number;
  previousErrorFindings: number;
};

type MeasurementReport = {
  baseline: MeasurementBaseline;
  byLId: MeasurementLIdSummary[];
  byRule: MeasurementRuleSummary[];
  compatibilityReasons: string[];
  compatibleWithPrevious: boolean | null;
  measurementSeriesId: string;
  measurementSpec: "BE3-MEASURE-v1";
  previousSeriesId: string | null;
  provenance: {
    detectorReportDigest: string;
    previousMeasurementDigest: string | null;
  };
  reason: string | null;
  repo: {
    burndownPct: number;
    densityPerKSloc: number | null;
    distinctDeviations: number;
    distinctFiles: number;
    errorFindings: number;
    remediationSurface: number;
    scannedSloc: number | null;
  };
  scannedCommit: string | null;
  series: MeasurementSeries;
  trend: MeasurementTrend | "unavailable" | null;
};

type RunMeasurementOptions = {
  baseline?: MeasurementBaseline;
  detectorReport: DetectorReport;
  detectorVersion?: string;
  previousMeasurement?: MeasurementReport;
  rootDir?: string;
};

const DEFAULT_BASELINE: MeasurementBaseline = {
  errorFindingCount: 117,
  ref: "be3-evidence-baseline-v1.0",
};
const DEFAULT_DETECTOR_VERSION = "be3-detector-v1.0";
const INCOMPATIBLE_SERIES_REASON = "measurement series changed; new baseline required";

function sha256(value: string) {
  return createHash("sha256").update(value).digest("hex");
}

function roundMetric(value: number, decimals = 6) {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}

function compareLId(a: string, b: string) {
  const left = Number.parseInt(a.replace(/^L/, ""), 10);
  const right = Number.parseInt(b.replace(/^L/, ""), 10);
  if (Number.isNaN(left) || Number.isNaN(right)) return a.localeCompare(b);
  return left - right;
}

function sortKeysDeep(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortKeysDeep);
  if (!value || typeof value !== "object") return value;
  const record = value as Record<string, unknown>;
  return Object.fromEntries(Object.keys(record).sort().map((key) => [key, sortKeysDeep(record[key])]));
}

function stableJson(value: unknown) {
  return `${JSON.stringify(sortKeysDeep(value), null, 2)}\n`;
}

function normalizePath(path: string) {
  return path.replace(/\\/g, "/");
}

function shouldIgnore(path: string, ignoredPathFragments: string[]) {
  const normalized = `/${normalizePath(path).replace(/^\//, "")}`;
  return ignoredPathFragments.some((fragment) => normalized.includes(fragment));
}

function gitValue(rootDir: string, args: string[]) {
  const result = spawnSync("git", args, { cwd: rootDir, encoding: "utf8" });
  if (result.status !== 0) return null;
  return result.stdout;
}

function countScannedSloc(rootDir: string, report: DetectorReport) {
  const commit = report.inputs.sourceCommit;
  if (!commit) return null;
  const listing = gitValue(rootDir, ["ls-tree", "-r", "--name-only", commit]);
  if (listing == null) return null;

  const paths = listing
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .filter((path) => report.scope.includeExtensions.some((extension) => path.endsWith(extension)))
    .filter((path) => !shouldIgnore(path, report.scope.ignoredPathFragments))
    .sort();

  let total = 0;
  for (const path of paths) {
    const file = gitValue(rootDir, ["show", `${commit}:${path}`]);
    if (file == null) return null;
    total += file.split(/\r?\n/).filter((line) => line.trim().length > 0).length;
  }
  return total;
}

function detectorRuleSetHash(report: DetectorReport) {
  return sha256(
    stableJson({
      config: report.inputs.config.blob,
      glossary: report.inputs.glossary.blob,
      rules: report.inputs.rules.blob,
    }),
  );
}

function detectorScopeHash(report: DetectorReport) {
  return sha256(
    stableJson({
      ignoredPathFragments: [...report.scope.ignoredPathFragments].sort(),
      includeExtensions: [...report.scope.includeExtensions].sort(),
    }),
  );
}

function measurementSeriesId(series: MeasurementSeries, baseline: MeasurementBaseline) {
  return sha256(
    stableJson({
      baseline,
      detectorVersion: series.detectorVersion,
      ruleSetHash: series.ruleSetHash,
      scopeHash: series.scopeHash,
    }),
  );
}

function summarizeByRule(findings: Finding[]) {
  const buckets = new Map<string, { files: Set<string>; lId: string; matched: Set<string>; ruleId: string; findings: number }>();
  for (const finding of findings) {
    const bucket = buckets.get(finding.ruleId) ?? {
      files: new Set<string>(),
      findings: 0,
      lId: finding.lId,
      matched: new Set<string>(),
      ruleId: finding.ruleId,
    };
    bucket.findings += 1;
    bucket.files.add(finding.file);
    bucket.matched.add(finding.matched);
    buckets.set(finding.ruleId, bucket);
  }
  return Array.from(buckets.values())
    .map((bucket) => ({
      distinctFiles: bucket.files.size,
      distinctMatched: bucket.matched.size,
      findings: bucket.findings,
      lId: bucket.lId,
      ruleId: bucket.ruleId,
    }))
    .sort((a, b) => a.ruleId.localeCompare(b.ruleId));
}

function summarizeByLId(findings: Finding[]) {
  const buckets = new Map<string, { deviations: Set<string>; files: Set<string>; findings: number; lId: string; matched: Set<string> }>();
  for (const finding of findings) {
    const bucket = buckets.get(finding.lId) ?? {
      deviations: new Set<string>(),
      files: new Set<string>(),
      findings: 0,
      lId: finding.lId,
      matched: new Set<string>(),
    };
    bucket.findings += 1;
    bucket.files.add(finding.file);
    bucket.matched.add(finding.matched);
    bucket.deviations.add(`${finding.ruleId}|${finding.matched}`);
    buckets.set(finding.lId, bucket);
  }

  const totalRemediationSurface = Array.from(buckets.values()).reduce((sum, bucket) => sum + bucket.deviations.size, 0);
  return Array.from(buckets.values())
    .map((bucket) => ({
      distinctFiles: bucket.files.size,
      distinctMatched: bucket.matched.size,
      findings: bucket.findings,
      lId: bucket.lId,
      remediationSurface: bucket.deviations.size,
      sharePct: totalRemediationSurface === 0 ? 0 : roundMetric((bucket.deviations.size / totalRemediationSurface) * 100),
    }))
    .sort((a, b) => compareLId(a.lId, b.lId));
}

function compatibilityReasons(current: MeasurementReport, previous: MeasurementReport) {
  const reasons: string[] = [];
  if (current.series.detectorVersion !== previous.series.detectorVersion) reasons.push("detectorVersion changed");
  if (current.series.ruleSetHash !== previous.series.ruleSetHash) reasons.push("ruleSetHash changed");
  if (current.series.scopeHash !== previous.series.scopeHash) reasons.push("scopeHash changed");
  if (
    current.baseline.ref !== previous.baseline.ref ||
    current.baseline.errorFindingCount !== previous.baseline.errorFindingCount
  ) {
    reasons.push("baseline changed");
  }
  return reasons;
}

function computeTrend(current: MeasurementReport, previous: MeasurementReport): MeasurementTrend {
  const deltaErrorFindings = current.repo.errorFindings - previous.repo.errorFindings;
  const deltaBurndownPct = roundMetric(current.repo.burndownPct - previous.repo.burndownPct);
  return {
    deltaBurndownPct,
    deltaErrorFindings,
    direction: deltaErrorFindings === 0 ? "unchanged" : deltaErrorFindings < 0 ? "improved" : "regressed",
    previousBurndownPct: previous.repo.burndownPct,
    previousErrorFindings: previous.repo.errorFindings,
  };
}

export function runBe3Measurement(options: RunMeasurementOptions): MeasurementReport {
  const detectorReport = options.detectorReport;
  const rootDir = resolve(options.rootDir ?? process.cwd());
  const baseline = options.baseline ?? DEFAULT_BASELINE;
  const detectorVersion = options.detectorVersion ?? DEFAULT_DETECTOR_VERSION;
  const errorFindings = detectorReport.findings.filter((finding) => finding.severity === "error");
  const byRule = summarizeByRule(errorFindings);
  const byLId = summarizeByLId(errorFindings);
  const distinctDeviationKeys = new Set(errorFindings.map((finding) => `${finding.ruleId}|${finding.matched}`));
  const distinctFiles = new Set(errorFindings.map((finding) => finding.file));
  const scannedSloc = countScannedSloc(rootDir, detectorReport);
  const burndownPct = baseline.errorFindingCount === 0 ? 0 : roundMetric((baseline.errorFindingCount - errorFindings.length) / baseline.errorFindingCount);
  const series: MeasurementSeries = {
    detectorVersion,
    ruleSetHash: detectorRuleSetHash(detectorReport),
    scopeHash: detectorScopeHash(detectorReport),
  };

  const report: MeasurementReport = {
    baseline,
    byLId,
    byRule,
    compatibilityReasons: [],
    compatibleWithPrevious: null,
    measurementSeriesId: measurementSeriesId(series, baseline),
    measurementSpec: "BE3-MEASURE-v1",
    previousSeriesId: null,
    provenance: {
      detectorReportDigest: sha256(stableJson(detectorReport)),
      previousMeasurementDigest: null,
    },
    reason: null,
    repo: {
      burndownPct,
      densityPerKSloc: scannedSloc && scannedSloc > 0 ? roundMetric((errorFindings.length / scannedSloc) * 1000) : null,
      distinctDeviations: distinctDeviationKeys.size,
      distinctFiles: distinctFiles.size,
      errorFindings: errorFindings.length,
      remediationSurface: distinctDeviationKeys.size,
      scannedSloc,
    },
    scannedCommit: detectorReport.inputs.sourceCommit,
    series,
    trend: null,
  };

  if (options.previousMeasurement) {
    const previous = options.previousMeasurement;
    const reasons = compatibilityReasons(report, previous);
    report.compatibilityReasons = reasons;
    report.compatibleWithPrevious = reasons.length === 0;
    report.previousSeriesId = previous.measurementSeriesId;
    report.provenance.previousMeasurementDigest = sha256(stableJson(previous));
    if (reasons.length === 0) {
      report.trend = computeTrend(report, previous);
    } else {
      report.trend = "unavailable";
      report.reason = INCOMPATIBLE_SERIES_REASON;
    }
  }

  return report;
}

export function stableStringifyMeasurement(report: MeasurementReport) {
  return stableJson(report);
}

export function renderMeasurementReport(report: MeasurementReport) {
  const lines = [
    "BE3-MEASURE · Phase 2 measurement report",
    `Scanned commit: ${report.scannedCommit ?? "unknown"}`,
    `Detector version: ${report.series.detectorVersion}`,
    `Measurement series: ${report.measurementSeriesId}`,
    `Baseline: ${report.baseline.ref} (${report.baseline.errorFindingCount} error findings)` ,
    "",
    "Repository summary:",
    `- Error findings: ${report.repo.errorFindings}`,
    `- Distinct deviations: ${report.repo.distinctDeviations}`,
    `- Distinct files: ${report.repo.distinctFiles}`,
    `- Remediation surface: ${report.repo.remediationSurface}`,
    `- Burndown vs baseline: ${report.repo.burndownPct}`,
    `- Violation density per 1k SLOC: ${report.repo.densityPerKSloc ?? "unavailable"}`,
    `- Scanned SLOC: ${report.repo.scannedSloc ?? "unavailable"}`,
    "",
    "Series compatibility:",
    report.compatibleWithPrevious == null
      ? "- No previous measurement supplied."
      : report.compatibleWithPrevious
        ? "- Compatible with previous measurement."
        : `- Trend unavailable — ${report.reason}`,
    ...(report.compatibilityReasons.length > 0
      ? report.compatibilityReasons.map((reason) => `  - ${reason}`)
      : []),
    ...(report.trend && report.trend !== "unavailable"
      ? [
          `- Previous error findings: ${report.trend.previousErrorFindings}`,
          `- Delta error findings: ${report.trend.deltaErrorFindings}`,
          `- Previous burndown: ${report.trend.previousBurndownPct}`,
          `- Delta burndown: ${report.trend.deltaBurndownPct}`,
          `- Direction: ${report.trend.direction}`,
        ]
      : []),
    "",
    "By rule:",
    ...report.byRule.map((row) => `- ${row.ruleId} (${row.lId}) · findings=${row.findings} distinctMatched=${row.distinctMatched} distinctFiles=${row.distinctFiles}`),
    "",
    "By L-ID:",
    ...report.byLId.map((row) => `- ${row.lId} · findings=${row.findings} distinctMatched=${row.distinctMatched} remediationSurface=${row.remediationSurface} distinctFiles=${row.distinctFiles} sharePct=${row.sharePct}`),
  ];
  return `${lines.join("\n")}\n`;
}

export function writeMeasurementArtifacts(report: MeasurementReport, options: { jsonPath?: string; markdownPath?: string }) {
  if (options.jsonPath) {
    mkdirSync(dirname(options.jsonPath), { recursive: true });
    writeFileSync(options.jsonPath, stableStringifyMeasurement(report), "utf8");
  }
  if (options.markdownPath) {
    mkdirSync(dirname(options.markdownPath), { recursive: true });
    writeFileSync(options.markdownPath, renderMeasurementReport(report), "utf8");
  }
}

export type { MeasurementReport, MeasurementTrend };

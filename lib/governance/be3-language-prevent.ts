import { createHash } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

import type { DetectorReport, Finding } from "@/lib/governance/be3-language-detector";
import { runBe3Measurement } from "@/lib/governance/be3-language-measure";
import type { MeasurementReport } from "@/lib/governance/be3-language-measure";

type PreventMode = "advisory" | "suspended";
type Classification = "grandfathered" | "informational" | "new-drift";

type PreventionFinding = Finding & {
  baselineCount: number;
  classification: Classification;
  currentCount: number;
  enforceable: boolean;
  occurrence: number;
};

type PreventionKeySummary = {
  baselineCount: number;
  currentCount: number;
  file: string;
  grandfatheredCount: number;
  matched: string;
  newDriftCount: number;
  ruleId: string;
};

type PreventionRuleSummary = {
  classification: Classification;
  count: number;
  ruleId: string;
};

type PreventionReport = {
  acceptedMeasurementSeriesId: string;
  baselineTag: string;
  classifications: {
    grandfathered: PreventionFinding[];
    informational: PreventionFinding[];
    newDrift: PreventionFinding[];
  };
  compatibility: {
    compatible: boolean;
    reasons: string[];
  };
  enforceableRuleIds: string[];
  mode: PreventMode;
  preventionSpec: "BE3-PREVENT-v1";
  provenance: {
    acceptedEvidenceDigest: string;
    acceptedMeasurementDigest: string;
    currentDetectorDigest: string;
  };
  reason: string | null;
  summary: {
    grandfatheredCount: number;
    informationalCount: number;
    newDriftCount: number;
    totalEvaluatedFindings: number;
  };
  summaries: {
    byKey: PreventionKeySummary[];
    byRule: PreventionRuleSummary[];
  };
};

type RunPreventionOptions = {
  acceptedEvidence: DetectorReport;
  acceptedMeasurement: MeasurementReport;
  baselineTag?: string;
  detectorReport: DetectorReport;
  detectorVersion?: string;
  rootDir?: string;
};

const DEFAULT_BASELINE_TAG = "be3-measurement-baseline-v1.0";
const DEFAULT_DETECTOR_VERSION = "be3-detector-v1.0";
const INCOMPATIBLE_REASON = "Prevention baseline incompatible. New baseline acceptance required.";

function sha256(value: string) {
  return createHash("sha256").update(value).digest("hex");
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

function findingKey(finding: Finding) {
  return `${finding.ruleId}|${finding.file}|${finding.matched}`;
}

function countByKey(findings: Finding[]) {
  const counts = new Map<string, number>();
  for (const finding of findings) {
    const key = findingKey(finding);
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return counts;
}

function summarizeByRule(findings: PreventionFinding[]) {
  const counts = new Map<string, number>();
  for (const finding of findings) counts.set(finding.ruleId, (counts.get(finding.ruleId) ?? 0) + 1);
  return Array.from(counts.entries())
    .map(([ruleId, count]) => ({ classification: findings[0]?.classification ?? "informational", count, ruleId }))
    .sort((a, b) => a.ruleId.localeCompare(b.ruleId));
}

function keySummary(findings: PreventionFinding[]) {
  const keys = new Map<string, PreventionKeySummary>();
  for (const finding of findings) {
    const key = findingKey(finding);
    const summary = keys.get(key) ?? {
      baselineCount: finding.baselineCount,
      currentCount: finding.currentCount,
      file: finding.file,
      grandfatheredCount: 0,
      matched: finding.matched,
      newDriftCount: 0,
      ruleId: finding.ruleId,
    };
    if (finding.classification === "grandfathered") summary.grandfatheredCount += 1;
    if (finding.classification === "new-drift") summary.newDriftCount += 1;
    keys.set(key, summary);
  }
  return Array.from(keys.values()).sort((a, b) => a.ruleId.localeCompare(b.ruleId) || a.file.localeCompare(b.file) || a.matched.localeCompare(b.matched));
}

export function runBe3Prevention(options: RunPreventionOptions): PreventionReport {
  const baselineTag = options.baselineTag ?? DEFAULT_BASELINE_TAG;
  const detectorVersion = options.detectorVersion ?? DEFAULT_DETECTOR_VERSION;
  const currentMeasurement = runBe3Measurement({
    baseline: options.acceptedMeasurement.baseline,
    detectorReport: options.detectorReport,
    detectorVersion,
    rootDir: options.rootDir,
  });

  const compatibilityReasons: string[] = [];
  if (detectorVersion !== options.acceptedMeasurement.series.detectorVersion) compatibilityReasons.push("detectorVersion changed");
  if (currentMeasurement.series.ruleSetHash !== options.acceptedMeasurement.series.ruleSetHash) compatibilityReasons.push("ruleSetHash changed");
  if (currentMeasurement.series.scopeHash !== options.acceptedMeasurement.series.scopeHash) compatibilityReasons.push("scopeHash changed");
  if (currentMeasurement.measurementSeriesId !== options.acceptedMeasurement.measurementSeriesId) compatibilityReasons.push("measurementSeriesId changed");
  if (baselineTag !== DEFAULT_BASELINE_TAG) compatibilityReasons.push("baselineTag changed");

  const report: PreventionReport = {
    acceptedMeasurementSeriesId: options.acceptedMeasurement.measurementSeriesId,
    baselineTag,
    classifications: {
      grandfathered: [],
      informational: [],
      newDrift: [],
    },
    compatibility: {
      compatible: compatibilityReasons.length === 0,
      reasons: compatibilityReasons,
    },
    enforceableRuleIds: options.acceptedMeasurement.byRule.map((row) => row.ruleId).sort(),
    mode: compatibilityReasons.length === 0 ? "advisory" : "suspended",
    preventionSpec: "BE3-PREVENT-v1",
    provenance: {
      acceptedEvidenceDigest: sha256(stableJson(options.acceptedEvidence)),
      acceptedMeasurementDigest: sha256(stableJson(options.acceptedMeasurement)),
      currentDetectorDigest: sha256(stableJson(options.detectorReport)),
    },
    reason: compatibilityReasons.length === 0 ? null : INCOMPATIBLE_REASON,
    summary: {
      grandfatheredCount: 0,
      informationalCount: 0,
      newDriftCount: 0,
      totalEvaluatedFindings: 0,
    },
    summaries: {
      byKey: [],
      byRule: [],
    },
  };

  if (compatibilityReasons.length > 0) return report;

  const enforceable = new Set(report.enforceableRuleIds);
  const baselineCounts = countByKey(options.acceptedEvidence.findings.filter((finding) => finding.severity === "error"));
  const currentCounts = countByKey(options.detectorReport.findings.filter((finding) => finding.severity === "error"));
  const seenCounts = new Map<string, number>();

  for (const finding of options.detectorReport.findings) {
    const key = findingKey(finding);
    const currentCount = currentCounts.get(key) ?? 0;
    const baselineCount = baselineCounts.get(key) ?? 0;
    const occurrence = (seenCounts.get(key) ?? 0) + 1;
    seenCounts.set(key, occurrence);
    const enforceableRule = finding.severity === "error" && enforceable.has(finding.ruleId);

    let classification: Classification;
    if (!enforceableRule) {
      classification = "informational";
    } else if (occurrence <= baselineCount) {
      classification = "grandfathered";
    } else {
      classification = "new-drift";
    }

    const enriched: PreventionFinding = {
      ...finding,
      baselineCount,
      classification,
      currentCount,
      enforceable: enforceableRule,
      occurrence,
    };

    if (classification === "grandfathered") report.classifications.grandfathered.push(enriched);
    if (classification === "informational") report.classifications.informational.push(enriched);
    if (classification === "new-drift") report.classifications.newDrift.push(enriched);
  }

  report.summary = {
    grandfatheredCount: report.classifications.grandfathered.length,
    informationalCount: report.classifications.informational.length,
    newDriftCount: report.classifications.newDrift.length,
    totalEvaluatedFindings:
      report.classifications.grandfathered.length +
      report.classifications.informational.length +
      report.classifications.newDrift.length,
  };

  report.summaries.byKey = keySummary([...report.classifications.grandfathered, ...report.classifications.newDrift]);
  report.summaries.byRule = [
    ...summarizeByRule(report.classifications.grandfathered),
    ...summarizeByRule(report.classifications.newDrift),
    ...summarizeByRule(report.classifications.informational),
  ].sort((a, b) => a.classification.localeCompare(b.classification) || a.ruleId.localeCompare(b.ruleId));

  return report;
}

export function stableStringifyPrevention(report: PreventionReport) {
  return stableJson(report);
}

export function renderPreventionReport(report: PreventionReport) {
  const lines = [
    "BE3-PREVENT · Phase 3 advisory prevention report",
    `Mode: ${report.mode}`,
    `Baseline tag: ${report.baselineTag}`,
    `Accepted measurement series: ${report.acceptedMeasurementSeriesId}`,
    report.reason ? `Reason: ${report.reason}` : "Reason: compatible advisory evaluation",
    "",
    "Summary:",
    `- Grandfathered findings: ${report.summary.grandfatheredCount}`,
    `- New drift findings: ${report.summary.newDriftCount}`,
    `- Informational findings: ${report.summary.informationalCount}`,
    `- Total evaluated findings: ${report.summary.totalEvaluatedFindings}`,
    "",
    "Compatibility:",
    `- Compatible: ${report.compatibility.compatible}`,
    ...(report.compatibility.reasons.length > 0 ? report.compatibility.reasons.map((reason) => `  - ${reason}`) : ["- No compatibility issues detected."]),
    "",
    "New drift:",
    ...(report.classifications.newDrift.length > 0
      ? report.classifications.newDrift.map((finding) => `- ${finding.ruleId} ${finding.file}:${finding.line} → ${finding.matched} (occurrence ${finding.occurrence}/${finding.currentCount}, baseline ${finding.baselineCount})`)
      : ["- None."]),
    "",
    "Grandfathered:",
    ...(report.classifications.grandfathered.length > 0
      ? report.classifications.grandfathered.map((finding) => `- ${finding.ruleId} ${finding.file}:${finding.line} → ${finding.matched}`)
      : ["- None."]),
    "",
    "Informational:",
    ...(report.classifications.informational.length > 0
      ? report.classifications.informational.map((finding) => `- ${finding.ruleId} ${finding.file}:${finding.line} → ${finding.matched}`)
      : ["- None."]),
  ];
  return `${lines.join("\n")}\n`;
}

export function writePreventionArtifacts(report: PreventionReport, options: { jsonPath?: string; markdownPath?: string }) {
  if (options.jsonPath) {
    mkdirSync(dirname(options.jsonPath), { recursive: true });
    writeFileSync(options.jsonPath, stableStringifyPrevention(report), "utf8");
  }
  if (options.markdownPath) {
    mkdirSync(dirname(options.markdownPath), { recursive: true });
    writeFileSync(options.markdownPath, renderPreventionReport(report), "utf8");
  }
}

export type { PreventionReport, PreventionFinding };

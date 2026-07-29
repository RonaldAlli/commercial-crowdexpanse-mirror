import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import type { DetectorReport } from "@/lib/governance/be3-language-detector";
import { renderPreventionReport, runBe3Prevention, stableStringifyPrevention, writePreventionArtifacts } from "@/lib/governance/be3-language-prevent";
import type { MeasurementReport } from "@/lib/governance/be3-language-measure";

type CliOptions = {
  acceptedEvidencePath: string;
  acceptedMeasurementPath: string;
  baselineTag: string;
  detectorVersion: string;
  format: "json" | "text";
  inputPath: string;
  jsonOut?: string;
  markdownOut?: string;
  rootDir?: string;
};

const DEFAULT_BASELINE_TAG = "be3-measurement-baseline-v1.0";
const DEFAULT_EVIDENCE = "docs/business/evolution/be-3/evidence/BE3-EVIDENCE-BASELINE-v1.0.json";
const DEFAULT_MEASUREMENT = "docs/business/evolution/be-3/measurement/BE3-MEASUREMENT-BASELINE-v1.0.json";

function parseArgs(argv: string[]): CliOptions {
  const out: CliOptions = {
    acceptedEvidencePath: DEFAULT_EVIDENCE,
    acceptedMeasurementPath: DEFAULT_MEASUREMENT,
    baselineTag: DEFAULT_BASELINE_TAG,
    detectorVersion: "be3-detector-v1.0",
    format: "text",
    inputPath: DEFAULT_EVIDENCE,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    const value = argv[index + 1];
    if (arg === "--format") {
      if (value !== "json" && value !== "text") throw new Error(`Unsupported format: ${value}`);
      out.format = value;
      index += 1;
      continue;
    }
    if (arg === "--input") {
      out.inputPath = value;
      index += 1;
      continue;
    }
    if (arg === "--accepted-evidence") {
      out.acceptedEvidencePath = value;
      index += 1;
      continue;
    }
    if (arg === "--accepted-measurement") {
      out.acceptedMeasurementPath = value;
      index += 1;
      continue;
    }
    if (arg === "--baseline-tag") {
      out.baselineTag = value;
      index += 1;
      continue;
    }
    if (arg === "--detector-version") {
      out.detectorVersion = value;
      index += 1;
      continue;
    }
    if (arg === "--json-out") {
      out.jsonOut = value;
      index += 1;
      continue;
    }
    if (arg === "--markdown-out") {
      out.markdownOut = value;
      index += 1;
      continue;
    }
    if (arg === "--root") {
      out.rootDir = value;
      index += 1;
      continue;
    }
    throw new Error(`Unknown argument: ${arg}`);
  }

  return out;
}

function readJsonFile<T>(path: string) {
  return JSON.parse(readFileSync(resolve(path), "utf8")) as T;
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const detectorReport = readJsonFile<DetectorReport>(args.inputPath);
  const acceptedEvidence = readJsonFile<DetectorReport>(args.acceptedEvidencePath);
  const acceptedMeasurement = readJsonFile<MeasurementReport>(args.acceptedMeasurementPath);
  const report = runBe3Prevention({
    acceptedEvidence,
    acceptedMeasurement,
    baselineTag: args.baselineTag,
    detectorReport,
    detectorVersion: args.detectorVersion,
    rootDir: args.rootDir ? resolve(args.rootDir) : process.cwd(),
  });

  writePreventionArtifacts(report, {
    jsonPath: args.jsonOut ? resolve(args.jsonOut) : undefined,
    markdownPath: args.markdownOut ? resolve(args.markdownOut) : undefined,
  });

  process.stdout.write(args.format === "json" ? stableStringifyPrevention(report) : renderPreventionReport(report));
}

main();

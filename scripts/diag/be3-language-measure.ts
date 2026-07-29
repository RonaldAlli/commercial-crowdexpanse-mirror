import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import type { DetectorReport } from "@/lib/governance/be3-language-detector";
import { renderMeasurementReport, runBe3Measurement, stableStringifyMeasurement, writeMeasurementArtifacts } from "@/lib/governance/be3-language-measure";

type CliOptions = {
  baselineErrors: number;
  baselineRef: string;
  detectorVersion: string;
  format: "json" | "text";
  inputPath: string;
  jsonOut?: string;
  markdownOut?: string;
  previousPath?: string;
  rootDir?: string;
};

const DEFAULT_INPUT = "docs/business/evolution/be-3/evidence/BE3-EVIDENCE-BASELINE-v1.0.json";

function parseArgs(argv: string[]): CliOptions {
  const out: CliOptions = {
    baselineErrors: 117,
    baselineRef: "be3-evidence-baseline-v1.0",
    detectorVersion: "be3-detector-v1.0",
    format: "text",
    inputPath: DEFAULT_INPUT,
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
    if (arg === "--previous") {
      out.previousPath = value;
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
    if (arg === "--detector-version") {
      out.detectorVersion = value;
      index += 1;
      continue;
    }
    if (arg === "--baseline-ref") {
      out.baselineRef = value;
      index += 1;
      continue;
    }
    if (arg === "--baseline-errors") {
      out.baselineErrors = Number.parseInt(value, 10);
      if (!Number.isFinite(out.baselineErrors)) throw new Error(`Invalid --baseline-errors: ${value}`);
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
  const previousMeasurement = args.previousPath
    ? readJsonFile<NonNullable<Parameters<typeof runBe3Measurement>[0]["previousMeasurement"]>>(args.previousPath)
    : undefined;
  const report = runBe3Measurement({
    baseline: {
      errorFindingCount: args.baselineErrors,
      ref: args.baselineRef,
    },
    detectorReport,
    detectorVersion: args.detectorVersion,
    previousMeasurement,
    rootDir: args.rootDir ? resolve(args.rootDir) : process.cwd(),
  });

  writeMeasurementArtifacts(report, {
    jsonPath: args.jsonOut ? resolve(args.jsonOut) : undefined,
    markdownPath: args.markdownOut ? resolve(args.markdownOut) : undefined,
  });

  process.stdout.write(args.format === "json" ? stableStringifyMeasurement(report) : renderMeasurementReport(report));
}

main();

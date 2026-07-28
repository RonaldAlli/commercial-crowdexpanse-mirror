import { resolve } from "node:path";

import { renderHumanReport, runBe3Detector, stableStringifyReport, writeDetectorArtifacts } from "@/lib/governance/be3-language-detector";

type CliOptions = {
  format: "json" | "text";
  jsonOut?: string;
  markdownOut?: string;
  rootDir?: string;
};

function parseArgs(argv: string[]): CliOptions {
  const out: CliOptions = { format: "text" };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--format") {
      const value = argv[index + 1];
      if (value !== "json" && value !== "text") throw new Error(`Unsupported format: ${value}`);
      out.format = value;
      index += 1;
      continue;
    }
    if (arg === "--json-out") {
      out.jsonOut = argv[index + 1];
      index += 1;
      continue;
    }
    if (arg === "--markdown-out") {
      out.markdownOut = argv[index + 1];
      index += 1;
      continue;
    }
    if (arg === "--root") {
      out.rootDir = argv[index + 1];
      index += 1;
      continue;
    }
    throw new Error(`Unknown argument: ${arg}`);
  }
  return out;
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const report = runBe3Detector({ rootDir: args.rootDir ? resolve(args.rootDir) : process.cwd() });
  writeDetectorArtifacts(report, {
    jsonPath: args.jsonOut ? resolve(args.jsonOut) : undefined,
    markdownPath: args.markdownOut ? resolve(args.markdownOut) : undefined,
  });
  process.stdout.write(args.format === "json" ? stableStringifyReport(report) : renderHumanReport(report));
}

main();

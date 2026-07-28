import { spawnSync } from "node:child_process";
import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, relative, resolve } from "node:path";

import detectorConfig from "@/config/be3-language-detector.json";

const GLOSSARY_PATH = "docs/business/evolution/be-3/CANONICAL_GLOSSARY.md";
const RULES_PATH = "docs/business/evolution/be-3/LANGUAGE_RULES.md";
const QUOTED_SEGMENT_RE = /(["'`])((?:\\.|(?!\1).)*)\1/g;
const JSX_TEXT_RE = />([^<>{}]+)</g;
const PRISMA_MODEL_RE = /^\s*model\s+(\w+)\s+\{/;
const PRISMA_ENUM_RE = /^\s*enum\s+(\w+)\s+\{/;

type ScannerMode = "line" | "quoted" | "jsx";

type DetectorConfig = {
  includeExtensions: string[];
  ignoredPathFragments: string[];
  scanners: ScannerDefinition[];
  glossaryTermOverrides?: Record<string, string>;
};

type ScannerDefinition = {
  ruleId: string;
  mode: ScannerMode;
  pattern: string;
  flags?: string;
  includePaths?: string[];
  excludePaths?: string[];
  allowList?: string[];
  prismaModel?: string;
};

type GlossaryEntry = {
  lId: string;
  canonicalTerm: string;
  deprecatedUsage: string;
  evidence: string;
  kind: string;
  layer: string;
};

type RuleEntry = {
  ruleId: string;
  word: string;
  allowedUse: string;
  forbiddenUse: string;
  lId: string;
  severity: "error" | "info";
};

type Finding = {
  confidence: number;
  file: string;
  glossaryTerm: string;
  lId: string;
  line: number;
  matched: string;
  ruleId: string;
  severity: "error" | "info";
};

type DetectorReport = {
  alignmentScore: {
    byLId: Array<{ count: number; lId: string }>;
    errorFindingCount: number;
    percentage: null;
    phase: "Phase 1 input only";
  };
  detectorId: "BE3-DET";
  findings: Finding[];
  inputs: {
    config: { blob: string | null; path: string };
    glossary: { blob: string | null; path: string };
    rules: { blob: string | null; path: string };
    sourceCommit: string | null;
  };
  scope: {
    ignoredPathFragments: string[];
    includeExtensions: string[];
  };
  summaries: {
    byLId: Array<{ count: number; lId: string }>;
    byRule: Array<{ count: number; lId: string; ruleId: string; severity: "error" | "info" }>;
  };
};

type CompiledScanner = ScannerDefinition & {
  allowListPatterns: RegExp[];
  glossaryTerm: string;
  lId: string;
  regex: RegExp;
  severity: "error" | "info";
};

type ScanContext = {
  currentPrismaModel: string | null;
};

type RunOptions = {
  config?: DetectorConfig;
  glossaryMarkdown?: string;
  rootDir?: string;
  rulesMarkdown?: string;
};

function parseMarkdownTable(markdown: string, heading: string) {
  const lines = markdown.split(/\r?\n/);
  const headingIndex = lines.findIndex((line) => line.trim() === heading);
  if (headingIndex < 0) throw new Error(`Heading not found: ${heading}`);

  let index = headingIndex + 1;
  while (index < lines.length && !lines[index].trim().startsWith("|")) index += 1;
  if (index >= lines.length) throw new Error(`Table not found after heading: ${heading}`);

  const tableLines: string[] = [];
  while (index < lines.length && lines[index].trim().startsWith("|")) {
    tableLines.push(lines[index]);
    index += 1;
  }
  if (tableLines.length < 2) throw new Error(`Table under ${heading} is incomplete.`);

  const header = splitTableRow(tableLines[0]);
  const rows = tableLines.slice(2).map(splitTableRow).filter((row) => row.length === header.length);
  return rows.map((row) => Object.fromEntries(header.map((cell, idx) => [cell, row[idx]])));
}

function splitTableRow(line: string) {
  return line
    .trim()
    .replace(/^\|/, "")
    .replace(/\|$/, "")
    .split("|")
    .map((cell) => cell.trim());
}

function stripMarkdown(text: string) {
  return text.replace(/\*\*/g, "").replace(/\*/g, "").replace(/`/g, "").trim();
}

function canonicalGlossaryTerm(entry: GlossaryEntry, overrides: Record<string, string>) {
  const override = overrides[entry.lId];
  if (override) return override;
  const cleaned = stripMarkdown(entry.canonicalTerm)
    .replace(/\s*;.*$/, "")
    .replace(/\s*\(.*$/, "")
    .trim();
  return cleaned || entry.lId;
}

function parseGlossary(markdown: string): GlossaryEntry[] {
  return parseMarkdownTable(markdown, "## BE-3 operative scope — the vocabulary BE-3 is chartered to enforce").map((row) => ({
    lId: stripMarkdown(row.ID),
    canonicalTerm: row["Canonical (frozen §2)"],
    deprecatedUsage: row["Deprecated usage to retire"],
    evidence: row["Where (evidence)"],
    kind: row.Kind,
    layer: row.Layer,
  }));
}

function parseRules(markdown: string): RuleEntry[] {
  const scoped = parseMarkdownTable(markdown, "## Per-word usage rules (BE-3 scope — each maps to a glossary L-ID)").map((row) => ({
    ruleId: stripMarkdown(row["Rule ID"]),
    word: row.Word,
    allowedUse: row["Allowed use"],
    forbiddenUse: row["Forbidden use (→ violation)"],
    lId: stripMarkdown(row["L-ID"]),
    severity: normalizeSeverity(row.Severity),
  }));
  const boundary = parseMarkdownTable(markdown, "## Boundary rules (report-only — detector counts them, BE-3 does **not** action them)").map((row) => ({
    ruleId: stripMarkdown(row["Rule ID"]),
    word: row.Boundary,
    allowedUse: row.Owner,
    forbiddenUse: row.Boundary,
    lId: "BOUNDARY",
    severity: normalizeSeverity(row.Severity),
  }));
  return [...scoped, ...boundary];
}

function normalizeSeverity(raw: string): "error" | "info" {
  return /info/i.test(raw) ? "info" : "error";
}

function compileScanners(config: DetectorConfig, glossary: GlossaryEntry[], rules: RuleEntry[]): CompiledScanner[] {
  const glossaryMap = new Map(glossary.map((entry) => [entry.lId, entry]));
  const ruleMap = new Map(rules.map((entry) => [entry.ruleId, entry]));

  return config.scanners.map((scanner) => {
    const rule = ruleMap.get(scanner.ruleId);
    if (!rule) throw new Error(`Scanner references unknown rule: ${scanner.ruleId}`);
    const glossaryEntry = glossaryMap.get(rule.lId);
    const glossaryTerm = glossaryEntry ? canonicalGlossaryTerm(glossaryEntry, config.glossaryTermOverrides ?? {}) : rule.word;
    return {
      ...scanner,
      allowListPatterns: (scanner.allowList ?? []).map((pattern) => new RegExp(pattern, "i")),
      glossaryTerm,
      lId: rule.lId,
      regex: withGlobalFlag(scanner.pattern, scanner.flags),
      severity: rule.severity,
    };
  });
}

function withGlobalFlag(pattern: string, flags = "") {
  return new RegExp(pattern, flags.includes("g") ? flags : `${flags}g`);
}

function normalizePath(path: string) {
  return path.replace(/\\/g, "/");
}

function shouldIgnore(path: string, config: DetectorConfig) {
  const normalized = `/${normalizePath(path).replace(/^\//, "")}`;
  return config.ignoredPathFragments.some((fragment) => normalized.includes(fragment));
}

function matchesPath(path: string, fragments?: string[]) {
  if (!fragments || fragments.length === 0) return true;
  return fragments.some((fragment) => normalizePath(path).includes(fragment));
}

function listSourceFiles(rootDir: string, config: DetectorConfig): string[] {
  const out: string[] = [];

  function walk(dir: string) {
    for (const entry of readdirSync(dir, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
      const absolute = join(dir, entry.name);
      const relativePath = normalizePath(relative(rootDir, absolute));
      if (shouldIgnore(relativePath, config)) continue;
      if (entry.isDirectory()) {
        walk(absolute);
        continue;
      }
      if (!config.includeExtensions.some((extension) => relativePath.endsWith(extension))) continue;
      out.push(relativePath);
    }
  }

  walk(rootDir);
  return out.sort();
}

function updateScanContext(context: ScanContext, line: string) {
  const modelMatch = line.match(PRISMA_MODEL_RE);
  if (modelMatch) {
    context.currentPrismaModel = modelMatch[1];
    return;
  }
  if (line.match(PRISMA_ENUM_RE)) {
    context.currentPrismaModel = null;
    return;
  }
  if (line.trim() === "}") context.currentPrismaModel = null;
}

function isScannerActive(scanner: CompiledScanner, relativePath: string, context: ScanContext) {
  if (!matchesPath(relativePath, scanner.includePaths)) return false;
  if (scanner.excludePaths && matchesPath(relativePath, scanner.excludePaths)) return false;
  if (scanner.prismaModel && relativePath.endsWith(".prisma") && context.currentPrismaModel !== scanner.prismaModel) return false;
  return true;
}

function isAllowListed(scanner: CompiledScanner, haystacks: string[]) {
  return scanner.allowListPatterns.some((pattern) => haystacks.some((haystack) => pattern.test(haystack)));
}

function collectRegexMatches(text: string, regex: RegExp) {
  const matches: Array<{ index: number; matched: string }> = [];
  const pattern = new RegExp(regex.source, regex.flags);
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(text)) !== null) {
    matches.push({ index: match.index, matched: match[0] });
    if (match[0].length === 0) pattern.lastIndex += 1;
  }
  return matches;
}

function quotedSegments(line: string) {
  const segments: Array<{ index: number; text: string }> = [];
  let match: RegExpExecArray | null;
  const pattern = new RegExp(QUOTED_SEGMENT_RE.source, QUOTED_SEGMENT_RE.flags);
  while ((match = pattern.exec(line)) !== null) {
    segments.push({ index: match.index + 1, text: match[2] });
    if (match[0].length === 0) pattern.lastIndex += 1;
  }
  return segments;
}

function jsxSegments(line: string) {
  const segments: Array<{ index: number; text: string }> = [];
  let match: RegExpExecArray | null;
  const pattern = new RegExp(JSX_TEXT_RE.source, JSX_TEXT_RE.flags);
  while ((match = pattern.exec(line)) !== null) {
    const text = match[1].trim();
    if (text) segments.push({ index: match.index + 1, text });
    if (match[0].length === 0) pattern.lastIndex += 1;
  }
  return segments;
}

function scanLine(scanner: CompiledScanner, relativePath: string, line: string, lineNumber: number) {
  const findings: Finding[] = [];
  const seen = new Set<string>();

  if (scanner.mode === "line") {
    for (const match of collectRegexMatches(line, scanner.regex)) {
      if (isAllowListed(scanner, [match.matched, line, relativePath])) continue;
      const key = `${scanner.ruleId}|${relativePath}|${lineNumber}|${match.matched}`;
      if (seen.has(key)) continue;
      seen.add(key);
      findings.push({
        confidence: 1,
        file: relativePath,
        glossaryTerm: scanner.glossaryTerm,
        lId: scanner.lId,
        line: lineNumber,
        matched: match.matched,
        ruleId: scanner.ruleId,
        severity: scanner.severity,
      });
    }
    return findings;
  }

  const segments = scanner.mode === "quoted" ? quotedSegments(line) : jsxSegments(line);
  for (const segment of segments) {
    for (const match of collectRegexMatches(segment.text, scanner.regex)) {
      const matched = match.matched;
      if (isAllowListed(scanner, [matched, segment.text, relativePath])) continue;
      const key = `${scanner.ruleId}|${relativePath}|${lineNumber}|${matched}`;
      if (seen.has(key)) continue;
      seen.add(key);
      findings.push({
        confidence: 1,
        file: relativePath,
        glossaryTerm: scanner.glossaryTerm,
        lId: scanner.lId,
        line: lineNumber,
        matched,
        ruleId: scanner.ruleId,
        severity: scanner.severity,
      });
    }
  }

  return findings;
}

function summarizeFindings(findings: Finding[]) {
  const byRule = new Map<string, { count: number; lId: string; ruleId: string; severity: "error" | "info" }>();
  const byLId = new Map<string, { count: number; lId: string }>();

  for (const finding of findings) {
    const rule = byRule.get(finding.ruleId) ?? { count: 0, lId: finding.lId, ruleId: finding.ruleId, severity: finding.severity };
    rule.count += 1;
    byRule.set(finding.ruleId, rule);

    const l = byLId.get(finding.lId) ?? { count: 0, lId: finding.lId };
    l.count += 1;
    byLId.set(finding.lId, l);
  }

  const ruleRows = Array.from(byRule.values()).sort((a, b) => a.ruleId.localeCompare(b.ruleId));
  const lRows = Array.from(byLId.values()).sort((a, b) => compareLId(a.lId, b.lId));
  return { byRule: ruleRows, byLId: lRows };
}

function compareLId(a: string, b: string) {
  const left = Number.parseInt(a.replace(/^L/, ""), 10);
  const right = Number.parseInt(b.replace(/^L/, ""), 10);
  if (Number.isNaN(left) || Number.isNaN(right)) return a.localeCompare(b);
  return left - right;
}

function gitValue(rootDir: string, args: string[]) {
  const result = spawnSync("git", args, { cwd: rootDir, encoding: "utf8" });
  if (result.status !== 0) return null;
  return result.stdout.trim() || null;
}

function gitBlob(rootDir: string, path: string) {
  return gitValue(rootDir, ["rev-parse", `HEAD:${path}`]);
}

export function runBe3Detector(options: RunOptions = {}) {
  const rootDir = resolve(options.rootDir ?? process.cwd());
  const config = options.config ?? (detectorConfig as DetectorConfig);
  const glossaryMarkdown = options.glossaryMarkdown ?? readFileSync(join(rootDir, GLOSSARY_PATH), "utf8");
  const rulesMarkdown = options.rulesMarkdown ?? readFileSync(join(rootDir, RULES_PATH), "utf8");
  const glossary = parseGlossary(glossaryMarkdown);
  const rules = parseRules(rulesMarkdown);
  const scanners = compileScanners(config, glossary, rules);
  const findings: Finding[] = [];

  for (const relativePath of listSourceFiles(rootDir, config)) {
    const absolutePath = join(rootDir, relativePath);
    const content = readFileSync(absolutePath, "utf8");
    const lines = content.split(/\r?\n/);
    const context: ScanContext = { currentPrismaModel: null };

    for (let index = 0; index < lines.length; index += 1) {
      const line = lines[index];
      updateScanContext(context, line);
      const lineNumber = index + 1;
      for (const scanner of scanners) {
        if (!isScannerActive(scanner, relativePath, context)) continue;
        findings.push(...scanLine(scanner, relativePath, line, lineNumber));
      }
    }
  }

  findings.sort((a, b) => a.file.localeCompare(b.file) || a.line - b.line || a.ruleId.localeCompare(b.ruleId) || a.matched.localeCompare(b.matched));
  const summaries = summarizeFindings(findings);
  const errorFindings = findings.filter((finding) => finding.severity === "error");

  return {
    alignmentScore: {
      byLId: summarizeFindings(errorFindings).byLId,
      errorFindingCount: errorFindings.length,
      percentage: null,
      phase: "Phase 1 input only",
    },
    detectorId: "BE3-DET",
    findings,
    inputs: {
      config: { blob: gitBlob(rootDir, "config/be3-language-detector.json"), path: "config/be3-language-detector.json" },
      glossary: { blob: gitBlob(rootDir, GLOSSARY_PATH), path: GLOSSARY_PATH },
      rules: { blob: gitBlob(rootDir, RULES_PATH), path: RULES_PATH },
      sourceCommit: gitValue(rootDir, ["rev-parse", "HEAD"]),
    },
    scope: {
      ignoredPathFragments: [...config.ignoredPathFragments],
      includeExtensions: [...config.includeExtensions],
    },
    summaries,
  } satisfies DetectorReport;
}

function sortKeysDeep(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortKeysDeep);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(Object.keys(value as Record<string, unknown>).sort().map((key) => [key, sortKeysDeep((value as Record<string, unknown>)[key])]));
}

export function stableStringifyReport(report: DetectorReport) {
  return `${JSON.stringify(sortKeysDeep(report), null, 2)}\n`;
}

export function renderHumanReport(report: DetectorReport) {
  const lines = [
    "BE3-DET · Phase 1 detector report",
    `Source commit: ${report.inputs.sourceCommit ?? "unknown"}`,
    `Error findings: ${report.alignmentScore.errorFindingCount}`,
    `Info findings: ${report.findings.length - report.alignmentScore.errorFindingCount}`,
    "",
    "By rule:",
    ...report.summaries.byRule.map((row) => `- ${row.ruleId} (${row.lId}, ${row.severity}) · ${row.count}`),
    "",
    "By L-ID:",
    ...report.summaries.byLId.map((row) => `- ${row.lId} · ${row.count}`),
    "",
    "Findings:",
    ...report.findings.map((finding) => `- [${finding.severity}] ${finding.ruleId} ${finding.lId} ${finding.file}:${finding.line} → ${finding.matched}`),
  ];
  return `${lines.join("\n")}\n`;
}

export function writeDetectorArtifacts(report: DetectorReport, options: { jsonPath?: string; markdownPath?: string }) {
  if (options.jsonPath) writeFileSync(options.jsonPath, stableStringifyReport(report), "utf8");
  if (options.markdownPath) writeFileSync(options.markdownPath, renderHumanReport(report), "utf8");
}

export type { DetectorReport, Finding, DetectorConfig };

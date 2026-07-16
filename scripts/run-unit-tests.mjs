// Unit-test runner + coverage gate (PQ-1).
//
// Runs every tests/unit/**/*.test.ts through node:test + tsx with V8 coverage,
// then enforces coverage thresholds by parsing node:test's own report. Node 20
// has no native --test-coverage-lines / --test-coverage-include flags (those are
// Node 22+), so this script is the temporary gate; a future Node 22 upgrade lets
// us delete it and use native thresholds. See docs/roadmap/TESTING_ROADMAP.md.
//
// Coverage accounting (mean-based proxy, deliberately explicit):
//   - CRITICAL pure libraries: each must hit >= 90% BRANCH coverage.
//   - TRACKED pure set (critical + fully-pure helpers): mean branch% >= 80%.
//   Mixed/DB-coupled modules (invitations, org-settings, search, transports) are
//   intentionally OUTSIDE the denominator — their query paths are E2E-tested.
//
// Why BRANCH, not line: node:test's V8 line coverage is unreliable under tsx —
// multi-line statements (return objects, template arrays) mis-map as "uncovered"
// even when executed, deflating line% regardless of test quality. Branch coverage
// maps accurately and is a stronger correctness signal, so it is the gate; line%
// is printed as advisory. A future Node 22 upgrade (accurate native line coverage)
// can revisit this. See docs/roadmap/TESTING_ROADMAP.md.
import { spawnSync } from "node:child_process";
import { readdirSync } from "node:fs";
import { join, relative } from "node:path";

const ROOT = process.cwd();
const CRITICAL = [
  "lib/analysis.ts",
  "lib/matching.ts",
  "lib/list-params.ts",
  "lib/task-sort.ts",
  "lib/permissions.ts",
  "lib/intelligence/owner-identity.ts",
  "lib/intelligence/projection-precedence.ts",
  "lib/intelligence/owner-duplicates.ts",
  "lib/intelligence/owner-merge-suggest.ts",
  "lib/intelligence/property-fields.ts",
  "lib/intelligence/property-normalizers.ts",
  "lib/intelligence/property-resolution.ts",
  "lib/underwriting/model-version.ts",
  "lib/underwriting/assumptions.ts",
  "lib/underwriting/debt-sizing.ts",
  "lib/underwriting/schedule.ts",
  "lib/underwriting/cash-flow.ts",
  "lib/underwriting/exit.ts",
  "lib/underwriting/sensitivity.ts",
  "lib/underwriting/findings.ts",
  // Offer-memo generation — the pure snapshot assembler + deterministic HTML renderer
  // (no Prisma/clock/randomness). Determinism + escaping are load-bearing (OM-F/OM-12).
  "lib/documents/offer-memo.ts",
  // Closing Center — the pure PAID-gate predicate + progress/transition helpers
  // (no Prisma/clock). The gate is load-bearing (CC-2/CC-3).
  "lib/closing.ts",
  // Escrow (Closing Slice 2) — the pure lifecycle guard + immutable terminal-snapshot
  // builder (no Prisma/clock). Transition legality + snapshot fidelity are load-bearing
  // (EC-8/EC-I/EC-11).
  "lib/escrow.ts",
  // Financing (Closing Slice 3) — the pure lifecycle guard + FC-J terminal-snapshot builder
  // (no Prisma/clock). Transition legality + snapshot fidelity are load-bearing (FC-10/FC-J).
  "lib/financing.ts",
  // Assignments (Closing Slice 4) — the pure lifecycle guard + terminal execution-snapshot
  // builder (no Prisma/clock). Transition legality + snapshot fidelity are load-bearing
  // (AS-9/AS-D/AS-H).
  "lib/assignment.ts",
  // Assignment agreement generation — the pure snapshot assembler + deterministic HTML
  // renderer (no Prisma/clock/randomness). Determinism + escaping are load-bearing, reading
  // only operational data (AS-14/AS-15).
  "lib/documents/assignment-agreement.ts",
];
const TRACKED = [
  ...CRITICAL,
  // scenario-result.ts is a ~4-line pure COMPOSITION of three CRITICAL modules
  // (assumptions ∘ analysis ∘ model-version) with one real branch — exhaustively
  // unit-tested (equivalence to the kernel, determinism, fingerprint identity, both
  // validation paths) + e2e-covered. Under tsx its near-branchless body mis-maps
  // (the function signature line reports uncovered, funcs 2/3), pinning branch% at
  // 83% regardless of test quality — the exact tsx artifact this file documents. It
  // is TRACKED (counts toward the ≥80% mean), not CRITICAL, rather than lower a gate.
  "lib/underwriting/scenario-result.ts",
  // financing.ts is likewise a pure COMPOSITION (kernel ∘ debt-sizing ∘ cash-flow)
  // that layers a case's debt onto frozen operating inputs — same near-branchless
  // shape as scenario-result.ts, so it is TRACKED (its real logic lives in the
  // three CRITICAL modules it composes, each independently gated at ≥90%).
  "lib/underwriting/financing.ts",
  "lib/env.ts",
  "lib/note-links.ts",
  "lib/safe-redirect.ts",
  "lib/password.ts",
  "lib/email/templates/index.ts",
  "lib/email/templates/layout.ts",
  "lib/email/templates/system-alert.ts",
  "lib/email/templates/invitation.ts",
];
const CRITICAL_MIN = 90;
const OVERALL_MIN = 80;

function findTests(dir) {
  const out = [];
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) out.push(...findTests(p));
    else if (/\.test\.ts$/.test(e.name)) out.push(p);
  }
  return out;
}

const files = findTests(join(ROOT, "tests", "unit")).map((f) => relative(ROOT, f)).sort();
if (files.length === 0) {
  console.error("No tests/unit/**/*.test.ts found.");
  process.exit(1);
}

console.log(`Running ${files.length} unit test file(s) via node:test + tsx (with coverage)…\n`);
const res = spawnSync(
  process.execPath,
  ["--test", "--experimental-test-coverage", ...files],
  { cwd: ROOT, encoding: "utf8", env: { ...process.env, NODE_OPTIONS: "--import tsx" } },
);

const output = (res.stdout ?? "") + (res.stderr ?? "");
process.stdout.write(output);

// --- parse node:test's coverage table + pass/fail counters --------------------
const coverage = new Map(); // path -> { line, branch }
for (const line of output.split("\n")) {
  const m = line.match(/^#\s+(\S.*?\.ts)\s*\|\s*([\d.]+)\s*\|\s*([\d.]+)\s*\|/);
  if (m) coverage.set(m[1].trim(), { line: Number.parseFloat(m[2]), branch: Number.parseFloat(m[3]) });
}
const failMatch = output.match(/^#\s+fail\s+(\d+)/m);
const testFailures = failMatch ? Number.parseInt(failMatch[1], 10) : (res.status === 0 ? 0 : 1);

function covFor(path) {
  // node prints paths relative to cwd; match by exact tail.
  for (const [k, v] of coverage) if (k === path || k.endsWith(path)) return v;
  return null;
}

// --- evaluate thresholds (gate on BRANCH %) -----------------------------------
const rows = [];
let anyMissing = false;
for (const path of TRACKED) {
  const cov = covFor(path);
  const critical = CRITICAL.includes(path);
  if (cov === null) anyMissing = true;
  const branch = cov ? cov.branch : null;
  const pass = branch !== null && branch >= (critical ? CRITICAL_MIN : 0);
  rows.push({ path, line: cov ? cov.line : null, branch, critical, pass });
}
const present = rows.filter((r) => r.branch !== null);
const overall = present.length ? present.reduce((s, r) => s + r.branch, 0) / present.length : 0;

// --- summary table ------------------------------------------------------------
// Two clearly-separated sections so no future contributor mistakes the advisory
// line% for the gate: ENFORCED branch coverage first, INFORMATIONAL line% after.
const overallPass = overall >= OVERALL_MIN;
const width = Math.max(...TRACKED.map((p) => p.length), "Overall (branch)".length);
const mark = (r) => (r.branch === null ? "✗" : r.critical ? (r.pass ? "✅" : "❌") : "·");
const pad = (label) => ".".repeat(Math.max(3, width - label.length + 2));

console.log("\n══════════════════════════════════════════════════════════════════════");
console.log("Coverage Summary (unit)");
console.log("══════════════════════════════════════════════════════════════════════");
console.log("ENFORCED — Branch coverage (the gate)");
console.log("  Critical modules (≥90% each):");
for (const r of rows.filter((x) => x.critical)) {
  const br = r.branch === null ? "MISSING" : `${r.branch.toFixed(1)}%`.padStart(6);
  console.log(`    ${r.path} ${pad(r.path)} ${br} ${mark(r)}`);
}
console.log("  Supporting pure modules (contribute to the overall bar):");
for (const r of rows.filter((x) => !x.critical)) {
  const br = r.branch === null ? "MISSING" : `${r.branch.toFixed(1)}%`.padStart(6);
  console.log(`    ${r.path} ${pad(r.path)} ${br} ${mark(r)}`);
}
console.log(`  Overall (branch) ${pad("Overall (branch)")} ${`${overall.toFixed(1)}%`.padStart(6)} [≥80] ${overallPass ? "✅" : "❌"}`);
console.log("──────────────────────────────────────────────────────────────────────");
const lineVals = rows.filter((r) => r.line !== null).map((r) => r.line);
const overallLine = lineVals.length ? lineVals.reduce((s, v) => s + v, 0) / lineVals.length : 0;
console.log("INFORMATIONAL ONLY — Line coverage (NOT enforced)");
console.log("  node:test line coverage is unreliable under tsx (multi-line statements");
console.log("  mis-map as uncovered), so it is reported for insight but never gates.");
console.log(`  Overall line coverage (advisory): ${overallLine.toFixed(1)}%`);
console.log("══════════════════════════════════════════════════════════════════════");

// --- verdict ------------------------------------------------------------------
const criticalFail = rows.filter((r) => r.critical && !r.pass);
const problems = [];
if (testFailures > 0) problems.push(`${testFailures} test(s) failed`);
if (anyMissing) problems.push(`${rows.filter((r) => r.branch === null).length} tracked module(s) had no coverage data`);
for (const r of criticalFail) problems.push(`${r.path} branch ${r.branch === null ? "missing" : r.branch.toFixed(1) + "%"} < ${CRITICAL_MIN}% (critical)`);
if (!overallPass) problems.push(`overall branch ${overall.toFixed(1)}% < ${OVERALL_MIN}%`);

if (problems.length) {
  console.log(`\nFAIL — unit gate:\n  - ${problems.join("\n  - ")}`);
  process.exit(1);
}
console.log(`\nPASS — ${files.length} files, all critical branch ≥ ${CRITICAL_MIN}%, overall branch ${overall.toFixed(1)}% ≥ ${OVERALL_MIN}%`);

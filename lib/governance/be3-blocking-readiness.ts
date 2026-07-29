// BE-3 Blocking Readiness Evaluation — pure, read-only, deterministic, NON-BLOCKING, EVIDENCE-ONLY.
//
// Runs the EXISTING candidate classifier (lib/governance/be3-language-candidate.ts) over a synthetic,
// ground-truth-labelled corpus and produces an evidence package. It changes nothing in the classifier,
// the detector, rules, or product behavior; it introduces no real exception/bypass and no CI gating.
// It defines NO pass threshold — it presents evidence for a later governed review.
//
// Determinism: no clock/random/env. Any timestamp used (exception simulation) is passed in explicitly.

import { createHash } from "node:crypto";

import { runCandidate, stableStringifyCandidate, FINDING_IDENTITY_VERSION, type CandidateInput, type CandidateReport, type Finding } from "@/lib/governance/be3-language-candidate";

export const CANDIDATE_IDENTITY_VERSION_PROPOSED = "civ-1"; // proposed; NOT yet enforced by the classifier

type CompatAccepted = { detectorVersion: string; ruleSetHash: string; scopeHash: string; measurementSeriesId: string; baselineTag: string; findingIdentityVersion: string };
type CompatCurrent = { detectorVersion: string; ruleSetHash: string; scopeHash: string; measurementSeriesId: string };
export type Corpus = {
  meta?: { corpusSpec?: string };
  accepted: CompatAccepted;
  currentCompat: CompatCurrent;
  cases: Array<{
    name: string;
    groundTruth: "real-drift" | "harmless" | "ambiguous-by-design" | "suspension";
    baseline: Finding[];
    current: Finding[];
    options?: CandidateInput["options"];
    currentCompatOverride?: Partial<CompatCurrent>;
  }>;
};

function inputFor(corpus: Corpus, c: Corpus["cases"][number]): CandidateInput {
  return {
    current: { compat: { ...corpus.currentCompat, ...(c.currentCompatOverride ?? {}) }, findings: c.current },
    baseline: { findings: c.baseline },
    accepted: corpus.accepted,
    options: c.options ?? {},
  };
}

type CaseOutcome = "TP" | "FP" | "TN" | "FN_silent" | "FN_ambiguous" | "ambiguous_soft" | "ambiguous_expected" | "suspension" | "unclassified";

function caseOutcome(gt: string, report: CandidateReport): CaseOutcome {
  if (report.mode === "suspended") return "suspension";
  const s = report.summary;
  const flaggedNew = (s["candidate-new"] ?? 0) > 0;
  const flaggedAmbig = (s.ambiguous ?? 0) > 0;
  if (gt === "real-drift") return flaggedNew ? "TP" : flaggedAmbig ? "FN_ambiguous" : "FN_silent";
  if (gt === "harmless") return flaggedNew ? "FP" : flaggedAmbig ? "ambiguous_soft" : "TN";
  if (gt === "ambiguous-by-design") return flaggedAmbig && !flaggedNew ? "ambiguous_expected" : "unclassified";
  if (gt === "suspension") return "suspension"; // (only reached if the classifier failed to suspend)
  return "unclassified";
}

function idOf(report: CandidateReport, ruleId: string, file: string, line: number, matched: string): string | null {
  const r = report.candidates.find((x) => x.ruleId === ruleId && x.file === file && x.line === line && x.matched === matched);
  return r ? r.candidateId : null;
}

function f(ruleId: string, file: string, line: number, matched: string, lId = "L0"): Finding {
  return { ruleId, lId, matched, file, line };
}

export function evaluate(corpus: Corpus, opts: { evaluatedAtActive: string; evaluatedAtExpired: string; corpusDigest: string }) {
  // --- Confusion over the corpus ---
  const byCase = corpus.cases.map((c) => {
    const report = runCandidate(inputFor(corpus, c));
    return { name: c.name, groundTruth: c.groundTruth, outcome: caseOutcome(c.groundTruth, report), summary: report.summary, mode: report.mode };
  });
  const tally = (o: CaseOutcome) => byCase.filter((x) => x.outcome === o).length;
  const ambiguousFindings = byCase.reduce((n, x) => n + (x.summary?.ambiguous ?? 0), 0);
  const confusion = {
    truePositives: tally("TP"),
    falsePositives: tally("FP"),
    trueNegatives: tally("TN"),
    falseNegatives: tally("FN_silent") + tally("FN_ambiguous"),
    silentFalseNegatives: tally("FN_silent"),
    ambiguousFalseNegatives: tally("FN_ambiguous"),
    ambiguousFindings,
    ambiguousSoft: tally("ambiguous_soft"),
    ambiguousExpected: tally("ambiguous_expected"),
    unclassified: tally("unclassified"),
    byCase,
  };

  // --- Candidate-identity stability probes (read-only; observed from the current classifier) ---
  const acc = corpus.accepted;
  const cur = corpus.currentCompat;
  const mkInput = (baseline: Finding[], current: Finding[], options?: CandidateInput["options"]): CandidateInput =>
    ({ current: { compat: cur, findings: current }, baseline: { findings: baseline }, accepted: acc, options });

  // (1) classification independence: same review item, different classification → same id?
  const idNew = idOf(runCandidate(mkInput([], [f("R-RET-001", "a.ts", 10, "lead")])), "R-RET-001", "a.ts", 10, "lead");
  const idExisting = idOf(runCandidate(mkInput([f("R-RET-001", "a.ts", 10, "lead")], [f("R-RET-001", "a.ts", 10, "lead")])), "R-RET-001", "a.ts", 10, "lead");
  const classificationIndependence = idNew !== null && idNew === idExisting;

  // (2) renames: item across a rename event keeps id?
  const idMoved = idOf(runCandidate(mkInput([f("R-RET-001", "old.ts", 10, "lead")], [f("R-RET-001", "new.ts", 10, "lead")], { renames: { "old.ts": "new.ts" } })), "R-RET-001", "new.ts", 10, "lead");
  const idSettled = idOf(runCandidate(mkInput([f("R-RET-001", "new.ts", 10, "lead")], [f("R-RET-001", "new.ts", 10, "lead")])), "R-RET-001", "new.ts", 10, "lead");
  const renames = idMoved !== null && idMoved === idSettled;

  // (3) repeats: repeated findings are distinguishable and each stable
  const rep = runCandidate(mkInput([], [f("R-RET-001", "r.ts", 10, "lead"), f("R-RET-001", "r.ts", 20, "lead")]));
  const repIds = rep.candidates.filter((x) => x.file === "r.ts").map((x) => x.candidateId);
  const repeats = new Set(repIds).size === 2;

  // (4) remove-and-reintroduce: reintroduced item classified ambiguous; stable while ambiguous?
  const rr1 = idOf(runCandidate(mkInput([f("R-RET-001", "rr.ts", 10, "lead"), f("R-SYN-003", "rr.ts", 20, "source", "L3")], [f("R-SYN-003", "rr.ts", 20, "source", "L3"), f("R-RET-001", "rr.ts", 60, "lead")])), "R-RET-001", "rr.ts", 60, "lead");
  const rr2 = idOf(runCandidate(mkInput([f("R-RET-001", "rr.ts", 10, "lead"), f("R-SYN-003", "rr.ts", 20, "source", "L3")], [f("R-SYN-003", "rr.ts", 20, "source", "L3"), f("R-RET-001", "rr.ts", 60, "lead")])), "R-RET-001", "rr.ts", 60, "lead");
  const removeReintroduce = rr1 !== null && rr1 === rr2; // stable across identical re-runs while ambiguous

  // (5) path canonicalization: aliased vs real path → same id?
  const idReal = idOf(runCandidate(mkInput([f("R-RET-001", "/x/real/d.ts", 10, "lead")], [f("R-RET-001", "/x/real/d.ts", 10, "lead")])), "R-RET-001", "/x/real/d.ts", 10, "lead");
  const idAlias = idOf(runCandidate(mkInput([f("R-RET-001", "/x/real/d.ts", 10, "lead")], [f("R-RET-001", "/x/link/d.ts", 10, "lead")], { aliases: { "/x/link/d.ts": "/x/real/d.ts" } })), "R-RET-001", "/x/real/d.ts", 10, "lead");
  const pathCanonicalization = idReal !== null && idReal === idAlias;

  // (6) baseline evolution: candidate identity is NOT independently versioned by the classifier yet.
  const baselineEvolution = false;

  const candidateIdentityStability = {
    classificationIndependence,
    renames,
    repeats,
    removeReintroduce,
    pathCanonicalization,
    baselineEvolution,
    notes: {
      classificationIndependence: "candidateId currently embeds classification+role; a review item changes id when its classification evolves — candidateIdentityVersion should make identity classification-independent.",
      renames: "same root cause as classificationIndependence (moved vs existing changes the id).",
      baselineEvolution: "no candidateIdentityVersion in the classifier yet; baseline evolution is handled by whole-evaluation suspension, not candidate-id continuity.",
    },
  };

  // --- Exception simulations (harness-internal ONLY; never touches product/baseline) ---
  const driftReport = runCandidate(inputFor(corpus, corpus.cases.find((c) => c.name === "genuine-new-drift")!));
  const driftCand = driftReport.candidates.find((x) => x.classification === "candidate-new");
  const auditRef = (parts: string[]) => createHash("sha256").update(parts.join(" ")).digest("hex").slice(0, 12);
  function simulateException(candidateId: string, ruleId: string, expirationDate: string, evaluatedAt: string, revoked: boolean) {
    const expired = !revoked && evaluatedAt >= expirationDate;
    const suppressed = !revoked && !expired; // active exception suppresses from candidate-new (logged), never mutates baseline
    const outcome = revoked ? "revoked→candidate-new" : expired ? "expired→candidate-new" : "active(suppressed→logged)";
    return { candidateId, ruleId, approver: "sim-approver", expirationDate, evaluatedAt, suppressed, outcome, auditRef: auditRef([candidateId, ruleId, expirationDate, evaluatedAt, String(revoked)]) };
  }
  const exceptionSimulations = driftCand ? [
    simulateException(driftCand.candidateId, driftCand.ruleId, "2026-08-01", opts.evaluatedAtActive, false),   // active (before expiry)
    simulateException(driftCand.candidateId, driftCand.ruleId, "2026-08-01", opts.evaluatedAtExpired, false),  // expired → candidate-new
    simulateException(driftCand.candidateId, driftCand.ruleId, "2026-08-01", opts.evaluatedAtActive, true),    // revoked → candidate-new
  ] : [];

  // --- Compatibility suspension outcomes (feed each trigger; observe the classifier) ---
  const base = corpus.cases.find((c) => c.name === "genuine-new-drift")!;
  const suspendTrigger = (override: Partial<CompatCurrent> | { findingIdentityVersion: string }): boolean => {
    if ("findingIdentityVersion" in override) {
      const r = runCandidate({ current: { compat: cur, findings: base.current }, baseline: { findings: base.baseline }, accepted: { ...acc, findingIdentityVersion: (override as any).findingIdentityVersion }, options: {} });
      return r.mode === "suspended";
    }
    const r = runCandidate({ current: { compat: { ...cur, ...(override as Partial<CompatCurrent>) }, findings: base.current }, baseline: { findings: base.baseline }, accepted: acc, options: {} });
    return r.mode === "suspended";
  };
  const suspensionOutcomes = [
    { trigger: "detectorVersion changed", result: suspendTrigger({ detectorVersion: "X" }) ? "suspended" : "NOT-suspended", supported: true },
    { trigger: "ruleSetHash changed", result: suspendTrigger({ ruleSetHash: "X" }) ? "suspended" : "NOT-suspended", supported: true },
    { trigger: "scopeHash changed", result: suspendTrigger({ scopeHash: "X" }) ? "suspended" : "NOT-suspended", supported: true },
    { trigger: "measurementSeriesId changed", result: suspendTrigger({ measurementSeriesId: "X" }) ? "suspended" : "NOT-suspended", supported: true },
    { trigger: "findingIdentityVersion changed", result: suspendTrigger({ findingIdentityVersion: "fiv-0" }) ? "suspended" : "NOT-suspended", supported: true },
    { trigger: "candidateIdentityVersion changed", result: "not-wired", supported: false, note: "candidateIdentityVersion is proposed but not yet a suspension trigger in the classifier (gap for a future increment)." },
    { trigger: "baselineTag changed", result: "n/a", supported: false, note: "baselineTag is an accepted-side label, not a current-vs-accepted comparison in the current contract." },
  ];

  // --- Rollback / suspension self-check: determinism of the classifier ---
  const a = stableStringifyCandidate(runCandidate(inputFor(corpus, base)));
  const b = stableStringifyCandidate(runCandidate(inputFor(corpus, base)));
  const selfCheck = { deterministic: a === b, note: "classifier re-run on identical input is byte-identical; a determinism failure would itself be a suspension trigger ('classifier behaves unexpectedly')." };

  return {
    evaluationSpec: "BE3-BLOCKING-READINESS-v1",
    thresholdPolicy: "NONE — evidence only; no pass/fail threshold is defined or inferred. For governed review.",
    versions: {
      findingIdentityVersion: FINDING_IDENTITY_VERSION,
      candidateIdentityVersion: `${CANDIDATE_IDENTITY_VERSION_PROPOSED} (proposed; not yet enforced by the classifier)`,
      candidateSpec: "BE3-CANDIDATE-v1",
      baselineTag: corpus.accepted.baselineTag,
      corpusSpec: corpus.meta?.corpusSpec ?? null,
    },
    confusion,
    candidateIdentityStability,
    exceptionSimulations,
    suspensionOutcomes,
    selfCheck,
    provenance: { corpusDigest: opts.corpusDigest, evaluatedAtActive: opts.evaluatedAtActive, evaluatedAtExpired: opts.evaluatedAtExpired },
  };
}

function sortKeysDeep(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortKeysDeep);
  if (value && typeof value === "object") return Object.fromEntries(Object.keys(value as Record<string, unknown>).sort().map((k) => [k, sortKeysDeep((value as Record<string, unknown>)[k])]));
  return value;
}
export function stableStringifyEvidence(ev: unknown): string {
  return JSON.stringify(sortKeysDeep(ev), null, 2) + "\n";
}

export function renderEvidenceReport(ev: ReturnType<typeof evaluate>): string {
  const L: string[] = [];
  L.push("BE3 Blocking Readiness Evaluation — EVIDENCE (read-only, non-blocking, no threshold)");
  L.push(`baselineTag: ${ev.versions.baselineTag}   findingIdentityVersion: ${ev.versions.findingIdentityVersion}`);
  L.push(`candidateIdentityVersion: ${ev.versions.candidateIdentityVersion}`);
  L.push("");
  L.push("Confusion (case-level, groundTruth vs classifier):");
  const c = ev.confusion;
  for (const [k, v] of [["true positives", c.truePositives], ["false positives", c.falsePositives], ["true negatives", c.trueNegatives], ["false negatives (total)", c.falseNegatives], ["  silent false negatives", c.silentFalseNegatives], ["  ambiguous false negatives", c.ambiguousFalseNegatives], ["ambiguous findings", c.ambiguousFindings], ["unclassified", c.unclassified]] as const) L.push(`  ${k}: ${v}`);
  L.push("");
  L.push("Per case:");
  for (const x of c.byCase) L.push(`  ${x.name} [${x.groundTruth}] → ${x.outcome}`);
  L.push("");
  L.push("Candidate-identity stability:");
  for (const k of ["classificationIndependence", "renames", "repeats", "removeReintroduce", "pathCanonicalization", "baselineEvolution"] as const) L.push(`  ${k}: ${(ev.candidateIdentityStability as any)[k]}`);
  L.push("");
  L.push("Exception simulations:");
  for (const e of ev.exceptionSimulations) L.push(`  ${e.ruleId} ${e.candidateId} @${e.evaluatedAt} → ${e.outcome}`);
  L.push("");
  L.push("Compatibility suspension outcomes:");
  for (const s of ev.suspensionOutcomes) L.push(`  ${s.trigger} → ${s.result}`);
  L.push("");
  L.push(`Self-check (determinism): ${ev.selfCheck.deterministic ? "consistent" : "INCONSISTENT"}`);
  return L.join("\n") + "\n";
}

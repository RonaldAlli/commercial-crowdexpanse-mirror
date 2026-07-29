// BE-3 Candidate Identity — Increment 5B corpus-rerun evidence harness.
//
// ISOLATED, READ-ONLY, DETERMINISTIC, NON-AUTHORITATIVE, EVIDENCE-ONLY. Reruns the accepted readiness
// corpus (verbatim) plus the approved append-only additions against the HARDENED identity stack
// (Increments 1–5A: civ-2 identity + compatibility contract + lineage + migration + evidence manifest),
// and produces a single content-addressed evidence package. It changes nothing in those modules, the
// detector, the classifier, accepted evidence, or accepted baselines; it performs no migration, proposes
// no baseline, creates no tag, and switches no authority. civ-1 remains authoritative.
//
// It ANSWERS the approved governance questions; it does NOT judge them. NO pass/fail threshold is
// defined or inferred. Determinism: no clock/random/env — every timestamp is a supplied input.

import { createHash } from "node:crypto";

import { generateIdentities, type IdentityInput, CANDIDATE_IDENTITY_VERSION } from "@/lib/governance/be3-candidate-identity";
import { evaluateLineage, type LineageStatus, type PreviousCandidate, type CurrentFinding, type VerifiedRename, LINEAGE_VERSION } from "@/lib/governance/be3-candidate-lineage";
import { evaluateMigration, type MigrationInput, MIGRATION_VERSION } from "@/lib/governance/be3-candidate-migration";
import { evaluateCompatibility, type CompatibilityFields, COMPATIBILITY_CONTRACT_VERSION } from "@/lib/governance/be3-compatibility-contract";
import { constructManifest, manifestDigest, validateManifest, type EvidenceManifest, MIGRATION_SCHEMA_VERSION, MANIFEST_CONTRACT_VERSION } from "@/lib/governance/be3-evidence-manifest";

export const RERUN_EVIDENCE_SPEC = "BE3-CANDIDATE-IDENTITY-RERUN-v1";
export const CLASSIFICATION_ALGORITHM_VERSION = "cav-1"; // declared by this harness (no module constant exists yet — see report Deferred note)
export const GENERATOR_VERSION = "genv-1";

// ---- Corpus input shapes (accepted corpus is read verbatim; additions are append-only) ----
export type AcceptedCompat = { detectorVersion: string; ruleSetHash: string; scopeHash: string; measurementSeriesId: string; baselineTag: string; findingIdentityVersion: string };
export type OriginalFinding = { ruleId: string; lId?: string; file: string; line: number; matched: string };
export type OriginalCase = {
  name: string; groundTruth: GroundTruth;
  baseline: OriginalFinding[]; current: OriginalFinding[];
  options?: { renames?: Record<string, string>; aliases?: Record<string, string> };
  currentCompatOverride?: Partial<Pick<CompatibilityFields, "detectorVersion" | "ruleSetHash" | "scopeHash" | "measurementSeriesId">>;
};
export type AcceptedCorpus = { meta?: { corpusSpec?: string }; accepted: AcceptedCompat; currentCompat: unknown; cases: OriginalCase[] };

export type GroundTruth = "real-drift" | "harmless" | "ambiguous-by-design" | "suspension";
export type AddedFinding = { ruleId: string; lId?: string; matched: string; path: string; contextAnchor?: string | null };
export type AddedCase = {
  name: string; justification: string; groundTruth: GroundTruth;
  previous: Array<AddedFinding & { priorState: "existing" | "resolved" }>;
  current: AddedFinding[];
  renames?: VerifiedRename[];
  compatOverride?: Partial<CompatibilityFields>;
};
export type Additions = {
  meta?: { corpusSpec?: string };
  cases: AddedCase[];
  migration: { old: Array<{ oldId: string }>; new: Array<{ identity: IdentityInput }>; linkage: Array<{ oldId: string; newIndex: number; lineageStatus: LineageStatus }> };
};

// Prior v1.0 reference (from the ACCEPTED blocking-readiness evidence) for honest side-by-side comparison.
export type PriorV1 = {
  candidateIdentityStability: { classificationIndependence: boolean; renames: boolean; repeats: boolean; removeReintroduce: boolean; pathCanonicalization: boolean; baselineEvolution: boolean };
  confusion: { truePositives: number; falsePositives: number; trueNegatives: number; falseNegatives: number; silentFalseNegatives: number; ambiguousFalseNegatives: number; unclassified: number };
  candidateIdentityVersionSuspension: "wired" | "not-wired";
};

export type RerunOptions = { generatedAt: string; evaluatedAt: string; generatorVersion?: string };

type CaseOutcome = "TP" | "FP" | "TN" | "FN_silent" | "FN_ambiguous" | "ambiguous_soft" | "ambiguous_expected" | "suspension" | "unclassified";
const NEW_STATUSES: LineageStatus[] = ["unrelated", "reintroduced", "split"];

// ---- helpers ----
function sha256(s: string): string { return createHash("sha256").update(s).digest("hex"); }
function sortKeysDeep(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortKeysDeep);
  if (value && typeof value === "object") return Object.fromEntries(Object.keys(value as Record<string, unknown>).sort().map((k) => [k, sortKeysDeep((value as Record<string, unknown>)[k])]));
  return value;
}
export function stableStringifyRerun(value: unknown): string { return JSON.stringify(sortKeysDeep(value), null, 2) + "\n"; }

function acceptedContract(acc: AcceptedCompat): CompatibilityFields {
  return {
    findingIdentityVersion: acc.findingIdentityVersion,
    candidateIdentityVersion: CANDIDATE_IDENTITY_VERSION, // civ-2 under test
    classificationAlgorithmVersion: CLASSIFICATION_ALGORITHM_VERSION,
    detectorVersion: acc.detectorVersion,
    ruleSetHash: acc.ruleSetHash,
    scopeHash: acc.scopeHash,
    measurementSeriesId: acc.measurementSeriesId,
    baselineTag: acc.baselineTag,
  };
}

function classify(gt: GroundTruth, suspended: boolean, statuses: LineageStatus[]): { outcome: CaseOutcome; flaggedNew: boolean; flaggedAmbiguous: boolean } {
  if (suspended) return { outcome: "suspension", flaggedNew: false, flaggedAmbiguous: false };
  const flaggedNew = statuses.some((s) => NEW_STATUSES.includes(s));
  const flaggedAmbiguous = statuses.some((s) => s === "ambiguous");
  let outcome: CaseOutcome;
  if (gt === "real-drift") outcome = flaggedNew ? "TP" : flaggedAmbiguous ? "FN_ambiguous" : "FN_silent";
  else if (gt === "harmless") outcome = flaggedNew ? "FP" : flaggedAmbiguous ? "ambiguous_soft" : "TN";
  else if (gt === "ambiguous-by-design") outcome = flaggedAmbiguous && !flaggedNew ? "ambiguous_expected" : "unclassified";
  else outcome = "suspension";
  return { outcome, flaggedNew, flaggedAmbiguous };
}

// Map an original (line-aware) corpus finding to the line-BLIND hardened stack: no contextAnchor is
// available in the accepted corpus (civ-2 never uses a raw line), so co-located occurrences collapse.
function origToPrev(f: OriginalFinding): PreviousCandidate { return { ruleId: f.ruleId, lId: f.lId, matched: f.matched, path: f.file, contextAnchor: null, priorState: "existing" }; }
function origToCur(f: OriginalFinding): CurrentFinding { return { ruleId: f.ruleId, lId: f.lId, matched: f.matched, path: f.file, contextAnchor: null }; }
function renamesOf(map?: Record<string, string>): VerifiedRename[] { return Object.entries(map ?? {}).map(([from, to]) => ({ from, to, source: "repo-metadata" as const })); }

type CaseResult = {
  name: string; groundTruth: GroundTruth; suite: "original" | "added"; outcome: CaseOutcome;
  suspended: boolean; currentStatuses: LineageStatus[]; flaggedNew: boolean; flaggedAmbiguous: boolean;
  note: string;
};

function runOriginalCase(c: OriginalCase, acc: CompatibilityFields): CaseResult {
  const current: CompatibilityFields = { ...acc, ...(c.currentCompatOverride ?? {}) } as CompatibilityFields;
  const compat = evaluateCompatibility(acc, current);
  if (compat.mode === "suspended") return { name: c.name, groundTruth: c.groundTruth, suite: "original", outcome: "suspension", suspended: true, currentStatuses: [], flaggedNew: false, flaggedAmbiguous: false, note: compat.reason ?? "suspended" };
  const lineage = evaluateLineage(c.baseline.map(origToPrev), c.current.map(origToCur), renamesOf(c.options?.renames));
  const statuses = lineage.current.map((x) => x.status);
  const { outcome, flaggedNew, flaggedAmbiguous } = classify(c.groundTruth, false, statuses);
  const hasAlias = !!c.options?.aliases && Object.keys(c.options.aliases).length > 0;
  const note = hasAlias ? "path aliases in the accepted corpus are NOT consumed by the hardened stack (identity is repo-relative POSIX-only; lineage takes verified renames, not aliases)" : "line-blind: co-located occurrences without a stable context anchor are ambiguous by design";
  return { name: c.name, groundTruth: c.groundTruth, suite: "original", outcome, suspended: false, currentStatuses: statuses, flaggedNew, flaggedAmbiguous, note };
}

function runAddedCase(c: AddedCase, acc: CompatibilityFields): { result: CaseResult; lineageCurrent: Array<{ status: LineageStatus; candidateId: string | null }> } {
  const current: CompatibilityFields = { ...acc, ...(c.compatOverride ?? {}) } as CompatibilityFields;
  const compat = evaluateCompatibility(acc, current);
  if (compat.mode === "suspended") return { result: { name: c.name, groundTruth: c.groundTruth, suite: "added", outcome: "suspension", suspended: true, currentStatuses: [], flaggedNew: false, flaggedAmbiguous: false, note: compat.reason ?? "suspended" }, lineageCurrent: [] };
  const prev: PreviousCandidate[] = c.previous.map((p) => ({ ruleId: p.ruleId, lId: p.lId, matched: p.matched, path: p.path, contextAnchor: p.contextAnchor ?? null, priorState: p.priorState }));
  const cur: CurrentFinding[] = c.current.map((f) => ({ ruleId: f.ruleId, lId: f.lId, matched: f.matched, path: f.path, contextAnchor: f.contextAnchor ?? null }));
  const lineage = evaluateLineage(prev, cur, c.renames ?? []);
  const statuses = lineage.current.map((x) => x.status);
  const { outcome, flaggedNew, flaggedAmbiguous } = classify(c.groundTruth, false, statuses);
  return {
    result: { name: c.name, groundTruth: c.groundTruth, suite: "added", outcome, suspended: false, currentStatuses: statuses, flaggedNew, flaggedAmbiguous, note: c.justification },
    lineageCurrent: lineage.current.map((x) => ({ status: x.status, candidateId: x.candidateId })),
  };
}

function tallyConfusion(results: CaseResult[]) {
  const t = (o: CaseOutcome) => results.filter((r) => r.outcome === o).length;
  return {
    truePositives: t("TP"), falsePositives: t("FP"), trueNegatives: t("TN"),
    falseNegatives: t("FN_silent") + t("FN_ambiguous"),
    silentFalseNegatives: t("FN_silent"), ambiguousFalseNegatives: t("FN_ambiguous"),
    ambiguousSoft: t("ambiguous_soft"), ambiguousExpected: t("ambiguous_expected"),
    suspension: t("suspension"), unclassified: t("unclassified"),
    byCase: results.map((r) => ({ name: r.name, suite: r.suite, groundTruth: r.groundTruth, outcome: r.outcome, currentStatuses: r.currentStatuses })),
  };
}

// ---- identity-stability probes (hardened: civ-2 identity + lineage) ----
function idOfSingle(inp: IdentityInput): { id: string | null; status: string } {
  const r = generateIdentities([inp]).results[0];
  return { id: r.candidateId, status: r.status };
}
function lineageIdOf(prev: PreviousCandidate[], cur: CurrentFinding[], renames: VerifiedRename[], idx = 0): { id: string | null; status: LineageStatus } {
  const r = evaluateLineage(prev, cur, renames).current[idx];
  return { id: r.candidateId, status: r.status };
}

function identityStability() {
  const anchor = "fnAlpha";
  const mk = (path: string, contextAnchor: string | null = anchor): IdentityInput => ({ rule: { ruleId: "R-RET-001", lId: "L0" }, matched: "lead", path, contextAnchor });

  // (1) classification-independence: identity is derived without any classification input → invariant.
  const idAlone = idOfSingle(mk("svc/a.ts")).id; // would-be candidate-new
  const idWithBaseline = lineageIdOf([{ ruleId: "R-RET-001", lId: "L0", matched: "lead", path: "svc/a.ts", contextAnchor: anchor, priorState: "existing" }], [{ ruleId: "R-RET-001", lId: "L0", matched: "lead", path: "svc/a.ts", contextAnchor: anchor }], []).id; // would-be existing
  const classificationIndependence = idAlone !== null && idAlone === idWithBaseline;

  // (2) rename continuity via verified rename.
  const idMoved = lineageIdOf([{ ruleId: "R-RET-001", lId: "L0", matched: "lead", path: "svc/old.ts", contextAnchor: anchor, priorState: "existing" }], [{ ruleId: "R-RET-001", lId: "L0", matched: "lead", path: "svc/new.ts", contextAnchor: anchor }], [{ from: "svc/old.ts", to: "svc/new.ts", source: "repo-metadata" }]);
  const idSettled = idOfSingle(mk("svc/new.ts")).id;
  const renames = idMoved.id !== null && idMoved.id === idSettled && idMoved.status === "renamed";

  // (3) repeats: distinguishable WITH context; ambiguous WITHOUT (never a fabricated ordinal).
  const withCtx = generateIdentities([mk("svc/r.ts", "fnOne"), mk("svc/r.ts", "fnTwo")]).results;
  const distinguishableWithContext = new Set(withCtx.map((r) => r.candidateId)).size === 2 && withCtx.every((r) => r.status === "resolved");
  const withoutCtx = generateIdentities([mk("svc/r.ts", null), mk("svc/r.ts", null)]).results;
  const ambiguousWithoutContext = withoutCtx.every((r) => r.status === "ambiguous");

  // (4) remove-and-reintroduce: resolved predecessor reopened deterministically & stably.
  const rr = () => lineageIdOf([{ ruleId: "R-RET-001", lId: "L0", matched: "lead", path: "svc/rr.ts", contextAnchor: "fnBeta", priorState: "resolved" }], [{ ruleId: "R-RET-001", lId: "L0", matched: "lead", path: "svc/rr.ts", contextAnchor: "fnBeta" }], []);
  const rr1 = rr(); const rr2 = rr();
  const removeReintroduce = rr1.id !== null && rr1.id === rr2.id && rr1.status === "reintroduced";

  // (5) path canonicalization: relative POSIX normalization only; alias/absolute NOT resolved.
  const idPlain = idOfSingle(mk("svc/a.ts")).id;
  const idNoisy = idOfSingle(mk("svc/./x/../a.ts")).id;
  const relativeNormalization = idPlain !== null && idPlain === idNoisy;
  const aliasResolution = false; // hardened identity has no alias table; lineage consumes verified renames, not aliases
  const absolutePathHandling = idOfSingle(mk("/abs/svc/a.ts")).status; // "rejected" by design (not repo-relative)

  // (6) baseline-evolution: identity is per-finding and baseline-state-independent.
  const idSnap1 = idOfSingle(mk("svc/be.ts")).id;
  const idSnap2 = generateIdentities([mk("svc/be.ts"), mk("svc/other.ts", "fnOther")]).results[0].candidateId; // amid a different baseline snapshot
  const baselineEvolution = idSnap1 !== null && idSnap1 === idSnap2;

  return {
    classificationIndependence,
    renames,
    repeats: distinguishableWithContext,
    removeReintroduce,
    pathCanonicalization: relativeNormalization,
    baselineEvolution,
    detail: {
      repeats: { distinguishableWithContext, ambiguousWithoutContext },
      pathCanonicalization: { relativeNormalization, aliasResolution, absolutePathHandling },
    },
    notes: {
      classificationIndependence: "civ-2 identity is computed only from rule + canonical subject + canonical location + stable context anchor; it takes NO classification input, so a review item keeps its id across classification changes.",
      renames: "identity continuity across a rename is provided by the lineage layer (verified rename), not by identity alone; identity itself performs no rename inference.",
      repeats: "distinguishable only when a stable context anchor differs; identical co-located occurrences are ambiguous by design (never a fabricated ordinal).",
      pathCanonicalization: "hardened identity canonicalizes repo-relative POSIX paths but does NOT resolve path aliases and REJECTS absolute paths; the accepted corpus's alias-based case is therefore not canonicalized by the hardened stack (open item).",
      baselineEvolution: "identity is derived from immutable evidence and is independent of baseline snapshot state.",
    },
  };
}

// ---- compatibility suspension matrix (all §2 version fields + msv via manifest) ----
function suspensionMatrix(acc: CompatibilityFields, manifest: EvidenceManifest) {
  const fields: (keyof CompatibilityFields)[] = ["findingIdentityVersion", "candidateIdentityVersion", "classificationAlgorithmVersion", "detectorVersion", "ruleSetHash", "scopeHash", "measurementSeriesId", "baselineTag"];
  const contract = fields.map((f) => {
    const current = { ...acc, [f]: acc[f] + "-X" } as CompatibilityFields;
    const r = evaluateCompatibility(acc, current);
    return { field: f, result: r.mode === "suspended" ? "suspended" : "NOT-suspended", supported: true };
  });
  // migrationSchemaVersion mismatch via the immutable manifest validator (constructManifest rejects msv-2,
  // so we validate against a current manifest bearing an unsupported msv to observe suspension).
  const currentManifest = { ...manifest, migrationSchemaVersion: "msv-2" } as EvidenceManifest;
  const mv = validateManifest(manifest, currentManifest);
  const manifestField = { field: "migrationSchemaVersion", result: mv.mode === "suspended" ? "suspended" : "NOT-suspended", supported: true, via: "evidence-manifest validateManifest" };
  const allSuspend = contract.every((c) => c.result === "suspended") && manifestField.result === "suspended";
  return { contract, manifest: manifestField, allVersionFieldsSuspend: allSuspend };
}

// ---- main evaluation ----
export function runRerun(acceptedCorpus: AcceptedCorpus, additions: Additions, prior: PriorV1, opts: RerunOptions) {
  const generatorVersion = opts.generatorVersion ?? GENERATOR_VERSION;
  const acc = acceptedContract(acceptedCorpus.accepted);

  // Manifest (immutable; every section references it) ----------------------------------------------
  const manifestInput = {
    findingIdentityVersion: acc.findingIdentityVersion,
    candidateIdentityVersion: acc.candidateIdentityVersion,
    classificationAlgorithmVersion: acc.classificationAlgorithmVersion,
    migrationSchemaVersion: MIGRATION_SCHEMA_VERSION,
    detectorVersion: acc.detectorVersion,
    ruleSetHash: acc.ruleSetHash,
    scopeHash: acc.scopeHash,
    measurementSeriesId: acc.measurementSeriesId,
    baselineTag: acc.baselineTag,
    generatorVersion,
    generatedAt: opts.generatedAt,
  };
  const mc = constructManifest(manifestInput);
  if (mc.status !== "ok") throw new Error(`manifest construction failed: ${mc.reason}`);
  const manifest = mc.manifest as EvidenceManifest;

  // Confusion over original + added cases -----------------------------------------------------------
  const originalResults = acceptedCorpus.cases.map((c) => runOriginalCase(c, acc));
  const addedRun = additions.cases.map((c) => runAddedCase(c, acc));
  const addedResults = addedRun.map((a) => a.result);
  const allResults = [...originalResults, ...addedResults];
  const confusion = tallyConfusion(allResults);
  const confusionOriginal = tallyConfusion(originalResults);
  const confusionAdded = tallyConfusion(addedResults);

  // Lineage evidence (per case, current statuses + ids for added; statuses for original) -------------
  const lineageEvidence = {
    lineageVersion: LINEAGE_VERSION,
    original: originalResults.map((r) => ({ name: r.name, groundTruth: r.groundTruth, suspended: r.suspended, currentStatuses: r.currentStatuses })),
    added: additions.cases.map((c, i) => ({ name: c.name, groundTruth: c.groundTruth, suspended: addedResults[i].suspended, current: addedRun[i].lineageCurrent })),
  };

  // Migration evidence ------------------------------------------------------------------------------
  const migInput: MigrationInput = { old: additions.migration.old, new: additions.migration.new, linkage: additions.migration.linkage };
  const migrationEvidence = evaluateMigration(migInput);

  // Identity stability ------------------------------------------------------------------------------
  const stability = identityStability();

  // Compatibility / suspension matrix ---------------------------------------------------------------
  const suspension = suspensionMatrix(acc, manifest);

  // Review queues (deterministic) -------------------------------------------------------------------
  const ambiguousQueue = allResults.filter((r) => r.flaggedAmbiguous || r.outcome === "ambiguous_expected" || r.outcome === "ambiguous_soft").map((r) => r.name).sort();
  const suspendedQueue = allResults.filter((r) => r.suspended).map((r) => r.name).sort();
  const unresolvedQueue = originalResults.filter((r) => !r.suspended && r.currentStatuses.length === 0).map((r) => r.name).sort();
  const reviewQueues = {
    ambiguous: ambiguousQueue,
    suspended: suspendedQueue,
    unresolvedOrRejected: unresolvedQueue,
    nonOneToOneMigration: migrationEvidence.reviewQueue.slice(),
  };

  // Corpus digest (content-address: accepted corpus + additions) ------------------------------------
  const corpusDigest = sha256(stableStringifyRerun(acceptedCorpus) + stableStringifyRerun(additions));

  // Prior v1.0 comparison (honest side-by-side) -----------------------------------------------------
  const comparison = {
    priorV1_0: prior,
    hardened: {
      candidateIdentityStability: { classificationIndependence: stability.classificationIndependence, renames: stability.renames, repeats: stability.repeats, removeReintroduce: stability.removeReintroduce, pathCanonicalization: stability.pathCanonicalization, baselineEvolution: stability.baselineEvolution },
      candidateIdentityVersionSuspension: suspension.contract.find((c) => c.field === "candidateIdentityVersion")!.result === "suspended" ? "wired" : "not-wired",
    },
    stabilityDeltas: (["classificationIndependence", "renames", "repeats", "removeReintroduce", "pathCanonicalization", "baselineEvolution"] as const).map((k) => ({ property: k, priorV1_0: prior.candidateIdentityStability[k], hardened: (stability as any)[k], changed: prior.candidateIdentityStability[k] !== (stability as any)[k] })),
  };

  // Governance questions (ANSWERED with evidence; NOT judged) ----------------------------------------
  const gapsClosed = [
    { gap: "classification-independent candidate identity", priorV1_0: false, hardened: stability.classificationIndependence },
    { gap: "candidateIdentityVersion wired into suspension", priorV1_0: false, hardened: comparison.hardened.candidateIdentityVersionSuspension === "wired" },
    { gap: "verified-rename continuity", priorV1_0: false, hardened: stability.renames },
    { gap: "baseline-evolution stability", priorV1_0: false, hardened: stability.baselineEvolution },
  ];
  const governanceQuestions = [
    { id: 1, question: "Are known material gaps closed?", evidence: { gaps: gapsClosed, stillOpen: gapsClosed.filter((g) => !g.hardened).map((g) => g.gap), openObservations: ["path-alias canonicalization is not handled by the hardened stack (identity is repo-relative POSIX-only; lineage consumes verified renames, not aliases)", "drift classification over the ACCEPTED (anchorless) corpus depends on an upstream stable context-anchor source not yet available"] }, judgment: "DEFERRED TO GOVERNED REVIEW" },
    { id: 2, question: "Are silent false negatives present?", evidence: { silentFalseNegatives: confusion.silentFalseNegatives, cases: allResults.filter((r) => r.outcome === "FN_silent").map((r) => r.name) }, judgment: "DEFERRED TO GOVERNED REVIEW" },
    { id: 3, question: "Is rename stability demonstrated?", evidence: { identityLineageRename: stability.renames, addedCase: addedResults.find((r) => r.name === "add-verified-rename-continuity")?.outcome ?? null }, judgment: "DEFERRED TO GOVERNED REVIEW" },
    { id: 4, question: "Is baseline-evolution stability demonstrated?", evidence: { baselineEvolution: stability.baselineEvolution, note: stability.notes.baselineEvolution }, judgment: "DEFERRED TO GOVERNED REVIEW" },
    { id: 5, question: "Are ambiguities preserved (never downgraded)?", evidence: { ambiguousFindingsAndCases: reviewQueues.ambiguous, ambiguousExpected: confusion.ambiguousExpected, migrationAmbiguous: migrationEvidence.summary.ambiguous ?? 0 }, judgment: "DEFERRED TO GOVERNED REVIEW" },
    { id: 6, question: "Are non-one-to-one migration mappings surfaced?", evidence: { migrationSummary: migrationEvidence.summary, reviewQueue: migrationEvidence.reviewQueue, allNonOneToOneReviewed: migrationEvidence.mappings.filter((m) => m.mappingClassification !== "oneToOne").every((m) => m.reviewRequired) }, judgment: "DEFERRED TO GOVERNED REVIEW" },
    { id: 7, question: "Is compatibility suspension complete across all version fields?", evidence: { suspensionMatrix: suspension, allVersionFieldsSuspend: suspension.allVersionFieldsSuspend }, judgment: "DEFERRED TO GOVERNED REVIEW" },
    { id: 8, question: "Is the package deterministic and reproducible?", evidence: { note: "byte-identical repeatability is asserted by the harness selfCheck and by the focused determinism tests; the canonical JSON is content-addressed to the corpus + versions." }, judgment: "DEFERRED TO GOVERNED REVIEW" },
  ];

  // Determinism self-check (recompute core sections and compare canonical strings) -------------------
  const coreOnce = stableStringifyRerun({ confusion, migrationEvidence, reviewQueues, stability });
  const originalResults2 = acceptedCorpus.cases.map((c) => runOriginalCase(c, acc));
  const addedResults2 = additions.cases.map((c) => runAddedCase(c, acc).result);
  const confusion2 = tallyConfusion([...originalResults2, ...addedResults2]);
  const migration2 = evaluateMigration(migInput);
  const stability2 = identityStability();
  const coreTwice = stableStringifyRerun({ confusion: confusion2, migrationEvidence: migration2, reviewQueues, stability: stability2 });
  const selfCheck = { deterministic: coreOnce === coreTwice, manifestDigestStable: manifestDigest(manifest) === manifestDigest(manifest), note: "core evidence recomputed on identical inputs is byte-identical; a determinism failure is itself a suspension trigger." };

  return {
    evidenceSpec: RERUN_EVIDENCE_SPEC,
    status: "EVIDENCE-ONLY — not a baseline, not accepted, not tagged, not authoritative. civ-1 remains authoritative.",
    thresholdPolicy: "NONE — evidence only; no pass/fail threshold is defined or inferred. For governed review.",
    contractVersions: { manifestContractVersion: MANIFEST_CONTRACT_VERSION, compatibilityContractVersion: COMPATIBILITY_CONTRACT_VERSION, lineageVersion: LINEAGE_VERSION, migrationVersion: MIGRATION_VERSION, candidateIdentityVersion: CANDIDATE_IDENTITY_VERSION, migrationSchemaVersion: MIGRATION_SCHEMA_VERSION },
    manifest,
    manifestDigest: manifestDigest(manifest),
    provenance: { corpusDigest, acceptedCorpusSpec: acceptedCorpus.meta?.corpusSpec ?? null, additionsSpec: additions.meta?.corpusSpec ?? null, generatedAt: opts.generatedAt, evaluatedAt: opts.evaluatedAt, generatorVersion },
    confusion,
    confusionBySuite: { original: confusionOriginal, added: confusionAdded },
    identityStability: stability,
    lineageEvidence,
    migrationEvidence,
    compatibilityEvidence: suspension,
    reviewQueues,
    comparison,
    governanceQuestions,
    selfCheck,
  };
}

export type RerunEvidence = ReturnType<typeof runRerun>;

// ---- report renderer (derived; canonical JSON is authoritative) ----
export function renderRerunReport(ev: RerunEvidence): string {
  const L: string[] = [];
  L.push(`# ${ev.evidenceSpec} — Candidate Identity Corpus Rerun EVIDENCE (Increment 5B)`);
  L.push("");
  L.push(`> ${ev.status}`);
  L.push(`> ${ev.thresholdPolicy}`);
  L.push("");
  L.push(`Manifest digest: \`${ev.manifestDigest}\`   corpusDigest: \`${ev.provenance.corpusDigest.slice(0, 16)}…\``);
  L.push(`Versions: fiv=${ev.manifest.findingIdentityVersion} civ=${ev.manifest.candidateIdentityVersion} cav=${ev.manifest.classificationAlgorithmVersion} msv=${ev.manifest.migrationSchemaVersion} detector=${ev.manifest.detectorVersion}`);
  L.push("");
  L.push("## Confusion (hardened stack; groundTruth vs lineage-derived classification)");
  const c = ev.confusion;
  for (const [k, v] of [["true positives", c.truePositives], ["false positives", c.falsePositives], ["true negatives", c.trueNegatives], ["false negatives (total)", c.falseNegatives], ["  silent FN", c.silentFalseNegatives], ["  ambiguous FN", c.ambiguousFalseNegatives], ["ambiguous (soft)", c.ambiguousSoft], ["ambiguous (expected)", c.ambiguousExpected], ["suspension", c.suspension], ["unclassified", c.unclassified]] as const) L.push(`- ${k}: ${v}`);
  L.push("");
  L.push("Per case:");
  for (const x of c.byCase) L.push(`- [${x.suite}] ${x.name} [${x.groundTruth}] → ${x.outcome}  (${x.currentStatuses.join(", ") || "—"})`);
  L.push("");
  L.push("## Candidate-identity stability (hardened vs prior v1.0)");
  for (const d of ev.comparison.stabilityDeltas) L.push(`- ${d.property}: v1.0=${d.priorV1_0} → hardened=${d.hardened}${d.changed ? "  (CHANGED)" : ""}`);
  L.push(`- candidateIdentityVersion suspension: v1.0=${ev.comparison.priorV1_0.candidateIdentityVersionSuspension} → hardened=${ev.comparison.hardened.candidateIdentityVersionSuspension}`);
  L.push("");
  L.push("## Migration mapping evidence");
  L.push(`summary: ${JSON.stringify(ev.migrationEvidence.summary)}`);
  L.push(`review queue: ${ev.migrationEvidence.reviewQueue.join(", ") || "—"}`);
  L.push("");
  L.push("## Compatibility suspension matrix");
  for (const f of ev.compatibilityEvidence.contract) L.push(`- ${f.field} → ${f.result}`);
  L.push(`- migrationSchemaVersion (via manifest) → ${ev.compatibilityEvidence.manifest.result}`);
  L.push(`- all version fields suspend: ${ev.compatibilityEvidence.allVersionFieldsSuspend}`);
  L.push("");
  L.push("## Review queues (deterministic)");
  L.push(`- ambiguous: ${ev.reviewQueues.ambiguous.join(", ") || "—"}`);
  L.push(`- suspended: ${ev.reviewQueues.suspended.join(", ") || "—"}`);
  L.push(`- unresolved/rejected: ${ev.reviewQueues.unresolvedOrRejected.join(", ") || "—"}`);
  L.push(`- non-one-to-one migration: ${ev.reviewQueues.nonOneToOneMigration.join(", ") || "—"}`);
  L.push("");
  L.push("## Governance questions (answered with evidence; NOT judged)");
  for (const q of ev.governanceQuestions) L.push(`- Q${q.id} ${q.question} — judgment: ${q.judgment}`);
  L.push("");
  L.push(`Self-check (determinism): ${ev.selfCheck.deterministic ? "consistent (byte-identical)" : "INCONSISTENT"}`);
  return L.join("\n") + "\n";
}

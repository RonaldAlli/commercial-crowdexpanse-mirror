# BE-3 Candidate Identity Hardening — Increment 5B Implementation Report

> **Scope: controlled corpus rerun + evidence production ONLY.** Increment 5B reruns the accepted
> readiness corpus (verbatim) plus the approved append-only additions against the **hardened identity
> stack** (Increments 1–5A: civ-2 identity + compatibility contract + lineage + migration + evidence
> manifest) and produces a single content-addressed evidence package. It is **isolated, read-only,
> deterministic, non-authoritative, evidence-only**. It **does not** accept a baseline, tag, make `civ-2`
> authoritative, modify accepted evidence/baselines, perform migration, or introduce blocking behavior.
> `civ-1` remains authoritative. Governance context: `CANDIDATE_IDENTITY_INCREMENT5_PLAN.md` §§1–7,
> `../candidate-identity/CANDIDATE_IDENTITY_INCREMENT5A_ACCEPTANCE.md`,
> `blocking-readiness/BE3-BLOCKING-READINESS-EVIDENCE-v1.0.json`, [[crowdexpanse-be-lifecycle]].
>
> **This report answers the approved governance questions. It does not judge them and does not recommend
> acceptance — that is the responsibility of the subsequent governed evidence review.**

## What was built

| File | Role |
|---|---|
| `lib/governance/be3-corpus-rerun.ts` | evidence harness — consumes the five hardened modules read-only; produces the canonical evidence object + report renderer |
| `scripts/diag/be3-corpus-rerun.ts` | diagnostic CLI (explicit `--json-out`/`--report-out`; refuses accepted-evidence paths; exit 0) |
| `docs/business/evolution/be-3/candidate-identity/rerun/corpus-civ2-additions.json` | append-only additions (§1), verbatim accepted corpus untouched |
| `docs/business/evolution/be-3/candidate-identity/rerun/BE3-CANDIDATE-IDENTITY-RERUN-EVIDENCE-v1.0.json` | canonical evidence package (authoritative artifact of the rerun) |
| `docs/business/evolution/be-3/candidate-identity/rerun/BE3-CANDIDATE-IDENTITY-RERUN-EVIDENCE-v1.0.report.md` | derived report |
| `tests/unit/governance/be3-corpus-rerun.test.ts` | 14 focused tests (determinism, structure, honest-open-findings) |

**Manifest digest** `EM-97240ceb22d462cfdf170153` · **corpusDigest** `7a1600e2fa5be590…` · **deterministic** true.
All package sections reference the single immutable Evidence Manifest (`msv-1`).

## Method (disclosed, deterministic)

- **Accepted corpus read verbatim** (`blocking-readiness/corpus.json`, unchanged); **7 append-only
  additions** exercise hardened identity per plan §1. Original cases are mapped to the **line-blind**
  hardened stack with **no context anchor** (civ-2 never uses a raw line), which is the faithful
  representation of anchorless detector output; additions carry stable context anchors.
- **Drift classification is derived from lineage** (`unrelated`/`reintroduced`/`split` → new drift;
  `ambiguous` → ambiguous; `sameCandidate`/`renamed`/`merged` → existing) exactly as the accepted
  blocking-readiness harness derived outcomes from the classifier — an **evidence-harness interpretation,
  not a change to any module's semantics**.
- **generatedAt / evaluatedAt are explicit inputs** (never wall-clock). No clock/random/env.

## Findings — classified (evidence only; no recommendation)

### Proven
- **Classification-independent candidate identity** — `classificationIndependence` flips **false → true**
  vs v1.0 (civ-2 takes no classification input).
- **`candidateIdentityVersion` wired into suspension** — **not-wired → wired**; the compatibility
  contract suspends on a `candidateIdentityVersion` mismatch.
- **Compatibility suspension is complete** — all eight version fields suspend, **plus**
  `migrationSchemaVersion` via the immutable manifest validator (`allVersionFieldsSuspend = true`).
- **Verified-rename continuity** — `renames` flips **false → true** (via the lineage layer); the anchored
  rename case is a TN and identity is preserved across the verified rename.
- **Baseline-evolution stability** — `baselineEvolution` flips **false → true**; civ-2 identity is
  independent of baseline snapshot state.
- **All five migration classifications represented and reviewed** — `oneToOne 2 · oneToMany 1 ·
  manyToOne 2 · unmapped 1 · ambiguous 1`; every non-`oneToOne` mapping is `reviewRequired`; every old
  candidate remains visible.
- **Reintroduction & split surfaced as drift** on anchored inputs (both TP).
- **Determinism / reproducibility** — canonical JSON, review queues, migration evidence, and manifest
  digest are **byte-identical** across reruns; content-addressed to corpus + versions.

### Ambiguous by Design
- **Indistinguishable duplicates → ambiguous** (added case + `duplicate-addition`): identical
  rule/subject/location with no distinguishing context yields ambiguity, never a fabricated ordinal.
- **Competing verified renames → ambiguous** (added case): two predecessors to one target are not
  resolved into invented lineage.
- **Ambiguity is preserved, never downgraded** across identity, lineage, and migration.

### Review Required
- **Non-one-to-one migration mappings** — review queue: `C-civ1-ambiguous, C-civ1-merge-a,
  C-civ1-merge-b, C-civ1-split, C-civ1-unmapped`.
- **Ambiguous corpus cases** — review queue: `add-ambiguous-competing-rename,
  add-indistinguishable-duplicates, duplicate-addition, genuine-new-drift, harmless-line-movement,
  path-canonicalization`.
- **Suspended cases** — `add-candidate-identity-version-suspension, incompatible-baseline`.

### Material Gap
- **One silent false negative** — `reintroduced-violation` (`FN_silent`). civ-2's deliberate
  line-blindness reads an intra-file remove-and-re-add (present in the same baseline snapshot, different
  line) as the **same candidate**, so a drift labelled `real-drift` is not surfaced. Per plan §4 Q2 this
  is significant for any authority decision; **reported, not judged.**
- **One false positive** — `resolved-finding` (`FP`). Anchorless baseline duplicates are ambiguous, so
  the surviving occurrence is classified `split` (new). An artifact of missing context anchors.
- **Drift detection over the anchorless accepted corpus is largely ambiguous** — `genuine-new-drift` and
  `duplicate-addition` become `FN_ambiguous`. civ-2 requires an **upstream stable context-anchor source**
  (the input-quality question deferred at Increment 1) to distinguish co-located occurrences.
- **Path-alias canonicalization is NOT handled by the hardened stack** — identity is repo-relative
  POSIX-only and **rejects absolute paths**; lineage consumes verified renames, **not** aliases. The
  top-line `pathCanonicalization = true` reflects **relative normalization only**
  (`detail.pathCanonicalization.aliasResolution = false`, `absolutePathHandling = "rejected"`); the
  accepted corpus's alias case is `ambiguous_soft`. This is a **regression relative to the v1.0
  classifier's alias handling** and must be read as open.

### Deferred
- **`classificationAlgorithmVersion` has no module constant** — it is declared by the harness (`cav-1`)
  and used by the manifest/compatibility contract, but no canonical `cav-*` constant exists in the
  governance modules yet. Recorded as a minor future refinement; not implemented here.
- **`evidencePackageVersion`** (Increment-5A observation) — not introduced here.

## Governance questions (answered; judgment deferred)

| # | Question | Evidence | Judgment |
|---|---|---|---|
| 1 | Known material gaps closed? | classification-independence ✓, candidateIdentityVersion-suspension ✓, rename ✓, baseline-evolution ✓; **open:** alias canonicalization, anchorless drift detection | DEFERRED |
| 2 | Silent false negatives present? | **silentFalseNegatives = 1** (`reintroduced-violation`) | DEFERRED |
| 3 | Rename stability demonstrated? | `renames = true`; added rename case = TN | DEFERRED |
| 4 | Baseline-evolution stability? | `baselineEvolution = true` | DEFERRED |
| 5 | Ambiguities preserved? | ambiguous review queue populated; none downgraded; migration ambiguous = 1 | DEFERRED |
| 6 | Non-one-to-one mappings surfaced? | reviewQueue = 5; all non-`oneToOne` reviewRequired | DEFERRED |
| 7 | Compatibility suspension complete? | all 8 fields + `msv` suspend; `allVersionFieldsSuspend = true` | DEFERRED |
| 8 | Deterministic & reproducible? | byte-identical reruns; content-addressed; selfCheck true | DEFERRED |

**No pass/fail threshold is defined or inferred.** The full data is in the canonical JSON.

## Isolation

Increments 1–5A modules (`be3-candidate-identity.ts`, `be3-compatibility-contract.ts`,
`be3-candidate-lineage.ts`, `be3-candidate-migration.ts`, `be3-evidence-manifest.ts`) are consumed
**read-only** and are **byte-identical** to `origin/main` (recorded in the PR). The accepted corpus and
all accepted evidence/baselines/acceptance records/tags are unchanged. All new files are additive.

## Boundaries this report does NOT assert

No baseline is proposed or accepted; no tag exists; no authority is switched; no migration is performed;
no blocking behavior is introduced. `civ-1` remains authoritative; `civ-2` non-authoritative. The
evidence is presented for the **Increment 5B Evidence Review**, which alone may later decide any of the
plan §5 authority-gate steps.

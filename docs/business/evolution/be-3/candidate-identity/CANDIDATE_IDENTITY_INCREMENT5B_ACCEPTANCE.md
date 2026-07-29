# BE-3 Candidate Identity Hardening — Increment 5B Acceptance Record

> **Status: ACCEPTED WITH MATERIAL GAPS** (founder-accepted 2026-07-29). Accepts the **isolated,
> read-only, deterministic, NON-AUTHORITATIVE, evidence-only** corpus-rerun evidence produced by
> Increment 5B (PR #33, `c3034a6` → merge `541e008`, verify PASS 14/14 with `--mirror-mode ancestor`).
> This acceptance **preserves the evidence**; it does **not** conclude that `civ-2` is ready to become
> authoritative. **No baseline is proposed or accepted. No tag is created. No authority is switched.**
> `civ-1` remains authoritative; `civ-2` remains non-authoritative. Governance context:
> `CANDIDATE_IDENTITY_INCREMENT5B_REPORT.md`, `CANDIDATE_IDENTITY_INCREMENT5_PLAN.md` §§1–7,
> `../candidate-identity/CANDIDATE_IDENTITY_INCREMENT5A_ACCEPTANCE.md`,
> `blocking-readiness/BE3-BLOCKING-READINESS-EVIDENCE-v1.0.json`, [[crowdexpanse-be-lifecycle]].

## What was accepted

The corpus-rerun evidence harness + package: `lib/governance/be3-corpus-rerun.ts` (consuming the five
hardened modules read-only), its CLI, the append-only additions, the canonical evidence package bound to
one immutable `msv-1` Evidence Manifest (`EM-97240ceb22d462cfdf170153`, corpusDigest `7a1600e2…`), and 14
focused tests (full be3 governance suite 122/122). The evidence **answers** the approved governance
questions; it does **not** judge them and defines **no** threshold.

## Proven (accepted as evidence)

- **Deterministic evidence generation** — canonical JSON, review queues, migration evidence, and manifest
  digest are byte-identical across reruns; content-addressed to corpus + versions.
- **Hardened identity improvements** — `classificationIndependence` false→true; verified-rename
  continuity demonstrated via lineage (false→true); `baselineEvolution` false→true.
- **Version-compatibility enforcement** — `candidateIdentityVersion` is now wired into suspension; all
  eight governed version fields participate, and `migrationSchemaVersion` suspends via the immutable
  manifest validator (`allVersionFieldsSuspend = true`).
- **Deterministic migration evidence** — all five classifications surfaced
  (`oneToOne · oneToMany · manyToOne · unmapped · ambiguous`); every non-`oneToOne` mapping requires
  review; every old candidate remains visible.
- **Append-only evidence production** — accepted corpus read verbatim; additions are append-only; no
  accepted evidence, baseline, acceptance record, or tag was modified.

## Material gaps (accepted as honestly reported; NOT resolved here)

- **Silent false negative on reintroduced violations** — `reintroduced-violation` classified `FN_silent`.
  civ-2's deliberate line-blindness reads an intra-file remove-and-re-add as the same candidate.
  **Significant:** prior governance has consistently treated elimination of silent false negatives as a
  key objective before any enforcement decision.
- **Upstream context-anchor dependency** — drift detection over the anchorless accepted corpus is largely
  `FN_ambiguous`; civ-2 requires an upstream stable context-anchor source (the Increment-1 input-quality
  dependency) to distinguish co-located occurrences. Unresolved, not hidden.
- **Anchorless duplicate ambiguity / false positive** — anchorless baseline duplicates yield ambiguity
  and one `resolved-finding` false positive (`split` artifact).
- **Missing path-alias canonicalization** — the hardened stack does not resolve path aliases and rejects
  absolute paths; the top-line `pathCanonicalization = true` reflects **relative normalization only**
  (`aliasResolution = false`). A regression relative to the v1.0 classifier's alias handling.

## Implementation assumption (recorded, not embedded silently)

The Increment 5B authorization permitted adding **"the previously approved append-only corpus cases."**
No separate case-level approval artifact exists. The implementation therefore treated the **Increment 5
plan §1 enumerated additions** (approved by merging PR #30 → `a47235b`) as the approved append-only set,
and realized them as the seven cases in `rerun/corpus-civ2-additions.json`, each carrying its §1
justification. This is an **implementation assumption**, surfaced here for the record rather than silently
embedded in the evidence; a future review may amend the added-case set without affecting the accepted
Increments 1–5A modules.

## Governed conclusion

The evidence is **suitable for preservation, not for recommending an authority transition.** The silent
false negative and the unresolved context-anchor dependency in particular mean `civ-2` is **not**
concluded ready to become authoritative at this stage.

## Boundaries this acceptance does NOT authorize

No new baseline (proposed or accepted); no baseline tag; no authority switch to `civ-2`; no migration
performed; no blocking behavior; no Blocking Mode planning. `civ-1` remains authoritative.

**Next governed activity:** a dedicated **Increment 5 Evidence Acceptance Review** whose sole
responsibility is to answer *"does this evidence justify proposing a new candidate baseline?"* Only if
that review finds the material gaps acceptable — or resolved — may there be a separate decision on
baseline acceptance, followed later by any consideration of an authority switch.

## Artifacts

| File | Role |
|---|---|
| `lib/governance/be3-corpus-rerun.ts` | evidence harness (read-only, non-authoritative) |
| `scripts/diag/be3-corpus-rerun.ts` | diagnostic CLI |
| `tests/unit/governance/be3-corpus-rerun.test.ts` | 14 focused tests |
| `rerun/corpus-civ2-additions.json` | append-only §1 additions |
| `rerun/BE3-CANDIDATE-IDENTITY-RERUN-EVIDENCE-v1.0.json` | canonical evidence package |
| `rerun/BE3-CANDIDATE-IDENTITY-RERUN-EVIDENCE-v1.0.report.md` | derived report |
| `CANDIDATE_IDENTITY_INCREMENT5B_REPORT.md` | implementation report |
| `CANDIDATE_IDENTITY_INCREMENT5B_ACCEPTANCE.md` | this acceptance record |

**No tag** by design; the evidence stays diagnostic and non-authoritative. `civ-2` becomes authoritative
only through the plan §5 authority gate, which this acceptance does not begin.

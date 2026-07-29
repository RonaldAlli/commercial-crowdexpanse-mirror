# BE3-CANDIDATE-MODE-v1.0 — Acceptance Record

> **Status: ACCEPTED WITH OBSERVATIONS** (founder-accepted 2026-07-29). Records the governed
> acceptance of the BE-3 Phase 3 **non-blocking candidate mode**. The classifier's canonical JSON is
> the authoritative artifact; the `.report.md` is derived; this file records the decision. Governance
> context: `CANDIDATE_MODE_PLAN.md`, `../ENFORCEMENT_PLAN.md`, [[crowdexpanse-be-lifecycle]].

## What was accepted

The non-blocking candidate classifier (`lib/governance/be3-language-candidate.ts` + CLI + tests) and
its first review artifact (`BE3-CANDIDATE-REVIEW-v1.0.{json,report.md}`), merged via PR #16
(implementation commit `aeae2de`, merge commit `0aabae8`).

## Provenance

| Field | Value |
|---|---|
| Candidate spec | `BE3-CANDIDATE-v1` |
| `findingIdentityVersion` | `fiv-1` |
| Baseline tag | `be3-measurement-baseline-v1.0` |
| Implementation / merge | `aeae2de` / `0aabae8` |
| First-artifact result | mode `candidate`, compatible `true` — existing **117**, candidate-new **0**, moved **0**, ambiguous **0**, resolved **0** |
| Tests | **12 / 12** (see below) |

## Acceptance statement (governed)

Accepted as the **official v1.0 non-blocking candidate mode**, on the following findings:

1. **Within the authorized boundary** — classifier + CLI + focused tests + canonical JSON + derived
   report only; no detector expansion, remediation, CI gating, schema/API/UI/prompt/persistence
   change, or Phase 4 work.
2. **Deterministic precedence + strict one-to-one matching** — the fixed §1a precedence is followed;
   `ambiguous` is a **terminal** classification (a contested/greedy match is never silently rendered
   `existing` or `candidate-new`); output is invariant to input/traversal order.
3. **Non-blocking** — the CLI always exits 0; candidate mode produces a review signal + audit
   artifact and never fails CI.
4. **Prevention Compatibility Contract enforced**, now including `findingIdentityVersion` — any of
   detector/ruleSet/scope/measurement-series/baseline-tag/finding-identity mismatch → `suspended`.
5. **Correct baseline state** — at the accepted baseline the first artifact is **117 existing / 0
   candidate-new / 0 moved / 0 ambiguous / 0 resolved**, deterministic (byte-identical on re-run);
   tests cover exact-existing, line-only movement, verified rename, path canonicalization, count
   increase, count decrease/resolution, count-stable remove-and-reintroduce, competing→ambiguous,
   delete+recreate, deterministic ordering, incompatible-baseline suspension, one-to-one enforcement.
6. **Accepted as the official v1.0 candidate mode.**

## Acceptance observations

- **`candidateIdentityVersion` (future planning increment).** Introduce a stable **candidate identity
  version** alongside `findingIdentityVersion`. Finding identity answers *"is this the same finding?"*;
  candidate identity answers *"is this the same review candidate?"* — these may diverge as the detector
  and the review-state model evolve independently. Versioning them separately now avoids conflating
  **detector evolution** with **review-state evolution** later. Not required for v1.0; add in a future
  candidate-mode planning increment.
- **Coverage is bounded** by the accepted **detector v1.0 scope** (inherited from the evidence /
  measurement / advisory baselines). **0 candidate-new means no drift relative to the accepted
  baseline — not proof the repository is free of language issues** outside detector scope.
- The false-negative gaps identified in the §1 re-review (within-file remove-and-reintroduce, path
  aliases, delete+recreate) are surfaced as `ambiguous` for human judgment; candidate mode being
  non-blocking, an uncertain case is a review signal, never a failure.

## Boundaries this acceptance does NOT authorize

Blocking CI / the candidate→blocking transition; remediation; detector expansion; or Phase 4.

**Blocking mode remains unauthorized and is not yet plannable.** Before blocking is even *planned*,
evidence is required that: the identity model's **false-positive rate is acceptable**; the **§1
false-negative gaps are closed or consciously accepted**; the **exception workflow has been
exercised**; **rollback has been demonstrated**; and **emergency bypass has been tested**.

## Artifacts in this baseline

| File | Role |
|---|---|
| `BE3-CANDIDATE-REVIEW-v1.0.json` | authoritative canonical candidate result |
| `BE3-CANDIDATE-REVIEW-v1.0.report.md` | derived human review report |
| `BE3-CANDIDATE-MODE-v1.0.md` | this acceptance record |

On merge + `verify-merge.sh --mirror-mode ancestor` verification, the merged commit — which contains
the classifier, CLI, tests, review artifact, and this acceptance record — is bound permanently by the
annotated tag **`be3-candidate-mode-v1.0`**.

# BE-3 Blocking Readiness Evaluation — Plan (planning)

> **Status: PLANNING — for review. No implementation.** This is **not** blocking-mode planning and it
> **must not design or implement** blocking CI, merge failures, or production enforcement. Its sole
> purpose is to **determine whether the prerequisites for even *planning* blocking enforcement have
> been met**, by producing (later, under separate authorization) an **evidence package** that answers:
>
> > *Is candidate mode trustworthy and operationally safe enough for Blocking Mode planning to begin?*
>
> Only a **later governed review** may answer that question and authorize blocking planning. Bounded to
> the accepted v1.0 anchors (`be3-*-v1.0` tags). Governance context: `CANDIDATE_MODE_PLAN.md`,
> `candidate/BE3-CANDIDATE-MODE-v1.0.md`, [[crowdexpanse-be-lifecycle]].

## Design principle

The evaluation is **read-only, deterministic, non-blocking, and evidence-only.** It designs five gates
and an evidence schema; it **presents evidence for a later governed decision** and deliberately
**invents no production-readiness threshold**. This document is the *methodology*; running it to
produce the evidence package is a **separate, later-authorized** execution step.

## Gate 1 — Candidate identity versioning

Introduce **`candidateIdentityVersion`** (`civ-1`), **distinct from** `findingIdentityVersion`
(`fiv-1`):

- **Finding identity** answers *"is this the same finding?"* (detector-level: `(ruleId,
  canonicalFile, matched)`).
- **Candidate identity** answers *"is this the same **review candidate**?"* — the stable identity of a
  review item **across runs and across classification changes.**

**Design note (a v1.0 gap this gate must resolve):** the current `candidateId` incorporates the
`classification` and `role`, so the *same* review item changes id if its classification evolves
(e.g. `ambiguous` → `candidate-new` after a later edit). A durable candidate identity must be
**classification-independent** so a candidate can be tracked, exempted, and audited across runs.

The evaluation must determine whether candidate identity remains **stable** across:
file moves and renames; repeated findings; remove-and-reintroduce changes; path canonicalization;
ambiguous matching; and baseline evolution. `candidateIdentityVersion` joins the **Prevention/Candidate
Compatibility Contract** — a change to the candidate-identity algorithm requires a **new baseline or an
approved migration, never a silent update.**

## Gate 2 — Controlled evaluation corpus

A **committed, synthetic, deterministic** corpus (fixtures, **not** the live repo — so ground truth is
known and stable), consisting of an accepted baseline plus labelled "current" variants covering:
genuine new drift; harmless line movement; file renames; duplicate additions; resolved findings;
reintroduced violations; competing matches; and incompatible baselines.

Each case carries an explicit **ground-truth label** (`real-drift` vs `harmless`, plus the expected
classification), enabling measured FP/FN. The corpus and its labels are content-addressed and versioned.

## Gate 3 — False-positive / false-negative methodology

Run candidate mode over the corpus and map each case to a confusion matrix:

- **Positive** = flagged for attention (`candidate-new`); **Negative** = not flagged
  (`existing`/`moved`/`resolved`); **`ambiguous`** = a distinct human-review bucket (a "safe" outcome,
  never a silent miss).
- Report, per rule and overall: **true positives; false positives; true negatives; false negatives;
  ambiguous; unclassified**. Distinguish a **silent FN** (real drift classified `existing`) from an
  **ambiguous FN** (real drift surfaced as `ambiguous` for review) — the former is the dangerous class.

**Do not invent a production-readiness threshold.** Present the numbers; a later governed review sets
any bar. Determinism: same corpus + same candidate version → identical counts.

## Gate 4 — Exception workflow exercise

Demonstrate, **non-blocking and simulated** (no CI, no enforcement), an exception record with:
`ruleId`, `candidateId`, `justification`, `approver`, `expirationDate`, and an **append-only audit
entry**. Show:
- **request → justification → approver → expiration** lifecycle;
- **expiration behavior** — after expiry the finding **returns to `candidate-new`**;
- **revocation behavior** — revoke before expiry → returns to `candidate-new`.

**At least one simulated exception must expire and return to `candidate-new`.** An exception is metadata
layered on candidate output; it **never mutates the baseline** and **never reclassifies drift to
`existing`.** (Time is injected deterministically — a supplied `evaluatedAt`, never wall-clock.)

## Gate 5 — Suspension and rollback demonstration

Demonstrate that candidate/prevention evaluation **safely suspends** (evaluates nothing, reports why)
when **any** of these change: `detectorVersion`, `ruleSetHash`, `scopeHash`, `measurementSeriesId`,
`baselineTag`, `findingIdentityVersion`, **`candidateIdentityVersion`**, or when the **classifier
self-check behaves unexpectedly** (a determinism/consistency self-test fails). Demonstrate **rollback**
= de-escalating mode (candidate → suspended) with an audit entry. **No production deployment or source
modification is required or performed.**

## Gate 6 — Emergency-bypass design (define, do NOT activate)

Define — as a **paper design only**, activating nothing — a bypass of a *future* blocking gate:
`authorizer` (named role); `requiredReason`; `maxDuration`; `affectedRules`/`affectedCandidates`
(explicitly scoped); `auditRecord`; `automaticExpiry`; and a mandatory `retrospectiveReview`.

**Invariants:** a bypass **never silently rewrites the baseline**, **never classifies drift as
`existing`**, is always **logged**, **auto-expires**, and is **retrospectively reviewed.** Because
blocking is not active, this gate produces a specification, not a mechanism.

## Gate 7 — Evidence-output schema

The evaluation (when later executed) emits a deterministic **evidence package**: authoritative JSON +
derived report, content-addressed to the candidate-mode and baseline versions:

```jsonc
{
  "evaluationSpec": "BE3-BLOCKING-READINESS-v1",
  "versions": { "findingIdentityVersion": "fiv-1", "candidateIdentityVersion": "civ-1",
                "candidateSpec": "BE3-CANDIDATE-v1", "baselineTag": "be3-candidate-mode-v1.0" },
  "gate1_candidateIdentity": { "stableAcross": { "renames": true, "repeats": true, "removeReintroduce": true,
                               "pathCanonicalization": true, "ambiguous": true, "baselineEvolution": true } },
  "gate2_3_confusion": { "byRule": [ { "ruleId": "R-…", "tp": 0, "fp": 0, "tn": 0, "fn_silent": 0,
                               "fn_ambiguous": 0, "ambiguous": 0, "unclassified": 0 } ], "overall": { } },
  "gate4_exceptions": [ { "candidateId": "…", "ruleId": "…", "approver": "…", "expirationDate": "…",
                               "outcome": "expired→candidate-new" | "revoked→candidate-new", "auditRef": "…" } ],
  "gate5_suspension": [ { "trigger": "ruleSetHash changed", "result": "suspended", "auditRef": "…" } ],
  "gate6_bypassDesign": { "authorizer": "…", "maxDuration": "…", "autoExpiry": true, "retrospectiveReview": true },
  "provenance": { "corpusDigest": "…", "candidateModeTag": "be3-candidate-mode-v1.0" }
}
```

Every count/outcome is reproducible; a human report is derived from the JSON.

## Gate 8 — Readiness criteria (questions, not thresholds)

The evidence package answers — for a **later** governed review — each of:
1. Is **candidate identity stable** across the six change types (Gate 1)?
2. What are the **FP/FN** numbers, and how many FNs are **silent** vs **ambiguous** (Gate 3)?
3. Does the **exception workflow** demonstrably work, including **expiry and revocation** (Gate 4)?
4. Is **suspension/rollback** demonstrably safe across all identity/version changes (Gate 5)?
5. Is the **emergency-bypass design** complete and non-silent (Gate 6)?

**No threshold is set here.** Readiness = a later governed review judges these answers sufficient and
explicitly authorizes **Blocking Mode planning** (still a further, separate step).

## Gate 9 — Explicit non-goals

This initiative implements **none** of: blocking CI; merge failures; production enforcement;
remediation; detector expansion; schema/API/UI/prompt changes; Phase 4. It also **does not** design
blocking mode itself, nor set any production-readiness threshold.

## Gate 10 — Stop conditions

**Planning only** — stop after this document for review. Execution (building the corpus + evaluation
harness and producing the evidence package) is a **separate, later-authorized** step; even then, the
evidence package only **informs a later governed review** that alone may authorize blocking planning.

## Proposed execution artifacts (only if this plan is approved, and under separate authorization)

- A committed synthetic corpus + labels under `docs/business/evolution/be-3/blocking-readiness/`.
- `lib/governance/be3-blocking-readiness.ts` — pure, read-only evaluation harness over candidate mode.
- `scripts/diag/be3-blocking-readiness.ts` — CLI emitting the evidence JSON + derived report (exit 0).
- `tests/unit/governance/be3-blocking-readiness.test.ts`.
- **No blocking CI, no enforcement, no product/schema/API/UI/prompt changes.**

---

*Bounded to the accepted v1.0 anchors. Planning only — stop for review. Evidence, not enforcement.*

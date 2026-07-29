# BE-3 Candidate Identity — Increment 2 Implementation Report

> **Status: for review (Candidate Identity Increment 2 Review). ISOLATED, DIAGNOSTIC,
> NON-AUTHORITATIVE.** This increment adds a standalone compatibility contract
> (`lib/governance/be3-compatibility-contract.ts`, CLI, tests, this report). It changes **no** candidate
> identity generation (`civ-1`/`civ-2`), candidate classification, migration, rename handling, baseline
> evolution, detector behavior, or language rules, and introduces **no** blocking CI. Governance
> context: `../CANDIDATE_IDENTITY_HARDENING_PLAN.md`, `CANDIDATE_IDENTITY_INCREMENT1_ACCEPTANCE.md`.

## Objective

Integrate `candidateIdentityVersion` into the compatibility contract so that incompatible identity
versions **suspend** evaluation rather than producing misleading candidate classifications.

## What was built

`evaluateCompatibility(accepted, current)` — pure, deterministic, side-effect-free. It compares eight
fields **independently**, reports **every** incompatibility (never a generic failure), and returns a
suspension decision that stops **before** any candidate classification.

- **Fields (evaluated independently):** `findingIdentityVersion`, `candidateIdentityVersion`,
  `classificationAlgorithmVersion`, `detectorVersion`, `ruleSetHash`, `scopeHash`, `measurementSeriesId`,
  `baselineTag`.
- **Deterministic precedence:** identity-version → detector/rule/scope → measurement → baseline (fixed
  field order within groups). Incompatibilities are reported in that order.
- **Per-incompatibility record:** `field`, `group`, `expected`, `actual`, `reason`.
- **Suspension outcome:** `mode = suspended`, `classification = none`, `candidateEvaluation = skipped`,
  with a `reason` that names **every** incompatible field — no partial evaluation, no best-effort, no
  fallback, no silent regeneration.

## Result classification (no percentages)

| Behavior | Classification |
|---|---|
| Fully compatible contract → `proceed` | **proven** |
| `candidateIdentityVersion` mismatch → suspended | **suspended by design** (proven) |
| `findingIdentityVersion` mismatch → suspended | **suspended by design** (proven) |
| `classificationAlgorithmVersion` mismatch → suspended | **suspended by design** (proven) |
| `detectorVersion` / `ruleSetHash` / `scopeHash` mismatch → suspended | **suspended by design** (proven) |
| `measurementSeriesId` / `baselineTag` mismatch → suspended | **suspended by design** (proven) |
| Multiple simultaneous mismatches → all reported | **proven** |
| Deterministic precedence ordering | **proven** |
| Repeated execution → identical output | **proven** |
| Suspension stops before classification (`skipped` + `none`) | **proven** |
| No ID regeneration on suspension | **proven** (the contract imports no identity generator and produces no IDs) |
| No baseline mutation | **proven** (pure function; no writes) |
| Wiring the contract into the live `runCandidate` classifier | **deferred** (would change candidate classification — out of scope) |
| Enforcing `candidateIdentityVersion` in production | **deferred** (requires `civ-2` authoritative — Increment 5) |
| `classificationAlgorithmVersion` semantics beyond equality (e.g. re-label vs suspend) | **intentionally unsupported here** (equality-based only; richer policy is later work) |

## What is proven

- Each of the eight fields is evaluated **independently**; **all** incompatibilities are reported,
  never collapsed.
- Any incompatibility ⇒ **suspended**, `classification = none`, `candidateEvaluation = skipped`; the
  reason identifies every incompatible field.
- **No partial/best-effort/fallback/silent-regeneration**, and evaluation stops before classification.
- **Deterministic** ordering and output (repeated runs byte-identical).
- The contract **regenerates no IDs and mutates nothing** (it imports neither the classifier nor the
  identity generators).

## What is deferred / out of scope

Actually **wiring** this contract into the live candidate classifier, enforcing it in production, and
making `candidateIdentityVersion` authoritative are **not** part of Increment 2 (they would change
candidate classification and require the Increment-5 baseline). `civ-1` remains authoritative.

## No stop-condition was triggered

No modification of candidate classification, `civ-2`, accepted evidence, accepted baselines, migration
logic, rename inference, baseline-evolution logic, or blocking enforcement was required.

## Scope confirmation

Added files only: `lib/governance/be3-compatibility-contract.ts`,
`scripts/diag/be3-compatibility-contract.ts`, `tests/unit/governance/be3-compatibility-contract.test.ts`,
and this report. No change to the classifier, `civ-1`/`civ-2` identity, baselines, evidence, CI, detector
rules, or product code. The contract is **diagnostic, not enforcement**, and is **not wired into
anything**.

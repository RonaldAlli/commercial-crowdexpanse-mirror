# BE-3 Candidate Identity — Increment 3 Implementation Report

> **Status: for review (Candidate Identity Increment 3 Review). ISOLATED, DIAGNOSTIC,
> NON-AUTHORITATIVE.** Adds a repository-lineage layer (`lib/governance/be3-candidate-lineage.ts`, a diagnostic
> CLI, tests, this report). It **reuses** the civ-2 identity module (Increment 1) as a **read-only
> interface** and changes nothing in it, in the compatibility contract (Increment 2), in candidate
> classification, in the detector, or in accepted evidence/baselines. It performs **no migration**, **no
> baseline rewriting**, and makes **no hardened identity authoritative**. History is append-only.
> Governance context: `../CANDIDATE_IDENTITY_HARDENING_PLAN.md`, Increment 1/2 acceptance records.

## Objective

Determine whether a current finding should be treated as the **same review item** as a previous
candidate across repository evolution — establishing lineage **rules**, not migration or baseline
replacement.

## Model

`evaluateLineage(previous, current, renames)` → `LineageReport` (pure, deterministic). Lineage state is
modeled **independently** from compatibility and classification:

`LineageStatus = sameCandidate | renamed | reintroduced | split | merged | ambiguous | unrelated`

- **Rename continuity requires evidence.** Only `VerifiedRename`s (`repo-metadata` or
  `content-continuity`) are applied; **filename similarity alone is never used**. Two equally plausible
  predecessors (competing rename targets) ⇒ `ambiguous`. Lineage is **never invented**.
- **Baseline evolution** distinguishes `existing→resolved→reintroduced` from `existing→moved(renamed)`,
  from `existing→split→multiple`, and from `multiple→merged`. **History is append-only** — prior states
  are echoed, never rewritten; no accepted evidence is modified.
- **Reintroduction** reopens (`reintroduced`) **only** on deterministic lineage (single identity match
  to a resolved predecessor); otherwise `ambiguous` takes precedence over false certainty. A
  reappearance elsewhere without evidence is `unrelated` — **never silently `sameCandidate`** (no silent
  false negatives).

Identity is obtained from civ-2 (read-only); a finding whose identity is itself `ambiguous`/`rejected`
yields `ambiguous` lineage.

## Result classification (no percentages)

| Scenario | Result |
|---|---|
| Verified rename → `renamed` | **proven** |
| Resolved → reopened (deterministic) → `reintroduced` | **proven** |
| Split (new occurrence at an existing candidate's location) → `split` | **proven** |
| Merge (predecessor count exceeds current at a location) → `merged` | **proven** |
| Move + edit → `ambiguous` | **ambiguous by design** |
| Competing rename predecessors → `ambiguous` | **ambiguous by design** |
| Ambiguous reopen (competing) → `ambiguous` | **ambiguous by design** |
| Rename without evidence → `unrelated` | **proven** (no invented lineage) |
| Reappearance elsewhere without evidence → not silently same | **proven** (no silent FN) |
| Append-only prior states | **proven** |
| Deterministic repeated execution | **proven** |
| Wiring lineage into the live classifier / production | **deferred** (out of scope; would change classification) |
| Migration old→new baselines | **intentionally unsupported here** (Increment 4) |

## What is proven

- Evidence-gated rename continuity; competing predecessors and move+edit resolve to `ambiguous`, never
  fabricated lineage.
- Explicit lifecycle: `sameCandidate / renamed / reintroduced / split / merged / unrelated`, plus
  `ambiguous` wherever certainty is not deterministic.
- **Append-only** treatment of prior candidates (echoed with a transition; never mutated).
- **No silent false negatives** — reappearance without deterministic lineage surfaces as
  `unrelated`/`ambiguous`.
- Deterministic, side-effect-free evaluation; the module mutates nothing and makes nothing authoritative.

## Remaining upstream dependencies (recorded separately)

- **Context-anchor quality (carried from Increment 1).** Lineage precision depends on the detector
  supplying **stable context anchors** for civ-2 identity. Without them, occurrences are identity-
  `ambiguous`, so their lineage is `ambiguous`. Proving a reliable upstream context strategy remains a
  separate dependency (unchanged by this increment).
- **Rename evidence quality.** Lineage trusts the supplied `VerifiedRename` set; **producing** that
  evidence (git rename detection / content continuity) upstream is a later concern.

## Deferred / out of scope (not implemented)

Migration (Increment 4), baseline rewriting, corpus rerun (Increment 5), production integration, the
candidate-authority switch, and blocking behavior. `civ-1` remains authoritative.

## No stop-condition was triggered

No migration, baseline rewriting, `civ-2` change, compatibility change, classifier change, detector
change, accepted-evidence change, or authority switch was required.

## Scope confirmation

Added files only: `lib/governance/be3-candidate-lineage.ts`, `scripts/diag/be3-candidate-lineage.ts`,
`tests/unit/governance/be3-candidate-lineage.test.ts`, and this report. `be3-candidate-identity.ts`
(Increment 1) and `be3-compatibility-contract.ts` (Increment 2) are consumed **read-only** and are
**unchanged**. Not wired into anything; non-authoritative.

# BE-3 Candidate Identity — Increment 1 Implementation Report

> **Status: for review (Candidate Identity Increment 1 Review). NON-AUTHORITATIVE.** This increment
> adds an **isolated** `civ-2` identity capability (`lib/governance/be3-candidate-identity.ts`, CLI,
> tests, this report, a reproduction fixture). It changes **no** candidate classifier, compatibility,
> baseline, or evidence code — **`civ-1` remains authoritative.** Governance context:
> `../CANDIDATE_IDENTITY_HARDENING_PLAN.md`.

## Question answered

*Can a classification-independent candidate identity be generated deterministically and remain stable
under duplicate-sensitive repository changes?*

**Yes — conditionally, and honestly.** A deterministic, classification-independent identity is
generated **when the occurrence is distinguishable** by immutable/canonical evidence. When occurrences
are **indistinguishable** (identical rule + subject + location and no distinguishing context), the
generator returns **`ambiguous`** — it **does not fabricate** a "stable" ordinal. This is the
load-bearing result: the honest failure mode is explicit ambiguity, not a misleading ID.

## Identity model (as built)

`candidateId = "C-civ2-" + sha256( civ-2 ∥ ruleIdentity ∥ canonicalSubject ∥ canonicalLocation ∥
discriminator )[:24]` — namespaced and version-visible; not confusable with `R-*`, `L*`, `F-*`.

**Excluded from identity (by construction):** classification, candidate role, review status, **raw
line number**, timestamps, baseline acceptance state, and un-normalized mutable display text.
`findingIdentityVersion`, `candidateIdentityVersion` (`civ-2`), and `classificationAlgorithmVersion`
are kept as **independent** concepts; this module produces only `civ-2` identity and touches no other.

The **occurrence discriminator** is a **stable context anchor** (e.g. an enclosing symbol) supplied
per finding — **never** a line number or ordinal. Absent/insufficient context ⇒ ambiguity, not a
guess. Serialization uses an explicit unit-separator delimiter (rejected if present in inputs) and an
explicitly selected digest (SHA-256); output does not depend on JS object insertion order (canonical
serializer + order-independent collision detection).

## Component proofs (tested)

- **Rule identity** — equivalent references normalize identically (whitespace; known alias
  `R-HOM-2→R-HOM-002`); different rules never share identity; unknown or mismatched aliases are
  **rejected**.
- **Canonical semantic subject** — stable across harmless whitespace and equivalent quoting; case
  normalized **only** where the rule policy permits; **semantically meaningful differences preserved**
  (`match key` ≠ `match keys`; `Match` ≠ `match` by default).
- **Canonical repository location** — slash + relative-path normalization (`\`, `./`, `x/../`)
  converge; `..`-escaping and absolute/machine-root paths are **rejected**; distinct files stay
  distinct. **No rename inference** (deferred to Increment 3).
- **Occurrence discriminator** — the ten required scenarios (below).
- **Determinism** — byte-identical output on repeated runs; **order-independent** ID set; namespaced ID.

## Result classification (per required scenario — no pass percentage)

| Scenario | Result |
|---|---|
| Distinct context anchors (same rule/subject/file) | **proven stable / intentionally distinct** |
| Resolved ID under neighbor insert / after / removal / reposition | **proven stable** |
| Identical duplicate inserted **before** existing duplicates (no anchor) | **ambiguous by design** |
| Identical duplicate inserted **after** (no anchor) | **ambiguous by design** |
| One duplicate **removed** (distinct-anchor survivors) | **proven stable** (survivor IDs unchanged) |
| Duplicates **reordered** | **proven stable** (order-independent) |
| One occurrence **split** into two (retained anchor + new anchor) | **proven stable** (retained) + **intentionally distinct** (new) |
| Two occurrences **collapsed** into one | **proven stable** (survivor) |
| Identical findings on **different lines** (line excluded) | **ambiguous by design** |
| Identical findings in **different structural contexts** (anchors) | **intentionally distinct** |
| Identical findings in **different files** | **intentionally distinct** |
| Repeated generation from **byte-identical input** | **proven stable** (deterministic) |
| Empty ruleId / reserved delimiter / unknown alias / `..`-escape / absolute path | **rejected as invalid input** |

Reproduction fixture (`fixture-inputs.json`) demonstrates resolved, ambiguous, and rejected outcomes
deterministically via the CLI.

## What is proven

- A **classification-independent** identity that is **byte-identical deterministic** and
  **order-independent**.
- Identity **stability under insertion / removal / reordering / split / collapse** for occurrences that
  carry a **stable distinguishing context**.
- **Line number, classification, role, and timestamps are excluded** and cannot affect identity.
- Indistinguishable occurrences are **explicitly ambiguous**, never assigned a fabricated ordinal.
- Invalid inputs are **rejected**, not silently coerced.

## What remains unresolved (for later increments — NOT resolved here)

- **Occurrences with no stable context anchor cannot be individually and durably identified.** This is
  a *property of the evidence*, not a bug: without contextual information there is no honest per-
  occurrence identity, so the generator returns `ambiguous`. Whether the **detector can supply a
  reliable context anchor** (enclosing symbol / structural path) is an open input-quality question for
  a later increment; until it can, such duplicates remain `ambiguous`.
- The `unresolved` status is reserved (distinct from `ambiguous`) for future cases where a required
  stable input is absent but the finding is not a collision; **not emitted** in this increment.
- **Verified rename continuity** (Increment 3), **compatibility suspension** (Increment 2), **baseline
  evolution / reintroduction** (Increment 3), and **migration** (Increment 4) are **out of scope** and
  untouched.

## No stop-condition was triggered that invalidates the approach

A discriminator **can** survive duplicate insertion/removal **when** distinguishing context exists;
where it cannot, the module returns ambiguity (the sanctioned outcome). Identity does **not** require
classification to be stable. Canonicalization does not erase rule-significant differences. No classifier
change and no v1.0 artifact modification were required.

## Scope confirmation

Added files only: `lib/governance/be3-candidate-identity.ts`, `scripts/diag/be3-candidate-identity.ts`,
`tests/unit/governance/be3-candidate-identity.test.ts`, this report, and `fixture-inputs.json`. No
change to `be3-language-candidate.ts` (classifier), compatibility, baselines, or evidence artifacts.
`civ-2` is **not authoritative** and is not wired into anything.

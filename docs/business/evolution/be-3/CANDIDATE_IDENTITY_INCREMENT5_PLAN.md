# BE-3 Candidate Identity — Increment 5 Plan: Corpus Rerun, New Baseline Evidence, Authority Readiness (planning)

> **Status: PLANNING — for review. No implementation.** Increment 5 combines evidence generation,
> baseline governance, and a *possible* authority transition — so it is planned before execution. **The
> plan does NOT presume the evidence will support an authority switch.** Bounded to Increments 1–4
> (`civ-2` identity, compatibility contract, lineage, migration evidence), all currently isolated and
> non-authoritative; `civ-1` remains authoritative. Governance context:
> `CANDIDATE_IDENTITY_HARDENING_PLAN.md`, the Increment 1–4 acceptance records,
> `blocking-readiness/BE3-BLOCKING-READINESS-EVIDENCE-v1.0.md`, [[crowdexpanse-be-lifecycle]].

## Planning objective

Define the exact, deterministic, read-only process to: rerun the accepted readiness corpus against
Increments 1–4; add only the minimum new cases needed for hardened identity; generate a new evidence
package; evaluate migration mappings; and then, as **separate governed steps**, decide whether a new
candidate baseline may be accepted and whether `civ-2` is ready to become authoritative. Execution is a
**later, separate authorization**; even then, an authority switch is never automatic.

## 1. Corpus provenance

- **Reuse the EXACT accepted corpus** `blocking-readiness/corpus.json` (from
  `be3-blocking-readiness-evidence-v1.0` @ `89a945f`) — content-addressed; **old expected outcomes are
  preserved verbatim** for side-by-side comparison.
- **Add only the minimum** new cases required to exercise hardened identity — each **identified and
  justified**. Candidate additions (to be finalized at review):
  - *classification-independence* (same review item, changed classification → identity stable);
  - *verified rename continuity* (identity preserved across a verified rename);
  - *ambiguous reopen / competing rename* (stays ambiguous);
  - *split / merge* mapping into migration (`oneToMany` / `manyToOne` → review);
  - *baseline-evolution* append-only lineage;
  - *incompatible identity-version suspension* (`candidateIdentityVersion` mismatch → suspended);
  - *indistinguishable duplicates* (ambiguous, never fabricated ordinal).
- **No case is removed or its old outcome altered** — additions are append-only to the corpus; the
  original cases must reproduce their original outcomes.

## 2. Version contract

The evidence package records **all** of, evaluated independently:
`findingIdentityVersion` · `candidateIdentityVersion` · `classificationAlgorithmVersion` ·
`migrationSchemaVersion` · detector version · `ruleSetHash` · `scopeHash` · `measurementSeriesId` ·
`baselineTag`.

- **Decision — `migrationSchemaVersion` must be implemented before execution.** Per the Increment-4
  governed observation, migration evidence must carry an independent `migrationSchemaVersion` **before**
  it becomes part of an authoritative baseline. Since Increment 5's evidence package **includes
  migration mapping evidence** and may feed a new baseline, `migrationSchemaVersion` (`msv-1`) is a
  **prerequisite** of execution — a small, isolated, non-authoritative addition to the migration
  tooling (its own governed increment/step), completed and accepted **before** the corpus rerun that
  produces the candidate baseline. *(For review: alternatively, execute the rerun for evidence-only and
  defer `migrationSchemaVersion` until just before any baseline acceptance — but the safer ordering is
  to add it first.)*

## 3. Evidence outputs

The rerun (read-only, deterministic) produces a single content-addressed evidence package: **canonical
JSON (authoritative) + derived report**, containing:
- **migration mapping evidence** (Increment 4);
- **compatibility result** (Increment 2 — per-field, suspension outcomes);
- **lineage outcomes** (Increment 3 — per-case `LineageStatus`);
- **identity stability outcomes** (Increment 1 — classification-independence, rename, path,
  baseline-evolution, duplicates);
- **confusion matrix** (TP/FP/TN/FN, with **silent-FN vs ambiguous-FN** distinguished; unclassified);
- **ambiguous and unresolved review queue** (deterministically ordered).
Every version field from §2 is stamped; the package is byte-identical on rerun and content-addressed to
the corpus + versions.

### 3a. Evidence Manifest (immutable, in the canonical package)

Every evidence package **must include an immutable Evidence Manifest** so a future evaluation can
reproduce it exactly. The manifest records every identifier used to produce the package:

```
Evidence Manifest
  findingIdentityVersion
  candidateIdentityVersion
  classificationAlgorithmVersion
  migrationSchemaVersion
  detectorVersion
  ruleSetHash
  scopeHash
  measurementSeriesId
  baselineTag
  generatedAt        (deterministic — supplied input, never wall-clock)
  generatorVersion   (the rerun harness version)
```

The manifest is part of the **canonical JSON** (content-addressed with the rest of the package),
**immutable**, and never rewritten — a superseding package carries a new manifest, not an edit. Any
mismatch between a manifest field and the accepted baseline is a **suspension** trigger (§7).

## 4. Acceptance questions (evidence answers them; a governed review judges)

1. Are **all known material gaps** from `BE3-BLOCKING-READINESS-EVIDENCE-v1.0` closed?
2. Are **any silent false negatives** present? (Any silent FN is disqualifying for authority.)
3. Are **rename and baseline-evolution identities stable**?
4. Does **ambiguity remain visible** (never downgraded)?
5. Are **non-one-to-one migration mappings** (oneToMany/manyToOne/ambiguous/unmapped) **reviewed**?
6. Is **compatibility suspension complete** across all version fields (incl. `candidateIdentityVersion`,
   `migrationSchemaVersion`)?
7. Is the evidence **deterministic and reproducible** (byte-identical; content-addressed)?

**No pass threshold is defined here.** The evidence is presented for a governed review.

## 5. Authority gate (a switch is never automatic)

**New-baseline acceptance is separate from the implementation merge.** `civ-2` may become authoritative
**only after ALL** of, in order:
```
evidence review → acceptance record → merge → verification → annotated tag → EXPLICIT authority-switch decision
```
Each step is its own governed decision. The **explicit authority-switch decision** is a distinct,
final governed act — the tag alone does not switch authority. Until it is made, **`civ-1` remains
authoritative.**

## 6. Failure outcomes (all preserve `civ-1` authority)

The governed review may conclude any of:
- **Accepted with material gaps** (evidence preserved; **no** authority switch);
- **Accepted with observations** (evidence preserved; authority switch only if separately decided);
- **Rejected** (evidence preserved as history; no baseline);
- **New baseline not authorized** (evidence may be accepted, but not promoted);
- In **every** failure outcome, **`civ-1` remains authoritative** and `civ-2` non-authoritative.

## 7. Rollback and suspension

- **Suspension on version mismatch** — if any of the §2 version fields differ from the accepted
  baseline, evaluation **suspends** (per the Increment-2 contract, extended to `candidateIdentityVersion`
  / `migrationSchemaVersion`): `mode = suspended`, no classification/migration proposal is treated as
  authoritative.
- **Authority remains on `civ-1`** if **any** acceptance step (review, record, merge, verification, tag,
  explicit switch) fails or is not completed.
- **No in-place rollback of historical evidence** — prior evidence packages, acceptance records, and
  tags are immutable/append-only; a superseding baseline is a new record, never a rewrite.

## 8. Explicit non-goals

No blocking CI; no merge enforcement; no production deployment; no detector expansion; no remediation;
no Phase 4; **no automatic authority switch**. This plan also does **not** itself run the corpus,
generate evidence, create a baseline, tag, or switch authority.

## Stop conditions

**Planning only** — stop after this document for review. Execution (any of: `migrationSchemaVersion`
addition, corpus rerun, evidence generation, baseline acceptance, tagging, authority switch) is a
**separate, later authorization**, each step gated. Blocking Mode planning remains unauthorized.

## Proposed execution ordering (only if this plan is approved, under separate authorizations)

1. Add `migrationSchemaVersion` (`msv-1`) — isolated, non-authoritative (per §2).
2. Corpus rerun harness (reuse exact corpus + minimum added cases) → deterministic evidence package (§3).
3. Governed **evidence review** answering §4.
4. **Only if warranted:** new-baseline acceptance record → merge → verify → annotated tag.
5. **Separately:** explicit authority-switch decision (§5) — the only step that makes `civ-2`
   authoritative; may be declined at any point, leaving `civ-1` authoritative.

---

*Bounded to Increments 1–4. Planning only — stop for review. The plan does not presume an authority switch.*

# BE-3 Candidate Identity Hardening — Plan (planning)

> **Status: PLANNING — for review. No implementation.** Bounded to closing the six material gaps in
> `blocking-readiness/BE3-BLOCKING-READINESS-EVIDENCE-v1.0.md` (tag `be3-blocking-readiness-evidence-v1.0`
> @ `89a945f`). This plan changes **no** candidate-classifier code, migrates **no** artifacts, reruns
> **no** corpus, and authorizes **no** exceptions/bypass, blocking CI, blocking planning, remediation,
> detector/rule/scope change, or Phase 4. Governance context: `CANDIDATE_MODE_PLAN.md`,
> `blocking-readiness/BLOCKING_READINESS_EVALUATION_PLAN.md`, [[crowdexpanse-be-lifecycle]].

## 1. Current gaps and evidence

From the accepted evidence (six "Not proven" items):
1. **classification-independent candidate identity** — `classificationIndependence = false`;
2. **rename identity stability** — `false`;
3. **baseline-evolution identity stability** — `false`;
4. **`candidateIdentityVersion` enforcement** — proposed, **not wired**;
5. **conclusive reintroduction classification** — reintroduced drift surfaced `ambiguous`, not conclusive;
6. **blocking operational readiness** — not proven.

**Root cause:** the v1.0 `candidateId` = `hash(ruleId, canonicalFile, matched, classification, role,
line)` — it embeds **mutable review state** (`classification`, `role`) and the **volatile line number**,
so a candidate's id changes when its classification evolves or the file shifts.

## 2. Identity model and versioning (three distinct, independently-versioned concepts)

| Version | Question it answers | Governs |
|---|---|---|
| `findingIdentityVersion` (`fiv`) | *Is this the same detected violation?* | detector-level identity |
| `candidateIdentityVersion` (`civ`) | *Is this the same review item?* | durable, classification-independent candidate id |
| `classificationAlgorithmVersion` (`cav`) | *How is that review item categorized now?* | the precedence/classifier logic |

**A change to one must NOT silently mutate the others.** Each carries its own version label and its own
compatibility handling (§8).

**Proposed hardened candidate identity (`civ-2`) — to be *justified and tested*, not assumed:**

```
candidateId = hash( ruleIdentity + canonicalSemanticSubject
                    + canonicalRepositoryLocationIdentity + occurrenceDiscriminator )
```
- `ruleIdentity` = `ruleId` (+ `lId`).
- `canonicalSemanticSubject` = the normalized matched subject (per-rule case/whitespace policy).
- `canonicalRepositoryLocationIdentity` = canonical path (realpath + alias + **verified-rename**
  normalized) — **not** the raw line number.
- `occurrenceDiscriminator` = a **stable** per-location discriminator distinguishing multiple
  occurrences of the same subject in the same file **without the volatile absolute line** (candidate
  options: stable ordinal among same-key occurrences, or a content-anchored fingerprint of surrounding
  evidence). The chosen discriminator **must be justified and tested** (line moves must not change it; a
  genuinely new occurrence must receive a new one).

**Explicitly EXCLUDED from candidate identity:** `classification`, `role`, and the raw line number.

## 3. Classification independence

The `candidateId` **must not** include `existing / candidate-new / moved / ambiguous / resolved` or
`role`. Classification is a **separate attribute** attached at evaluation time; it may change across
runs while the `candidateId` stays constant. **Test:** the same review item across two runs with
different classifications → **identical** `candidateId`.

## 4. Rename / move identity rules

A verified rename preserves candidate identity. **Filename similarity alone is insufficient.**
Precedence of evidence:
1. **Repository rename metadata** (git rename/similarity detection) — strongest.
2. **Content similarity** (surrounding evidence / normalized subject context matches).
3. **Canonical path mapping** (explicit alias/rename map).
4. **One-to-one pairing** — a baseline location maps to exactly one current location.
5. **Ambiguity** — if multiple plausible source locations exist, classify **`ambiguous`** (human
   review); never a greedy guess.

A move backed by (1)–(4) preserves the `candidateId`; otherwise the candidate is `ambiguous`.

## 5. Baseline-evolution rules (append-only lineage)

Define behavior when:
- an existing candidate is **resolved** → recorded `resolved` in **append-only** history; lineage kept;
- it later **reappears** → §6 reintroduction policy (reopened vs new vs ambiguous — never silent);
- the same violation **moves to another file** → §4 (identity preserved on verified move, else ambiguous);
- the **baseline is reaccepted** → a **new** candidate baseline is accepted + tagged; prior lineage is
  **preserved (append-only), never erased**;
- **detector/rule/scope versions change** → **suspension** (§8); new baseline required;
- **occurrence counts split or merge** → one-to-many / many-to-one → **require review** (never auto-collapse).

A candidate's **lineage** is the append-only chain of `(baselineTag, candidateId, classification)`
records. **Rebaselining must not erase original candidate lineage.**

## 6. Reintroduction policy

When a previously-resolved violation reappears, classify it as **same-candidate-reopened**,
**new-candidate**, or **ambiguous-pending-review** — **prioritising avoidance of silent false negatives
over maximal automatic classification**:
- reappears at the **same** canonical location + subject → **reopened** (`candidateId` preserved),
  visibly flagged;
- reappears **elsewhere** with a **verified** move → reopened via §4;
- reappears elsewhere **without** verified evidence → **`ambiguous` (pending review)** (default when
  uncertain);
- **never** silently classify a reintroduced violation as `existing`.

## 7. v1.0 → hardened identity migration

Explicit, reviewed migration from `civ-1` to `civ-2`:
1. **Generate old (`civ-1`) and new (`civ-2`) IDs side by side** for every accepted-baseline candidate.
2. Build a **deterministic** mapping old → new.
3. **Classify each mapping:** one-to-one; one-to-many; many-to-one; unmapped; ambiguous.
4. **Require human review for every non-one-to-one result.**
5. **Preserve v1.0 IDs and acceptance history** — append-only; **no in-place rewrite of prior evidence
   artifacts** (the v1.0 tags/records stay immutable).
6. **Accept and tag a new candidate baseline** (e.g. `be3-candidate-mode-v1.1`) **before** the hardened
   identity becomes authoritative.
7. **Suspend candidate evaluation during incompatible transition states** (`civ` mismatch → suspended).

## 8. Compatibility suspension

Candidate evaluation **suspends** when the accepted `candidateIdentityVersion` differs from the
classifier's:
```
mode   = suspended
reason = "Candidate identity baseline incompatible. New baseline acceptance or approved migration required."
```
**No fallback to the old identity. No silent ID regeneration.** This joins the existing Prevention
Compatibility Contract triggers (`detectorVersion`, `ruleSetHash`, `scopeHash`, `measurementSeriesId`,
`findingIdentityVersion`) with the new `candidateIdentityVersion`. A `classificationAlgorithmVersion`
change is **recorded** but does **not** suspend identity (identities remain stable; only labels may
differ) — this separation is deliberate and must be tested.

## 9. Corpus rerun and evidence schema

**Reuse the EXACT accepted readiness corpus** (`blocking-readiness/corpus.json`) and **add only the
minimum** cases needed to test identity hardening. Define expected outcomes for:
stable classification changes; rename preservation; competing rename candidates; resolve-and-reopen;
remove-and-reintroduce; baseline evolution; one-to-many and many-to-one migration; deterministic ID
generation; incompatible identity-version suspension.

Evidence schema records `versions {fiv, civ, cav}`, per-case outcomes, the migration mapping
classification counts, suspension outcomes, and determinism — content-addressed to the corpus and
versions. (Running it is a **separate, later-authorized** execution step; this plan only designs it.)

## 10. Acceptance criteria (for the eventual implementation)

1. `candidateId` is **classification-independent** (proven by test).
2. `fiv`/`civ`/`cav` are distinct and independently handled; a change to one never silently mutates another.
3. `candidateIdentityVersion` mismatch → **suspend** with the exact reason; no fallback, no silent regen.
4. Rename/move preserves identity **only on verified evidence**; ambiguous otherwise.
5. Baseline-evolution history is **append-only**; lineage preserved across rebaseline.
6. Reintroduction **prioritises no-silent-FN**.
7. Migration yields a **reviewed** old→new mapping; every non-one-to-one requires review; **v1.0
   artifacts remain immutable**; a new candidate baseline is accepted + tagged before hardened identity
   is authoritative.
8. Deterministic throughout; reuses the exact corpus.

## 11. Explicit non-goals

No blocking CI; no Blocking Mode planning; **no candidate-classifier change** (this is planning); no
migration execution; no corpus rerun; no exceptions/bypass; no remediation; no detector/rule/scope
change; no Phase 4.

## 12. Stop conditions

**Planning only** — stop after this document for review. Implementation (hardened identity, migration
harness, corpus rerun, new-baseline acceptance) is a **separate, later-authorized** step, each gated;
hardened identity becomes authoritative **only after** a new candidate baseline is accepted and tagged.

## Proposed implementation artifacts (only if approved, under separate authorizations)

- Hardened candidate identity (`civ-2`) added **behind versioning** — the current `civ-1` classifier
  stays authoritative until the migration + new baseline are accepted.
- Migration harness (old/new side-by-side + deterministic mapping + non-one-to-one review output).
- A corpus-rerun harness reusing the **exact** corpus + minimum added cases.
- Focused tests. New candidate baseline acceptance + tag.
- **No blocking CI, no product/schema/API/UI/prompt changes, no rewrite of prior evidence artifacts.**

---

*Bounded to closing the six recorded gaps. Planning only — stop for review.*

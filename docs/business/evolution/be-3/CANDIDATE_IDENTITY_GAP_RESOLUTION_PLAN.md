# BE-3 Candidate Identity Hardening — Gap Resolution Planning

> **Status: PLANNING ONLY — for the governed Gap Resolution Planning Review.** This document defines how
> the four evidence-derived gaps from the Increment 5B rerun **could be investigated**; it does **not**
> choose solutions, commit to architecture, or authorize work. It reopens **no** accepted evidence and
> changes **no** current behavior. `civ-1` remains authoritative; `civ-2` remains non-authoritative.
> Context: `candidate-identity/CANDIDATE_IDENTITY_INCREMENT5B_REPORT.md`,
> `candidate-identity/CANDIDATE_IDENTITY_INCREMENT5B_ACCEPTANCE.md`,
> `candidate-identity/CANDIDATE_IDENTITY_INCREMENT5_EVIDENCE_ACCEPTANCE_REVIEW.md`,
> `candidate-identity/rerun/BE3-CANDIDATE-IDENTITY-RERUN-EVIDENCE-v1.0.json`, [[crowdexpanse-be-lifecycle]].
>
> **Not authorized by this document:** implementation, an evidence cycle, baseline proposal or
> acceptance, tagging, authority work, Blocking Mode planning, detector/migration/architecture redesign.

## Purpose and boundaries

This is a **governance-planning initiative only**. Its purpose is to identify, for each remaining gap,
the **option space**, the **evaluation criteria**, and the **evidence requirements** — *not* to select an
implementation. Each gap presents **multiple candidate approaches with no preferred one**. Every gap
section ends with an explicit non-decision, and every subsection ends with the line **"No implementation
is authorized by this document."**

The gaps are the four surfaced by the accepted Increment 5B evidence (and preserved by the Evidence
Acceptance Review, which concluded *evidence preserved, new candidate baseline not yet proposed*):
- **Gap A** — reintroduced-violation **silent false negative**;
- **Gap B** — **stable context-anchor** strategy;
- **Gap C** — **path-alias canonicalization**;
- **Gap D** — the **remaining false positive**.

---

## Gap A — Reintroduced-violation silent false negative

### Current evidence
The 5B rerun classified `reintroduced-violation` as **`FN_silent`**. civ-2 is deliberately line-blind:
the baseline `lead@f.ts:10` and the current `lead@f.ts:60` share the same rule / subject / location and
carry no distinguishing context anchor, so lineage reports `sameCandidate` (continuity) rather than a
reopened reintroduction. The accepted v1.0 blocking-readiness evidence classified the same case as
`FN_ambiguous`; hardening therefore moved this case from *ambiguous* to *silent* — significant, because
prior governance has consistently treated elimination of silent false negatives as a precondition for any
enforcement decision.

### Problem statement
Determine how an **intra-file remove-and-readd** can be distinguished from **legitimate continuity**
**without** reintroducing raw line identity, ordinal identity, or mutable positional identity.

### Candidate approaches (multiple; none preferred)

**A1 — Intermediate-snapshot resolved-state signal.** Require an authoritative intermediate state in which
the finding is marked `resolved`, so a later reappearance is `reintroduced` (which lineage already
supports) rather than `sameCandidate`.
- *Assumptions:* an authoritative between-snapshot "resolved" signal exists.
- *Risks:* a single baseline→current diff carries no such signal; retrofitting one may exceed identity's
  remit.
- *Determinism implications:* deterministic given a deterministic snapshot source.
- *Expected evidence:* the reintroduction case reclassifies from `FN_silent` to `reintroduced` (TP).
- *Failure modes:* absent an intermediate snapshot, no signal is available and the case is unchanged.

**A2 — Structural-context discrimination (couples to Gap B).** Use a stable enclosing-scope anchor so a
readd in a *different* structural context is a distinct candidate, while a true move preserves the anchor.
- *Assumptions:* durable anchors are available (see Gap B).
- *Risks:* fully dependent on Gap B's anchor availability; no benefit on anchorless input.
- *Determinism implications:* deterministic if the anchor source is deterministic.
- *Expected evidence:* context-differing readds surface as new; context-preserving moves stay continuous.
- *Failure modes:* anchorless findings gain nothing; anchor churn could over-split.

**A3 — Occurrence-count reconciliation → ambiguity, never silence.** When the count of indistinguishable
occurrences for a (rule, subject, location) changes across snapshots and cannot be reconciled by
identity, emit `ambiguous` rather than `sameCandidate`.
- *Assumptions:* counting co-located occurrences is meaningful and stable.
- *Risks:* converts silent FNs into ambiguity (raises review load; surfaces uncertainty rather than
  resolving it); potential over-ambiguity.
- *Determinism implications:* deterministic (set counts are order-independent).
- *Expected evidence:* `silentFalseNegatives` → 0 on this case; `ambiguousFalseNegatives` may rise.
- *Failure modes:* legitimate stable duplicates repeatedly flagged ambiguous.

**A4 — Explicit no-silent-FN tie-break policy.** Make it a governed rule that when identity cannot
*confirm* continuity vs reintroduction, the outcome defaults to `ambiguous` (surfacing), never
`sameCandidate`.
- *Assumptions:* ambiguity is an acceptable default for unconfirmable continuity.
- *Risks:* higher review volume; may mask which mechanism (A1/A2/A3) actually resolves the case.
- *Determinism implications:* deterministic (a fixed tie-break rule).
- *Expected evidence:* no `FN_silent` outcomes anywhere in the corpus.
- *Failure modes:* ambiguity inflation without root-cause resolution.

### Required future evidence
A future evidence cycle would need to show, deterministically, that the reintroduction case is **not**
silent (either TP or ambiguous) **and** that no *new* silent false negatives are introduced elsewhere.

### Acceptance questions
- Is the case reclassified away from `FN_silent` without reintroducing line/ordinal/positional identity?
- Does any approach create new silent FNs, or merely shift the ambiguity balance?
- Which approach's benefit is independent of Gap B, and which is contingent on it?

### Explicit non-decision
No approach is selected. This section defines investigation only.
**No implementation is authorized by this document.**

---

## Gap B — Stable context-anchor strategy

### Current evidence
civ-2 distinguishes co-located occurrences only by a **stable context anchor**; the accepted corpus
carries none, so anchorless findings collapse to `ambiguous`, and drift detection over the anchorless
corpus is largely `FN_ambiguous`. Increment 1's acceptance explicitly deferred the "reliable
detector-supplied context anchor" input-quality question. This gap is the suspected **upstream lever**
for Gaps A and D.

### Problem statement
Identify possible **sources of durable structural context**, and answer the governed sub-question: **when
a stable anchor is unavailable, should the outcome remain `ambiguous`, or is another governed behavior
justified?** Current behavior must not change under this plan.

### Candidate approaches (anchor sources; none preferred)

**B1 — Detector-produced structural anchors.** The detector emits an enclosing-symbol anchor at capture
time.
- *Assumptions:* the detector can and should emit this; **coupling flag:** this touches detector output,
  which is out of scope here and would be its own governed initiative.
- *Risks:* detector coupling; anchor stability tied to detector versioning.
- *Determinism:* only as deterministic as the detector.
- *Expected evidence:* anchorless cases become distinguishable; ambiguity falls.
- *Failure modes:* legacy findings without anchors remain ambiguous.

**B2 — Parser/AST-derived enclosing scope (read-only enrichment).** A separate, read-only pass derives the
enclosing scope for each finding.
- *Assumptions:* sources are parseable; a pinned parser exists.
- *Risks:* parser version drift; non-deterministic parses; performance.
- *Determinism:* requires a pinned, content-addressed parser to stay deterministic.
- *Expected evidence:* reproducible anchors for parseable files.
- *Failure modes:* unparseable/partial files yield no anchor.

**B3 — Syntax-tree structural path anchors.** Use a structural path (e.g., node path within the tree)
rather than a symbol name.
- *Assumptions:* structural paths are stable across benign edits.
- *Risks:* structural paths can shift under refactors, reintroducing positional fragility.
- *Determinism:* deterministic given a pinned tree builder.
- *Expected evidence:* stability under benign edits; instability under refactors quantified.
- *Failure modes:* refactors churn the anchor.

**B4 — Repository-derived anchors.** Derive an anchor from repository structure/metadata (e.g., nearest
stable declared symbol).
- *Assumptions:* repo metadata is available and portable.
- *Risks:* repository-state coupling; portability across clones/mirrors.
- *Determinism:* depends on repo-state normalization.
- *Expected evidence:* portable, reproducible anchors.
- *Failure modes:* environment-specific divergence.

### The unavailable-anchor sub-question (options only; do not change current behavior)
- *Option 1 — remain `ambiguous`* (status quo; honest surfacing of uncertainty).
- *Option 2 — a governed `unresolved` status* (reserved-but-not-emitted today) routed to explicit review.
- *Option 3 — tiered confidence* distinguishing "no anchor" from "conflicting anchor."
Each option must be evaluated for determinism and the evidence it would require. **No change to current
behavior is proposed here.**

### Required future evidence
Reproducibility of any anchor source across environments; the measured reduction in `FN_ambiguous`; and
confirmation that anchor introduction does not destabilize existing civ-2 identities.

### Acceptance questions
- Which anchor sources are deterministic and repository-portable?
- Does anchor introduction change any *currently resolved* identity (a stability regression)?
- For the unavailable-anchor case, is `ambiguous` still the safest governed default?

### Explicit non-decision
No anchor source or unavailable-anchor behavior is selected.
**No implementation is authorized by this document.**

---

## Gap C — Path-alias canonicalization

### Current evidence
Hardened identity is **repo-relative POSIX-only**, **rejects absolute paths**, and has **no alias table**;
lineage consumes verified renames, **not** aliases. The 5B `path-canonicalization` case became
`ambiguous_soft` — a regression relative to the v1.0 classifier's `options.aliases` handling.

### Problem statement
Evaluate how repository identity should treat **aliases, symlinks, generated paths, absolute paths, and
relative paths**.

### Candidate approaches (option space; none preferred)

**C1 — Evidence-backed verified-alias table.** Consume an alias table analogous to verified renames
(evidence required; never inferred).
- *Determinism:* deterministic given a fixed table.
- *Repository portability:* portable if the table is repo-declared.
- *Compatibility impact:* additive to lineage/identity inputs.
- *Historical evidence implications:* prior evidence unaffected (append-only); new evidence would carry
  alias provenance.

**C2 — Canonicalize via repository metadata (symlink/manifest resolution).** Resolve symlinks/generated
paths against declared repo metadata.
- *Determinism:* depends on metadata normalization.
- *Portability:* risk of environment-specific link targets.
- *Compatibility:* changes canonical location → could alter identities (must be evaluated).
- *Historical:* would not rewrite accepted evidence; divergence must be quantified.

**C3 — Explicit quarantine of non-canonical paths as `ambiguous`.** Keep identity strict; route
aliases/absolute paths to `ambiguous`/review rather than resolving them.
- *Determinism:* deterministic.
- *Portability:* high (no external resolution).
- *Compatibility:* closest to current behavior.
- *Historical:* consistent with the current corpus outcome.

**C4 — Declared source-map normalization for generated paths.** Normalize generated artifacts to their
declared sources.
- *Determinism:* deterministic given declared maps.
- *Portability:* depends on map availability.
- *Compatibility:* additive; scope limited to generated paths.
- *Historical:* new evidence only.

### Required future evidence
For any option: byte-identical determinism across environments; the effect on existing civ-2 identities;
and a demonstration that accepted evidence remains untouched.

### Acceptance questions
- Which options preserve determinism and repository portability simultaneously?
- Do any options alter *currently resolved* identities, and is that acceptable?
- Is strict quarantine (C3) sufficient, or is active resolution (C1/C2/C4) warranted by evidence?

### Explicit non-decision
No path-handling option is selected. **No implementation is authorized by this document.**

---

## Gap D — Remaining false positive

### Current evidence
The anchorless `resolved-finding` case became a **`FP`**: baseline duplicates are ambiguous, so the
surviving occurrence is classified `split` (new). This is the single false positive in the 5B evidence.

### Problem statement
Determine whether the remaining false positive is: an unavoidable consequence of line-blind identity; a
corpus artifact; an identity limitation; a lineage limitation; or independently addressable.

### Candidate analyses (option space; none preferred)

**D1 — Corpus-artifact hypothesis (couples to Gap B).** The FP may arise *only* because the corpus finding
lacks anchors; with anchors the survivor would match its predecessor and the FP disappears.
- *Expected evidence:* re-running the case *with* anchors yields TN instead of FP.
- *Risk/failure mode:* if the FP persists with anchors, the hypothesis is falsified.

**D2 — Lineage-rule refinement (couples to Gap A3).** Treat "`split` derived from an *ambiguous*
predecessor set" as `ambiguous` rather than new.
- *Expected evidence:* the case becomes `ambiguous_soft` instead of `FP`.
- *Risk:* may mask genuine splits; determinism preserved.

**D3 — Inherent-to-line-blindness acceptance.** Accept the FP as a known, surfaced trade-off of line-blind
identity, resolved by review rather than by a rule change.
- *Expected evidence:* the FP is documented and consciously accepted.
- *Risk:* residual FP volume on anchorless input.

**D4 — Independent count-based reconciliation.** Reconcile occurrence counts so a survivor of a reduced
duplicate set is not treated as a new split.
- *Expected evidence:* the case becomes TN via count reconciliation.
- *Risk:* interacts with A3; determinism preserved.

### Required future evidence
A deterministic demonstration of whether the FP survives once anchors and/or count reconciliation are
introduced, isolating whether it is a corpus artifact, an identity limitation, or a lineage limitation.

### Acceptance questions
- Is the FP eliminated by anchors alone (implying a corpus/input artifact)?
- If not, is it an identity or a lineage limitation, and is it independently addressable?
- Is conscious acceptance (D3) preferable to a rule change that risks masking genuine splits?

### Explicit non-decision
No cause is asserted and no fix is selected. **No implementation is authorized by this document.**

---

## Cross-gap analysis (identify coupling — do NOT merge the initiatives)

- **Context anchors (Gap B) affect the silent false negative (Gap A):** approaches A2 and the availability
  of B's anchors may jointly determine whether the reintroduction case can be resolved without positional
  identity. B is the suspected upstream lever.
- **Context anchors (Gap B) affect the false positive (Gap D):** D1 hypothesizes the FP is purely an
  anchorless-input artifact; if so, B resolves D without any lineage change.
- **Alias handling (Gap C) affects lineage:** C's canonical-location decisions change how lineage matches
  locations (rename vs alias vs quarantine), which can influence both continuity (Gap A) and split
  detection (Gap D).
- **Context anchors (Gap B) affect migration determinism:** anchor introduction changes civ-2 identities,
  which the migration evidence (Increment 4) consumes; any anchor change must be evaluated for identity
  stability before it could feed a migration or baseline.

This coupling is documented to inform sequencing and evidence design. **It does not merge the gaps into a
single initiative**, and it selects no ordering. **No implementation is authorized by this document.**

## Decision discipline

This document explicitly states:
- **no preferred solution** for any gap;
- **no architectural commitment**;
- **no implementation recommendation**;
- **no reopening of accepted evidence, baselines, acceptance records, or tags**;
- **no change to current behavior** (identity, lineage, migration, compatibility, detector, classifier).

Its sole purpose is to define the future investigation of the four evidence-derived gaps. Any subsequent
work — an implementation increment, an evidence cycle, or a baseline/authority decision — remains a
**separate governed decision** and is **not** authorized here.

## Stop conditions

**Planning only.** Stop after this document for the **Gap Resolution Planning Review**. Execution (any
investigation, prototyping, evidence generation, or behavior change) is a separate, later authorization.
`civ-1` remains authoritative; `civ-2` non-authoritative; the six BE-3 tags are unchanged; Blocking Mode
planning remains unauthorized.

---

*Bounded to the four evidence-derived gaps. Planning only — stop for review. This document selects no
solution and authorizes no implementation.*

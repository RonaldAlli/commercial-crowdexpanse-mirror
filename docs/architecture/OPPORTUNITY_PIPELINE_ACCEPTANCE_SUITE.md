# Opportunity Pipeline — Acceptance & Regression Suite (Phase 3.3)

> **Phase 3 · Artifact 3.3. DERIVED, NORMATIVE.** The **specification of the tests** (not the tests themselves — no
> code). Organized around **invariant coverage**, not workflows: every governing invariant gets **Positive /
> Negative / Regression / Migration** scenarios (Migration only where applicable). Each scenario asserts **both**
> the projected outcome **and** whether the authoritative operation was **permitted at the correct boundary**
> (authorization ALLOW/DENY + `DENY` code). Sources: [Spec](./BUSINESS_SEMANTICS_SPECIFICATION.md),
> [STM](./OPPORTUNITY_PIPELINE_STATE_TRANSITION_MODEL.md), [AUTH](./OPPORTUNITY_PIPELINE_AUTHORIZATION_MODEL.md).
> 2026-07-22.

## Scenario format & ID scheme

```
AC-<INV>-<P|N|R|M><n>
Given   : the current authoritative fact graph (+ actor, policy)
When    : an authorized fact operation (or a projection query)
Then    : authorization = ALLOW|DENY(code)  ·  projected stage = …  ·  inconsistencies = {…}
          (and: no authoritative cascade · derived state recomputed · append-only preserved)
```
Every scenario runs through the **single predicate evaluator** (AUTH §11b), so "authorized," "projected," and
"closed" agree by construction.

---

## A. Global invariants

### GI-1 · Append-only historical facts
- **AC-GI1-P1** record a `CORRECT_HISTORY` → a linked successor supersedes the original; original preserved with
  corrector+reason; authz ALLOW.
- **AC-GI1-N1** attempt to mutate/delete a historical fact in place → **rejected** (no such operation exists);
  authz DENY `UNKNOWN_OPERATION`.
- **AC-GI1-R1** `RETRACT_*` a decision → superseding record created, prior fact intact, projection recomputes.
- **AC-GI1-M1** migration asserts a fact → recorded as **migration-origin** (provenance preserved), never as
  verified evidence.

### GI-2 · Deterministic-evaluator contract
- **AC-GI2-P1** evaluator declares a decision under a machine-evaluable policy with all facts present → ALLOW;
  reproducibility record (identity+policy+rule-set+timestamp) stored.
- **AC-GI2-N1** evaluator attempts a decision where policy is **not machine-evaluable** → DENY
  `POLICY_PRECONDITION_FAILED`; **fail closed** (abstains).
- **AC-GI2-N2** evaluator attempts to **waive**/accept an exception → DENY `INVALID_EXCEPTION_SCOPE` (machines never
  waive).
- **AC-GI2-R1** re-running the evaluator on the same facts+versions yields the **same** result (reproducible).

### GI-3 · Fact-class taxonomy (authority-mutability)
- **AC-GI3-P1** `RECORD_*_EVIDENCE` from an attributable source → ALLOW.
- **AC-GI3-N1** any actor attempts to `DECLARE`/synthesize an **evidence** fact → DENY `UNKNOWN_OPERATION` /
  `INVALID_EXCEPTION_SCOPE` (evidence is never authorable).
- **AC-GI3-N2** `ACCEPT_*_EXCEPTION` targeting a missing **evidence** requirement → DENY `INVALID_EXCEPTION_SCOPE`.
- **AC-GI3-M1** migration cannot synthesize evidence → unresolved-for-review outcome instead.

---

## B. Projection model (OWN-1)

### OWN-1 INV-1/INV-4 · Stage is never authoritative / never set directly
- **AC-OWN1-4-N1** attempt to "set stage" directly → DENY `UNKNOWN_OPERATION` (no stage-setting capability;
  stage is never an authz target — AUTH-INV-1).
- **AC-OWN1-1-P1** delete the stored/cached stage and recompute → identical stage reconstructed from facts.

### OWN-1 INV-2 · Pure & total projection
- **AC-OWN1-2-P1** same fact graph twice → same single stage, no mutation.
- **AC-OWN1-2-R1** retract a fact → stage recomputes (may move backward), pure function of the new graph.

### OWN-1 INV-5 · Furthest-fact
- **AC-OWN1-5-P1** later fact present → projects the later stage.
- **AC-OWN1-5-N1** `CONTRACT_EXECUTED` present, `BUYER_MATCHED`/`LOI_ACCEPTED` absent → stage `UNDER_CONTRACT` +
  inconsistencies `{missing predecessor: BUYER_MATCHED, LOI_ACCEPTED}` (earlier gap **never** suppresses).
- **AC-OWN1-5-R1** retract the later fact → stage regresses to the next-furthest.
- **AC-OWN1-5-M1** imported opportunity with only `CONTRACT_EXECUTED` → `UNDER_CONTRACT` + missing-predecessor
  inconsistencies (not invented history).

### OWN-1 INV-7 / STM-INV-8 · Projector observational / empty → LEAD
- **AC-OWN1-7-N1** projection run produces **no** fact writes/side effects.
- **AC-STM8-P1** empty fact set → `LEAD`.

---

## C. Fact families (representative — same pattern applies to every family invariant, §F)

### D1-INV-3/4 · Diligence completion is policy-versioned; policy change doesn't rewrite history
- **AC-D1-P1** declare `DILIGENCE_COMPLETE` vs policy v2 with review done → ALLOW; records policy v2.
- **AC-D1-N1** declare with a required item unreceived and no waiver → DENY `MISSING_REQUIRED_EVIDENCE`.
- **AC-D1-N2** empty/all-optional checklist, no explicit decision → not complete (no fail-open).
- **AC-D1-R1**/M1 policy upgraded to v3 → existing v2 completion **unchanged**; "complete-against-superseded-policy"
  surfaces as **Policy-staleness** inconsistency (never auto-retracted).

### 2.1-INV-3 · Buyer-match exclusivity
- **AC-21-P1** declare a single `BUYER_MATCHED` → ALLOW → stage `BUYER_MATCHED`.
- **AC-21-N1** declare a second match while one is active (policy = single) → DENY `EXCLUSIVITY_CONFLICT`.
- **AC-21-N2** concurrent duplicate matches → second **rejected at commit** (`STALE_FACT_GRAPH`).

### 3.1-INV-1 · LOI acceptance is version-specific
- **AC-31-P1** declare `LOI_ACCEPTED` for the version whose acceptance evidence exists → ALLOW.
- **AC-31-N1** declare acceptance citing a version with no same-version evidence → DENY `VERSION_MISMATCH`.
- **AC-31-R1** counter-offer arrives → new version drafted; prior acceptance unaffected (no propagation).

### 4A-INV-2/4 · Executed contract — evidence completeness; no exception for missing external evidence
- **AC-4A-P1** declare `CONTRACT_EXECUTED` with all policy-required signatures for the version → ALLOW → stage
  `UNDER_CONTRACT`.
- **AC-4A-N1** a required counterparty signature missing → DENY `MISSING_REQUIRED_EVIDENCE`.
- **AC-4A-N2** `ACCEPT_EXECUTION_EXCEPTION` for the **missing signature** → DENY `INVALID_EXCEPTION_SCOPE`
  (exception may relax only internal approvals, never external evidence).
- **AC-4A-R1** retract execution → stage regresses; escrow/financing facts persist → **Downstream-without-upstream**
  inconsistency; no cascade.
- **AC-4A-M1** legacy `UNDER_CONTRACT` with no execution evidence → **unresolved-for-review** (or explicit
  migration-origin assertion), **never** invented execution evidence.

### 5A-INV-2 / 5B-INV-3 · Closing predicate over facts in required state (per archetype)
- **AC-5A-P1** (Assignment) `CONTRACT_EXECUTED ∧ ASSIGNMENT_EXECUTED ∧ FUNDS_DISBURSED{AssignmentFee}` → ALLOW
  `TRANSACTION_CLOSED` → stage `PAID`.
- **AC-5A-N1** (Financed) `FINANCING=CLEARED` but not `FUNDED` → DENY `POLICY_PRECONDITION_FAILED` (state not met);
  projection sits at `CLEAR_TO_CLOSE` (if pre-closing satisfied).
- **AC-5A-N2** declare closed with `FUNDS_DISBURSED` absent → DENY `MISSING_REQUIRED_EVIDENCE`; no exception
  substitutes (evidence).
- **AC-5A-R1** retract `TRANSACTION_CLOSED` → stage regresses from `PAID`; downstream facts persist as
  inconsistencies.

---

## D. Authority model (AUTH)

- **AC-AUTH1-N1** any operation with a **stage** as input/target → DENY `UNKNOWN_OPERATION` (stage never authorized).
- **AC-AUTH-CAP-N1** actor lacking the capability → DENY `INSUFFICIENT_CAPABILITY`.
- **AC-AUTH10-N1** an `authorize(...)` call produces **no** fact/derived/cache mutation (observational).
- **AC-AUTH11-N1** ALLOW computed over a fact graph then superseded before commit → **revalidated → rejected**
  (`STALE_FACT_GRAPH`).
- **AC-AUTH-ACTOR-N1** migration principal attempts a non-migration operation → DENY `MIGRATION_NOT_PERMITTED`
  (actor classes are not privilege levels).
- **AC-AUTH-EXT-N1** external principal attempts to `DECLARE` our decision fact → DENY `INSUFFICIENT_CAPABILITY`
  (external principals produce evidence only).

---

## E. Guard model (OPP-3)

- **AC-OPP31-P1** a consequential regression requires **explicit confirmation**; recorded with actor+timestamp+
  reason; operation proceeds (warn, not block).
- **AC-OPP31-N1** attempt to **auto-retract** a downstream authoritative fact on upstream retraction → **rejected**
  (no authoritative cascade; STM-INV-5).
- **AC-OPP32-P1** any authoritative fact change → stage, policy results, inconsistencies, operational attention all
  **recompute automatically** (derived; no authorization).

---

## F. Complete invariant coverage matrix

Every invariant below is covered by the P/N/R/M pattern above; IDs already written are cited, the remainder follow
the identical pattern and are enumerated here so **coverage is complete by construction**.

| Invariant group | Invariants | Scenario IDs |
|---|---|---|
| Global | GI-1, GI-2, GI-3 | AC-GI1-*, AC-GI2-*, AC-GI3-* |
| Projection | OWN-1 INV-1…7, STM-INV-1…8 | AC-OWN1-*, AC-STM*-* |
| Diligence | D1-INV-1…7, 1A-INV-1…5, 1B/1C-INV | AC-D1-*, AC-1A-*, AC-1B/1C-* |
| Buyer Match | 2.1-INV-1…6, 2A-INV-1…7, 2B/2C-INV | AC-21-*, AC-2A-*, AC-2B/2C-* |
| LOI | 3.1-INV-1…7, 3A-INV-1…2, 3B-INV | AC-31-*, AC-3A-*, AC-3B-* |
| Executed Contract | 4.1-INV-1…6, 4A-INV-1…4, 4B-INV-1…5 | AC-41-*, AC-4A-*, AC-4B-* |
| Closing | 5.1-INV-1…3, 5A-INV-1…5, 5B-INV-1…4 | AC-51-*, AC-5A-*, AC-5B-* |
| Policy composition | OWN3-INV-1…3, OWN3.1/3.2/3.3-INV | AC-OWN3-*, AC-OWN31/32/33-* |
| Projection enumeration | OWN4-INV-1 | AC-OWN4-* |
| Authority | AUTH-INV-1…11 | AC-AUTH*-* |
| Guard | OPP3-INV-1…2 | AC-OPP31-*, AC-OPP32-* |

**Exhaustiveness rule:** an invariant is "covered" only when it has (at least) a Positive and a Negative scenario,
a Regression scenario if the underlying fact can be retracted, and a Migration scenario if legacy data can produce
it. The suite is complete when the matrix has no uncovered invariant.

---

*Next: the Architecture Traceability Matrix (Phase-3 closeout) mapping each frozen requirement → derived artifact →
these acceptance IDs. Then Phase 3 is complete and implementation planning (Phase 4) may begin — as derivation.*

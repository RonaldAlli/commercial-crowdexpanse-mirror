# Opportunity Pipeline — State-Transition Model (Phase 3.1)

> **Phase 3 (Architecture & Acceptance) · Artifact 3.1. DERIVED, NORMATIVE, implementation-independent.** This
> document answers *how the frozen semantics are realized*, never *what the workflow means*. It introduces **no new
> business rule**; every clause cites the [Business Semantics Specification](./BUSINESS_SEMANTICS_SPECIFICATION.md)
> (the contract) or the [Decision Log](../releases/OPPORTUNITY_PIPELINE_SLICE2_DECISION_LOG.md). Passed the
> [Conformance gate](./BUSINESS_SEMANTICS_CONFORMANCE_REVIEW.md). Authored 2026-07-22. Keywords MUST/MUST NOT/MAY
> are normative.
>
> **This is NOT a workflow machine** that moves an opportunity between stored stages. Stages are never stored as
> truth; they are *projected*.

---

## 1. The four layers (Spec §0, §5, §6)

```
(1) Authoritative fact operations        ← the only authorized writes
        ↓
(2) Current authoritative fact graph     ← the only source of truth (append-only, GI-1)
        ↓
(3) Pure projection + policy evaluation  ← side-effect free (OWN-1 INV-7, GI-2)
        ↓
(4) Projected stage · inconsistencies · operational attention   ← derived, always recomputable
```
**Only layers (1)–(2) are authoritative.** Layers (3)–(4) are **derived and MUST always be recomputable** from (2)
alone. No component outside layer (1) may write authoritative state; nothing may write a projected stage (Spec
Impl-Constraint 1–2; OWN-1 INV-1/INV-4).

---

## 2. Canonical projected spine + backing facts (Spec §5)

```
LEAD → UNDERWRITTEN → BUYER_MATCHED → LOI_ACCEPTED → UNDER_CONTRACT → CLEAR_TO_CLOSE → PAID
```
| Projected stage | Authoritative basis |
|---|---|
| `LEAD` | no projecting decision fact currently holds (base case) |
| `UNDERWRITTEN` | `UNDERWRITING_APPROVED` (V1.3, reused) |
| `BUYER_MATCHED` | `BUYER_MATCHED` |
| `LOI_ACCEPTED` | `LOI_ACCEPTED` |
| `UNDER_CONTRACT` | `CONTRACT_EXECUTED` |
| `CLEAR_TO_CLOSE` | `CLEAR_TO_CLOSE` (pre-closing policy satisfied) |
| `PAID` | `TRANSACTION_CLOSED` |

This ordering is **projection precedence**, **not** a list of mandatory commands (`STM-INV-1`).

---

## 3. Projection function (Spec §0 INV-2/3/5/7; §5)

`projectStage(currentFacts) → exactly one stage` — a **pure, total** function. Frozen precedence (furthest
authoritative fact wins; earlier facts NOT required to be contiguous):

```
if   TRANSACTION_CLOSED holds  → PAID
elif CLEAR_TO_CLOSE     holds  → CLEAR_TO_CLOSE
elif CONTRACT_EXECUTED  holds  → UNDER_CONTRACT
elif LOI_ACCEPTED       holds  → LOI_ACCEPTED
elif BUYER_MATCHED      holds  → BUYER_MATCHED
elif UNDERWRITING_APPROVED holds → UNDERWRITTEN
else                            → LEAD
```
"Holds" = the decision fact exists in its **required authoritative state** and has not been superseded (GI-1).
Missing intermediate facts are **never** used to suppress a later stage; they surface as inconsistencies
(`STM-INV-3`). Empty fact set → `LEAD` (`STM-INV-8`).

**Example (furthest-fact):** `CONTRACT_EXECUTED` present, `BUYER_MATCHED`/`LOI_ACCEPTED` absent → **stage
`UNDER_CONTRACT`**, inconsistencies `{missing BUYER_MATCHED, missing LOI_ACCEPTED}`.

---

## 4. What a "transition" is (Spec §3, §6)

A transition is **not** `setStage(...)`. It is an **authorized fact operation** followed by **recomputation**:
```
authorized fact operation → (fact graph changes) → project stage → recompute policy predicates
                          → recompute inconsistencies → recompute operational attention
```
Two disjoint kinds:

| **Authoritative transitions** (authorized, mutate truth) | **Derived transitions** (no authorization; recomputation only) |
|---|---|
| assert a fact (`DECLARE_*`, `RECORD_*_EVIDENCE`, `DRAFT_*`) | stage advances |
| retract a fact (`RETRACT_*`) | stage regresses |
| supersede/correct (`CORRECT_HISTORY`) | a warning appears / clears |
| accept a policy-gated exception (`ACCEPT_*_EXCEPTION`) | an operational task appears / clears |
| | a policy predicate changes result |

Derived transitions require **no** authorization — they mutate no business truth (`STM-INV-6`; Spec Impl-Constraint 9).

---

## 5. Scenarios (normative behaviors)

### 5a. Forward movement
- `UNDERWRITING_APPROVED` asserted → `LEAD → UNDERWRITTEN`
- `BUYER_MATCHED` asserted → `UNDERWRITTEN → BUYER_MATCHED`
- `CONTRACT_EXECUTED` asserted → `LOI_ACCEPTED → UNDER_CONTRACT`

### 5b. Skipped-stage (imported / out-of-order — furthest-fact)
- `LEAD` + imported `CONTRACT_EXECUTED` → `UNDER_CONTRACT`, with `{missing BUYER_MATCHED, missing LOI_ACCEPTED}`
  surfaced separately. The later fact is never suppressed to make the record look orderly (`STM-INV-3`).

### 5c. Regression (correct recomputation, not an exceptional command)
Facts `{CONTRACT_EXECUTED, LOI_ACCEPTED, BUYER_MATCHED}` → `UNDER_CONTRACT`. Then `RETRACT_CONTRACT_EXECUTION` →
projected `LOI_ACCEPTED`. The operation **MUST**: warn before confirmation when consequential; record actor +
timestamp + reason; preserve the retracted fact via append-only supersession; leave downstream authoritative facts
untouched; recompute inconsistencies + operational attention. It **MUST NOT** auto-retract escrow/financing/
settlement/other downstream facts (`STM-INV-4/5`; OPP3-INV-1/2).

### 5d. Correction (append-only, GI-1)
`CORRECT_HISTORY` on an erroneous fact creates a **linked successor** that supersedes it; the original is preserved
with corrector + reason. The projector recomputes over the corrected graph. No prior fact is mutated or deleted
(`STM-INV-7`; GI-1). Same recomputation pipeline as any fact change (§4).

### 5e. Policy change (no silent rewrite)
Changing a diligence/qualification/execution/closing/pre-closing policy **MUST NOT** retract, mutate, or re-date an
existing decision fact. A prior decision remains true **against its recorded policy version**; "complete/closed
against a superseded policy" becomes an **inconsistency** (§7 *Policy staleness*) + operational attention — never a
projection change (`STM-INV-7`; D1-INV-4).

### 5f. Policy-relative decision transitions (Spec §2.5, §4; GI-2)
`CLEAR_TO_CLOSE` and `TRANSACTION_CLOSED` are **not** manually assembled stage changes — they are **decision facts
produced by policy evaluation** over the fact graph:
```
pre-closing fact graph → configured pre-closing predicate            → CLEAR_TO_CLOSE
closing fact graph     → archetype structural core ∧ org config       → TRANSACTION_CLOSED
```
A GI-2 deterministic evaluator MAY assert these **only** where the applicable policy is explicitly
machine-evaluable, reproducible, fail-closed, and evidence-complete; otherwise the decision is human. Both are
version-anchored (policy + rule-set + relevant artifact versions recorded — `STM-INV-7`).

---

## 6. Transition-result contract (derived impact summary)

Every authoritative fact operation MUST be able to produce a **derived impact summary** (computable *before*
execution as a what-if projection, and recorded *after*):
```
Fact operation:         RETRACT_CONTRACT_EXECUTION
Authoritative effect:   CONTRACT_EXECUTED superseded
Projected stage:        UNDER_CONTRACT → LOI_ACCEPTED
New inconsistencies:     - escrow exists without an active executed contract
                         - financing funded without an active executed contract
Unchanged authoritative: - ESCROW_OPENED
facts                    - FINANCING_FUNDED
Required confirmation:   Yes
Audit reason:            Required
```
This gives API and UI a **common architectural behavior** without prescribing presentation. The "before" form is a
pure projection over the *hypothetical post-operation* fact graph (side-effect free).

---

## 7. Inconsistency taxonomy (derived; Spec §0 INV-5, §2, §4)

Inconsistencies are defined **separately from stages**. Minimum categories:
1. **Missing predecessor** — a later fact exists without an expected earlier fact.
2. **Version conflict** — evidence/assent references different LOI/contract versions (3.1-INV-1, 4.1-INV-1).
3. **Policy staleness** — a decision was valid under an older policy version (D1-INV-4, 5f).
4. **Evidence deficiency** — a decision fact exists but required evidence was invalidated/superseded (4A-INV-4).
5. **Exclusivity conflict** — more than one active `BUYER_MATCHED` where policy permits only one (2.1-INV-3).
6. **Downstream-without-upstream** — escrow/financing/settlement/payment facts remain after an upstream fact is
   retracted (5c).
7. **Archetype-policy mismatch** — closing facts/configuration conflict with the active archetype (OWN3-INV-1/2).

An inconsistency: **never** silently changes a fact; **never** suppresses the furthest-fact projection; **feeds
operational attention**; **MAY require an explicitly authorized corrective operation** (never an automatic one).

---

## 8. State-transition invariants (derived; each maps to the Spec)

| STM invariant | Statement | Derived from (Spec / Decision) |
|---|---|---|
| **STM-INV-1** | No direct stage transition exists — every stage change results from an authoritative fact change + recomputation | OWN-1 INV-1/INV-4; §3, §6 |
| **STM-INV-2** | Projection is pure and total — same fact graph → same single stage, no mutation | OWN-1 INV-2/INV-3/INV-7; §0, §5 |
| **STM-INV-3** | Furthest fact wins — missing intermediates produce inconsistencies, not projection suppression | OWN-1 INV-5; §5 |
| **STM-INV-4** | Regression is permitted — retraction may move the stage backward; warnings cannot veto truthful recomputation | OWN-1 INV-2; OPP3-INV-1; §6 |
| **STM-INV-5** | No authoritative cascade — one fact operation never automatically mutates another authoritative fact | OPP3-INV-1; §6 |
| **STM-INV-6** | Derived state recomputes completely — stage, policy results, inconsistencies, attention refresh after every authoritative change | OPP3-INV-2; §6 |
| **STM-INV-7** | Decision facts are version-anchored — policy/rule-set/artifact versions preserved | D1-INV-3, 3.1-INV-1, 4.1-INV-1, GI-2(b); §2 |
| **STM-INV-8** | Empty projection maps to `LEAD` — no projecting decision fact → base stage | OWN-1 INV-3; §5 |

---

## 9. Unresolved-architecture list (genuine REALIZATION questions only — NOT reopened semantics)

These are *how-to-realize* questions for later Phase-3 artifacts / architecture review. None reopens a business
decision.

- **A-1 · Fact persistence model.** Append-only (GI-1) implies immutable fact records with supersession links —
  single event/fact log vs. per-family fact tables + a supersession pointer? (Determines correction/retraction
  mechanics + audit query shape.)
- **A-2 · Projection materialization.** Compute stage purely on read every time, or maintain a **recomputed cache**
  invalidated on fact change? Spec requires only that it be recomputable + never authoritative (Impl-Constraint 1);
  caching is a performance/consistency choice.
- **A-3 · Recomputation execution.** Is derived-state recompute synchronous within the fact-write transaction, or
  event-driven/eventually-consistent? What atomicity guarantee does STM-INV-6 require in practice?
- **A-4 · Predicate representation.** How are archetype predicates + org configuration expressed as **data** (a
  predicate schema over facts/states/relationships/dependencies) so policy is configured, not coded?
- **A-5 · Deterministic-evaluator runtime.** Where/when does the GI-2 evaluator run, and how are its reproducibility
  records (identity + policy + rule-set + timestamp) stored and re-verified?
- **A-6 · Collection facts.** `DILIGENCE_MATERIAL_RECEIVED` (per item), `CONTINGENCY_REMOVED` (per contingency),
  `CHECKLIST_ITEM_SATISFIED` (per item) are sets — how are they modeled and aggregated by "all required" predicates?
- **A-7 · What-if projection.** The transition-result "before" summary (§6) requires projecting over a *hypothetical*
  post-operation graph — one reusable pure entry point for real + hypothetical projection.
- **A-8 · Concurrency.** Concurrent fact operations + recomputation (cf. deferred D-CRM-PRIMARY-CONCURRENCY): how is
  fact-write + recompute serialized / conflict-resolved without violating STM-INV-2/6?
- **A-9 · Inconsistency computation.** One projector pass emitting stage + inconsistencies, or a separate
  inconsistency evaluator over the same graph? (Both must be side-effect free.)
- **A-10 · Legacy stage backfill.** The current `OpportunityStage` enum stores stages directly; migration must
  reconstruct facts (or a fact-equivalent) so projection replaces the stored stage without losing history —
  strategy is an architecture/migration question (Phase 3 schema + Phase 4).

### 9a. Decision timing (founder classification, 2026-07-22)

| When it must be resolved | Items |
|---|---|
| **Before schema / API architecture** (fundamental data + consistency contracts) | **A-1** persistence + supersession · **A-4** predicate representation · **A-6** collection-fact aggregation · **A-8** concurrency · **A-10** legacy fact reconstruction/migration |
| **Before runtime architecture** (may follow the logical data model) | **A-2** materialization · **A-3** sync vs. event-driven recompute · **A-7** what-if projection · **A-5** evaluator runtime *(its reproducibility-record persistence ties to A-1)* |
| **Deferable** (optimization/caching/presentation; does **not** alter fact authority, deterministic projection, or transactional correctness) | **A-9** inconsistency computation shape *(must remain side-effect free regardless)* + any future such question |

This keeps Phase 3 a sequence of scoped slices, not one large architecture initiative.

### 9b. Non-negotiable constraints on ANY realization choice

Whatever is chosen for the open questions, all of the following MUST hold:
- A cached/materialized stage **remains disposable and reconstructable** (never authoritative).
- Event-driven recomputation **MUST NOT allow stale derived state to become authoritative**.
- Concurrent operations **preserve append-only history and deterministic active-fact resolution** (STM-INV-2).
- **What-if projection MUST remain side-effect free** (STM-INV-2; §6).
- **Legacy stage values MUST NEVER be converted directly into authoritative facts** without evidence or an
  explicitly identified migration assertion (see 9c).

### 9c. Legacy backfill — three permitted outcomes (A-10)

A stored historical stage (e.g. `UNDER_CONTRACT`) does **not** prove execution evidence exists. Migration MUST
resolve each legacy opportunity to exactly one of:
1. **Verified fact** — reconstructed from existing evidence in the domain.
2. **Migration-origin assertion** — a fact explicitly recorded as migration-asserted (attributable, GI-1), so its
   provenance is never mistaken for verified evidence.
3. **Unresolved legacy state** — surfaced for human review (operational attention), no fact asserted.

It **MUST NEVER silently manufacture evidentiary history** (upholds GI-3: evidence is captured, never synthesized).
The **migration principal** (§3.2 actor type) is the only actor permitted to record migration-origin assertions,
under an explicit, audited migration authorization.

---

*Next Phase-3 artifacts, derived from this model + the Spec (after review/acceptance of 3.1): the **authorization
model** (fact-lifecycle capabilities → who-may-do-what) and the **acceptance + regression suite** (invariants →
executable scenarios). No code until Phase 4.*

# Opportunity Pipeline — Business Semantics Specification (Slice 2)

> **NORMATIVE.** This is the canonical output of **Phase 2 (Workflow Freeze)**. It contains **no new decisions** —
> it assembles the frozen decisions from the [Slice 2 Decision Log](../releases/OPPORTUNITY_PIPELINE_SLICE2_DECISION_LOG.md)
> (the decision record) into the **contract every subsequent architecture, database schema, API, UI, migration,
> and test suite MUST satisfy.** It is deliberately **implementation-independent**: it states *what must be true*,
> never *how*. Frozen 2026-07-22. Phases: 1 Decision ✅ → **2 Workflow Freeze (this doc)** → 3 Architecture &
> Acceptance → 4 Implementation.
>
> Keywords **MUST / MUST NOT / MAY** are normative. Each rule cites its frozen invariant (e.g. `GI-3`, `4A-INV-4`).

---

## Hierarchy of authority

The layers of the platform, in descending authority:
```
Business Semantics Specification   (this document — WHAT is true)
        ↓
Architecture                       (HOW it is realized)
        ↓
Implementation                     (code · schema · API · UI)
        ↓
Runtime configuration              (per-organization policy)
```
**Rule: a lower layer MAY refine (strengthen, specialize, configure) a higher layer, but MUST NEVER redefine it.**
Architecture may not change semantics; implementation may not change architecture's contracts; runtime
configuration may only strengthen policy *within* the ontology — never invent facts or alter invariants (the
`OWN3-INV-3` structure-precedes-configuration rule, generalized to the whole stack). If a lower layer cannot be
built without contradicting a higher one, the **higher layer is amended first, deliberately** — never bypassed.

---

## 0. Foundational model

A pipeline **stage** is a **deterministic, total projection of authoritative business state**, computed from
objective business **facts**. Stages are **never** authoritative data.

Three models are **independent and MUST NOT be collapsed**:
1. **Business truth** — what objectively exists (authoritative facts).
2. **Operational projection** — what the pipeline displays (the stage).
3. **Operational attention** — what the team should do next.

`OWN-1` invariants (all MUST hold):
- **INV-1** facts are the only authority; a stage is never authoritative/persisted-as-truth.
- **INV-2** stage is a *pure* function of current facts (no history/momentum; recalculates, incl. backward).
- **INV-3** the projection is *total* — every fact combination resolves to exactly one stage.
- **INV-4** a stage is never written directly; it changes only as a consequence of a fact changing.
- **INV-5** **furthest-fact**: the projection selects the furthest authoritative fact reached; a missing
  intermediate fact never suppresses a later one — it raises a **separate inconsistency** signal.
- **INV-6** a stage encodes neither current activity nor next action.
- **INV-7** the projector is **side-effect free** — it MUST NOT create, modify, delete, or infer a fact.

---

## 1. Global invariants (ratified platform rules — OPP-3 Part A)

- **GI-1 · Historical business facts are append-only.** Retractions, reopenings, corrections, invalidations, and
  supersessions MUST create **linked successor facts** — never mutate or delete a prior authoritative fact.
- **GI-2 · Deterministic-evaluator contract.** A policy-defined deterministic evaluator MAY assert a fact only
  under: (a) **explicit per-policy-version opt-in** — the policy defines the fact as a pure function over recorded
  facts, **machine-evaluable** (a *capability*, not merely a documented policy); (b) **reproducible** (pure fn of
  recorded facts + policy version + rule-set version; identity/versions/timestamp recorded for replay); (c) **no
  machine waiver**; (d) **fail closed** (abstain on ambiguity/missing/malformed/unauthorized); (e) **observational**
  (read/validate/evaluate/emit only); (f) **judgment MUST NOT assert** (probabilistic/interpretive/discretionary
  systems may only recommend).
- **GI-3 · Fact-class taxonomy** (ordered by what authority MAY change):
  | Class | May authority create it? | Examples |
  |---|---|---|
  | **Artifact** | Yes | `LOI_DRAFTED`, `CONTRACT_SENT` |
  | **Evidence** | **No — only record it** (never synthesize/waive into existence) | delivery / acceptance / signature evidence |
  | **Decision** | Yes, subject to policy | `DILIGENCE_COMPLETE`, `BUYER_MATCHED`, `LOI_ACCEPTED`, `CONTRACT_EXECUTED`, `TRANSACTION_CLOSED` |
  Structure: *artifact / evidence → decision → projection.* Projection operates **only** over authoritative facts.
  **Only decision-layer requirements are eligible for discretionary exception; evidence never is.**

---

## 2. Authoritative fact families

Every family follows one pattern: **artifact/evidence facts are non-projecting; a single decision fact projects;
decisions are policy-versioned; all facts are append-only (GI-1); authority is at the fact boundary.**

### 2.1 Diligence
- `DILIGENCE_MATERIAL_RECEIVED` — **per-required-item** artifact fact (possession only; never accuracy/review/
  completion). Non-projecting.
- `DILIGENCE_COMPLETE` — a single explicit auditable **decision** against a **specific diligence-policy version**
  (actor/seam, timestamp, policy version, reviewed-evidence refs, outcome, accepted exceptions). Required **even
  when the checklist is empty/all-optional**. Only this advances past diligence. A later policy change MUST NOT
  retract an existing completion (superseded-policy → separate inconsistency). `D1-INV-1..7`.

### 2.2 Buyer Match
- `BUYER_CANDIDATE_IDENTIFIED` (possession) · `BUYER_QUALIFIED` (the **buyer–opportunity pair** satisfies the org
  buyer-selection policy *for the current policy version* — contextual, not an intrinsic buyer trait).
- `BUYER_MATCHED` — **decision**: both parties mutually assented to pursue as intended counterparty (**mutual
  pursuit, NOT legal commitment** — no LOI/contract implied). Requires an **attributable acceptance record**. **At
  most one** active `BUYER_MATCHED` per opportunity unless org policy permits parallel. `2.1-INV-1..6`.

### 2.3 Letter of Intent (versioned)
- `LOI_DRAFTED` · `LOI_SENT` · `LOI_DELIVERED` — artifact/evidence, non-projecting.
- `LOI_ACCEPTED` — **decision**: both parties assented to the terms of a **specific LOI version**. Acceptance is
  **version-specific** and **does not propagate**; a counter-offer is a **new version**, never acceptance of the
  prior. Establishes mutual agreed intent; implies **no** executed contract/closing/payment. `3.1-INV-1..7`.

### 2.4 Executed Contract (versioned)
- `CONTRACT_DRAFTED` · `CONTRACT_SENT` (artifact) · `CONTRACT_EXECUTION_EVIDENCE` (evidence — **partial signatures
  live here**).
- `CONTRACT_EXECUTED` — **decision**: every signature/approval required by the **governing execution policy** for
  that **specific version** validly obtained. Projects `UNDER_CONTRACT`. It is a **binding agreement to transact**
  but MUST NOT imply contingencies satisfied, escrow, funding, closing, or payment (**executed ≠ downstream**).
  `4.1-INV-1..6`.

### 2.5 Closing (policy-configured)
- Closing facts are a **core ontology** (not limited by current modules): escrow / financing / assignment /
  `CONTINGENCY_REMOVED` / `CHECKLIST_ITEM_SATISFIED` (evidence/decision) + `SETTLEMENT_COMPLETED` / `DEED_RECORDED`
  / `FUNDS_DISBURSED`. Evidence-class facts (funds/deed/deposit/signature) MUST NOT be synthesized or waived into
  existence (GI-3).
- **`FUNDS_DISBURSED`** is a single typed money-movement fact: `{ recipient, purpose, amount, source,
  transaction_reference, obligation }`; `purpose ∈ {SellerProceeds, AssignmentFee, Commission, Refund,
  EarnestMoneyReturn, …}`; `obligation` links to the authoritative obligation (`OWN3.3-INV-1`).
- `TRANSACTION_CLOSED` — a **policy-relative decision** = *"the configured closing policy is satisfied"* — a
  **predicate over the fact graph**. Projects the `PAID` stage. `5.1-INV-1..3`, `5A/5B`.

*(Future ontology candidates, declared not defined: `TITLE_TRANSFERRED` (legal transfer ≠ `DEED_RECORDED`);
`SELLER_INTEREST_CONFIRMED` (gates the deferred `INTERESTED_SELLER` stage).)*

---

## 3. Authority model — the fact lifecycle (OPP-3 Part B)

One platform model governs *who may change what*. The **fact lifecycle**:

```
Artifact → Evidence → Decision → Retraction / Correction
```

**Capabilities** (mapped to roles by **organization policy**, not hardcoded):
`DRAFT_*` (create artifact) · `RECORD_*_EVIDENCE` (record external evidence — never synthesize) · `DECLARE_*`
(assert a decision) · `RETRACT_*` (supersede a decision) · `CORRECT_HISTORY` (supersede an erroneous fact) ·
`ACCEPT_*_EXCEPTION` *(policy-gated)*.

Normative authority rules (all MUST hold):
- Authorization attaches to **fact operations**, never to stages (there are no stage moves).
- Every operation is **attributable** (actor/seam + timestamp + affected fact); retract/reopen/exception/correct
  additionally require a **recorded reason**.
- **Append-only** (GI-1): retraction/reopen/correction create linked successor facts; never destroy prior ones.
- The applicable capability is determined by the fact's **GI-3 class**.
- **Exception model:** `ACCEPT_*_EXCEPTION` MAY relax only a **decision-layer / org-policy** requirement; it MUST
  NOT substitute for a missing **required evidence** fact, and MUST NOT redefine policy or become the new standard.
  Exception authority ≥ the corresponding decision authority.
- **Evidence precedes authority:** a decision MUST NOT depend on evidence not itself recorded as a fact; for
  execution, **evidence completeness precedes execution authority** for human and deterministic principals alike
  (`4A-INV-4`).
- Deterministic principals act only within **GI-2**.

---

## 4. Policy composition — archetypes (OWN-3)

Closing completion is **configured per transaction archetype** — a **data-driven matrix**, not hardcoded rules.

- **OWN3-INV-1** every transaction belongs to **exactly one** active archetype; a structure change *is* an
  auditable event.
- **OWN3-INV-2** predicates are **archetype-specific, ontology-shared** — same fact graph; differ only in required
  facts/states/relationships; never new semantics.
- **OWN3-INV-3** each archetype = **structural core** (invariant) **+ org-configurable layer** (may *strengthen*,
  never redefine).

Archetypes are legal **transaction structures**. **Tier-1 (defined):**
| Archetype | Structural core (⇒ `TRANSACTION_CLOSED`) | Notably NOT structural |
|---|---|---|
| **Cash** | `CONTRACT_EXECUTED` ∧ all required `CONTINGENCY_REMOVED` ∧ `SETTLEMENT_COMPLETED` ∧ `FUNDS_DISBURSED{SellerProceeds}` | escrow, deed-recorded (configurable); financing (N/A) |
| **Third-Party Financed** | Cash core **+ `FINANCING = FUNDED`** | (same) |
| **Assignment** | `CONTRACT_EXECUTED` ∧ `ASSIGNMENT_EXECUTED` ∧ `FUNDS_DISBURSED{AssignmentFee}` | financing, seller-side settlement/escrow/deed/title (never applicable); end-buyer-settlement dependency is configurable |

**Tier-2 (reserved — declared, predicates undefined):** Double Close · Subject-To · Seller Finance · Lease Option ·
Hybrid/Custom.

Relationships in a predicate are **logical dependencies, not timestamps** (e.g. `FUNDS_DISBURSED` *depends on*
`FINANCING=FUNDED`); the predicate accommodates existence, state, ordering, relationships, and future constraints.
A predicate evaluates the **transaction topology**, and MUST evaluate facts in their **required authoritative
state** (`5A-INV-2`; `ESCROW=OPENED ≠ RELEASED`, `FINANCING=COMMITTED ≠ FUNDED`).

The **pre-closing policy** (`CLEAR_TO_CLOSE`) uses the same machinery (a second policy-relative decision:
"required pre-closing conditions met" — e.g. required contingencies removed ∧ `FINANCING=CLEARED`).

---

## 5. Projection model (OWN-4)

Every projected stage maps to **exactly one** authoritative **decision** fact (`OWN4-INV-1`). If a stage would
require combining facts, a **decision fact** MUST be introduced and the stage projected from it.

**Canonical stage spine:**
```
LEAD → UNDERWRITTEN → BUYER_MATCHED → LOI_ACCEPTED → UNDER_CONTRACT → CLEAR_TO_CLOSE → PAID
```
| Stage | Backing decision fact |
|---|---|
| `LEAD` | entry state |
| `UNDERWRITTEN` | `UNDERWRITING_APPROVED` (existing V1.3 decision — reused) |
| `BUYER_MATCHED` | `BUYER_MATCHED` |
| `LOI_ACCEPTED` | `LOI_ACCEPTED` |
| `UNDER_CONTRACT` | `CONTRACT_EXECUTED` |
| `CLEAR_TO_CLOSE` | `CLEAR_TO_CLOSE` (pre-closing policy satisfied) |
| `PAID` | `TRANSACTION_CLOSED` |

`LEAD` is the **entry/base projection** — the value of the total projection when **no** decision fact yet holds
(`OWN-1 INV-3`, the empty-fact-set base case). `OWN4-INV-1` (exactly one decision fact per stage) governs the
**decision-backed** stages `UNDERWRITTEN … PAID`. `CLEAR_TO_CLOSE` and `UNDERWRITTEN` use the shared authority /
deterministic-eval machinery by reference (fact-lifecycle model + GI-2); `UNDERWRITING_APPROVED` is the existing
V1.3 decision, reused.

Projection is furthest-fact (`OWN-1 INV-5`): the stage reflects the furthest decision reached; missing
intermediate facts surface as **separate inconsistencies**, never suppress a later stage. Non-projecting
(operational attention): seller-contacted, financials-requested, T12/rent-roll received, offer-ready, LOI-sent.

---

## 6. Guard model (OPP-3 Part C)

- **Warn, don't block.** A fact operation that regresses the projection is *correct* and MUST NOT be prevented, but
  MUST require **explicit confirmation** surfacing the consequence (`OPP3-INV-1`).
- **No automatic authoritative downstream reversal.** Retracting an authoritative fact MUST NOT automatically
  create/retract/supersede/correct **another authoritative fact**. **Derived state — projections, operational
  attention, warnings, dashboards — MUST update automatically** (`OPP3-INV-2`). Reversing a downstream authoritative
  fact is a separate, individually-authorized operation.
- **Always audited** (GI-1).

---

## 7. Implementation constraints (rules implementation MUST satisfy — NOT implementation details)

1. **Stages are never persisted as source of truth.** Any stored stage is a **cache of the projection** and MUST be
   recomputable from facts at any time (`OWN-1 INV-1/2/4`).
2. **Exactly one projector** and **one evaluator per policy**, both **side-effect free** (`OWN-1 INV-7`, `GI-2`,
   `5B`). No other code path may write a projected stage.
3. **Facts are append-only.** The persistence layer MUST forbid in-place mutation/deletion of authoritative facts;
   change = linked successor (`GI-1`).
4. **Evidence is captured, never synthesized.** No principal — human or machine — may fabricate an evidence fact
   (`GI-3`, `2B-INV-5`, `4A-INV-2`).
5. **Authorization is evaluated on fact operations**, driven by policy-mapped capabilities — never on stage changes.
6. **Deterministic assertion requires machine-evaluable policy opt-in + reproducibility (recorded
   policy+rule-set+identity)**; otherwise the decision is human (`GI-2`).
7. **Closing/pre-closing policies are data-driven predicates per archetype** (structural core + org config),
   evaluating fact **existence, state, and relationships** — never stages/UI/projections (`5.1-INV-1`, `5A-INV-5`).
8. **Every projected stage resolves to exactly one decision fact** (`OWN4-INV-1`); the projection is total and
   deterministic.
9. **Regressions warn + audit; derived state auto-recomputes; authoritative facts never cascade** (`OPP3-INV-1/2`).
10. **Reserved archetypes and future candidate facts** (`TITLE_TRANSFERRED`, `SELLER_INTEREST_CONFIRMED`) MUST be
    addable **without** changing existing semantics (the ontology already anticipates them).

---

*Source of decisions: the [Slice 2 Decision Log](../releases/OPPORTUNITY_PIPELINE_SLICE2_DECISION_LOG.md). This
Specification is the normative contract; Phase 3 (Architecture & Acceptance) derives the state-transition model,
authorization model, automation hooks, acceptance criteria, and regression scenarios from it. No code until then.*

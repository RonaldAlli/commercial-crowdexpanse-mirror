# Opportunity Pipeline — Slice 2 Decision Log

> **The single authoritative place for Slice 2's business semantics — decided BEFORE any implementation.**
> Slice 2 runs in four phases: **(1) Decision** (founder-only, this log) → **(2) Workflow Freeze** → **(3)
> Architecture & Acceptance** → **(4) Implementation**. No state model, no code until the relevant decisions are
> **Frozen**. Companion to the [defect register](./OPPORTUNITY_PIPELINE_DEFECT_REGISTER.md) (which records why
> each item exists) and [Slice 1 acceptance](./OPPORTUNITY_PIPELINE_SLICE1_ACCEPTANCE.md).
>
> Each entry records: **Decision ID · Question · Adopted policy · Rationale · Explicit consequences ·
> Downstream implications · Status** (Draft → Frozen).

---

## OWN-1 · What business truth should a pipeline stage represent? · **✅ FROZEN 2026-07-22**

**Question.** Does a stage mean *activity* (what the team is working on), a *business fact* (an artifact exists),
or something else? Until this is settled, any state machine would encode provisional assumptions.

**Adopted policy.**
> A pipeline stage is a **deterministic, total** projection of **authoritative business state**, computed from
> objective business facts. It is **never itself authoritative data**.

Principles:
1. **Business facts are authoritative; stages are projections** derived from those facts.
2. **Stages are never edited directly.** A stage changes only because one or more authoritative facts change.
3. **Stages may legitimately regress.** If an authoritative fact is removed/invalidated, the projected stage
   recalculates accordingly (stages are **non-monotonic**).
4. **Stage ≠ current activity.** "What the team should work on next" is a separate **derived** concept and must
   never be conflated with stage.
5. **Projection uses the *furthest* authoritative fact reached** (not the highest *contiguous* fact). Missing
   intermediate facts do **not** erase later authoritative facts; they create data-quality / workflow
   inconsistencies handled **separately**.
6. **Projection is deterministic and total.** Every combination of authoritative facts (valid *and* invalid)
   resolves to **exactly one** projected stage.

**Rationale.** Only this model keeps two genuinely different questions from contaminating each other —
*what objectively exists* vs. *what the pipeline should show*. "Activity" stages (Option A) let the stage lie
and become an unreliable source of truth; "must-be-a-fact" stages (Option B) make the stage useless for flow.
Projecting from facts eliminates an entire class of synchronization defects and makes reporting/automation
deterministic and auditable. "Furthest fact" is correct because pretending a deal is still at `BUYER_MATCHED`
because an intermediate `LOI` record is missing would make the projection **knowingly inaccurate** when a
contract objectively exists; the right behavior is to project the furthest verified fact **and** separately
surface that the fact graph is inconsistent.

**Explicit consequences (accepted).**
- Three concerns become **independent**: *business truth* ("a signed contract exists"), *data quality* ("earlier
  evidence is missing"), *operational attention* ("someone must resolve this inconsistency"). They must not be
  merged.
- Metrics/automation that assume forward-only motion (time-in-stage, funnel conversion, "advanced to X"
  notifications) must tolerate **regression**.
- The interaction model inverts: users advance the pipeline by **asserting facts** (record LOI, upload executed
  contract, complete diligence), not by setting a stage. A manually-entered stage, if ever wanted, can exist
  only as an explicitly **non-authoritative annotation**.
- Determinism requires the projection be **total** — defined for out-of-order / "impossible" fact combinations
  (e.g. contract present while diligence incomplete): project the furthest fact **and** flag the inconsistency.

**Downstream implications.** Governs **OWN-2** (defines the facts + evidence + the total projection function),
**OWN-3** (PAID projects from a *configured closing policy* fact-set), **OWN-4** (every currently artifact-less
stage needs a backing fact or it cannot be projected), and reframes **OPP-3** (there are no direct ADMIN stage
moves to guard — the guardable actions become fact assertion/retraction and their downstream effects). Retires
the withdrawn "OPP-2 adjacency" framing.

**Status: FROZEN** (Ronald, 2026-07-22). Hinge decision: *furthest authoritative fact reached*.

---

## OWN-2 · What are the authoritative facts, and how do they project to one stage? · **DRAFT (next)**

**Question (sharpened by OWN-1).** Define the **authoritative business facts**, the **evidence** that
establishes each one, and the **deterministic, total projection function** that maps every valid *and* invalid
fact combination to **exactly one** operational stage — while **surfacing inconsistencies separately**.
*(Register origin: stage ⇄ diligence are today a dual, unsynchronized source of truth — e.g. stage
`T12_RECEIVED` while the `t12` diligence item is `NOT_REQUESTED`, and vice-versa.)*

**Depends on:** OWN-1 (Frozen). **Blocks:** the state-transition model (Phase 3). **Status: DRAFT** — open next.

---

## OWN-3 · What must be true for PAID? · **DRAFT**

**Question.** Should PAID require Financing/Escrow/Assignment artifacts, or only the due-diligence checklist?
Proposed framing (to ratify): **"PAID = successful completion of the org's *configured closing policy*,"** with
the closing template encoding required artifacts per deal type (cash / assignment / seller-finance / subject-to
/ double-close differ). No hard-coded rule; the OPP-1 fix already makes any added required item enforceable.
**Depends on:** OWN-1. **Status: DRAFT.**

---

## OWN-4 · Stages with no backing artifact · **DRAFT**

**Question.** `INTERESTED_SELLER`, `LOI_SENT`, `UNDER_CONTRACT` currently record facts no object owns (LOI
generation deferred; no executed-contract object; `contractValueUsd` optional). Under OWN-1 a stage cannot be
projected without a backing fact — so this becomes: **define the authoritative fact + evidence behind each such
stage** (e.g. `UNDER_CONTRACT` ⇒ an executed-contract Document), or rule the stage out of the projected set.
**Depends on:** OWN-1, OWN-2. **Status: DRAFT.**

---

## OPP-3 · Guarding disruptive changes · **DRAFT (reframed by OWN-1)**

**Question (reframed).** OPP-1's world had unguarded ADMIN *stage moves* (audited but unwarned; backward moves
don't reverse downstream side effects). Under OWN-1 there are **no direct stage moves** — so the policy question
becomes: should **fact assertions/retractions** that would regress the projected stage (and leave downstream
records — checklist/escrow/financing/assignment — in place) require a **UI confirmation / warning**, and should
any downstream reversal be offered? Every such change remains audited regardless. **Depends on:** OWN-1.
**Status: DRAFT.**

---
*Next: open OWN-2 in a dedicated Decision-phase session — authoritative facts, per-fact evidence, and the
deterministic total projection (furthest-fact) with separate inconsistency surfacing. No architecture or code
until OWN-2…OWN-4 + OPP-3 are Frozen.*

# Engineering Constitution — Opportunity Pipeline (Phase 4.0)

> **The engineering laws for building Slice 2.** Not a specification — a short list of rules no implementation may
> violate. If a change would break one of these, **stop**: it is either a missing requirement (return to the
> Decision process) or an unintended semantic change (reject). Read the [Spec](./BUSINESS_SEMANTICS_SPECIFICATION.md)
> and [Traceability Matrix](./OPPORTUNITY_PIPELINE_TRACEABILITY_MATRIX.md) for detail; this page is the daily law.
> 2026-07-22.

---

## The laws

1. **Business semantics may never be changed by code.** Meaning lives in the Specification, not the codebase.
2. **Every implementation artifact traces to the Traceability Matrix** — `Code → Architecture → Specification →
   Business Decision`.
3. **No PR introduces a new business concept.** A new fact, stage, policy, or invariant requires a decision first.
4. **Derived state is disposable and reconstructable** — projections, inconsistencies, operational attention,
   caches. Never authoritative.
5. **Only authoritative facts are persisted as business truth, and facts are append-only** — never mutated or
   deleted; change = a linked successor (GI-1).
6. **Exactly one side-effect-free predicate evaluator exists** — it serves authorization, projection, policy,
   what-if, and tests, so they agree by construction.
7. **Evidence is captured, never synthesized.** No actor — human, evaluator, or migration — may manufacture an
   evidence fact (GI-3).
8. **Authorization is on fact operations, never stages.** The projector, the evaluator, and authorization are all
   **observational** (they read; they never mutate).
9. **Every architectural invariant has acceptance coverage** — positive, negative, regression, and migration where
   applicable. No invariant ships untested.
10. **A semantic change requires reopening the Decision process** — Decision Log → Spec → re-derivation. Never an
    ad-hoc code change.
11. **Implementation never outruns acceptance.** No implementation is "complete" until **every** acceptance
    scenario tied to its traceability entries **passes**. Acceptance defines correctness — implementation does not.
12. **Exactly one Fact Graph Builder exists.** The construction of the authoritative fact graph — reconstruction,
    supersession resolution, active-fact determination, collection aggregation, and version resolution — has a
    single implementation, so no two consumers can disagree about what "the current facts" are. Peer to Law 6:
    Law 6 gives one interpretation of *predicates*, Law 12 one interpretation of the *ledger* they run against.
    See [Fact Graph Contract](./FACT_GRAPH_CONTRACT.md).
13. **Consumers reason only over the immutable FactGraph.** A consumer of business truth — the Predicate Engine
    first, then Authorization, Projection, Automation, and Acceptance — must never reconstruct, reinterpret, or
    supplement the ledger independently: no `SELECT`, no `lookupFact`, no re-deriving active/supersession/collection
    (FG-INV-12). It receives an already-complete graph and reasons over it. The natural counterpart to Law 12: if a
    needed fact is missing, extend the Builder — never query around it.

---

## Epic-exit gate (every epic concludes with this)

```
Architecture satisfied            ✓
Acceptance scenarios passing       ✓   (Law 11)
Traceability complete              ✓   (no orphan implementation)
No constitutional violations       ✓
Ready for next epic                ✓   → the next epic is authorized only after this gate passes
```

## How a slice ships (slice-completion checklist)

Do **not** run eight slices as eight parallel projects. Each slice is independently complete before the next:
```
Specification → Architecture → Acceptance → Implementation → Acceptance Pass → Merge
```
A slice is "done" only when its acceptance scenarios (by ID) pass against real code.

**Branch discipline (workflow safeguard, not a semantic law).** While an implementation branch is awaiting
fast-forward merge, any *related* documentation change that touches the same architectural area should land **on
that branch**, not directly on `main` — unless it is completely independent. A direct-to-main commit that overlaps
the outstanding branch's area diverges the branch and forces an avoidable rebase. (Learned from the B.3/glossary
divergence, 2026-07-22.)

---

## Work breakdown — epics (mirror the architecture, not UI screens)

Each epic cites its **Traceability entries · Acceptance scenario IDs · Spec sections** (from the
[Readiness Review §2](./OPPORTUNITY_PIPELINE_IMPLEMENTATION_READINESS_REVIEW.md)):

| Epic | Scope | Resolves | Acceptance |
|---|---|---|---|
| **E1 · Core Fact Infrastructure** ✅ | append-only store · supersession · versioning · audit | A-1/A-6/A-8 | AC-GI1-* |
| **E2 · Slice A — Fact Graph Builder** ✅ | the single canonical ledger interpretation (reconstruction · supersession · active-set · collection aggregation · version resolution) — Law 12/13, FG-INV-1..12 | (reconciles `activeFacts`) | AC-FG-* (25/25) |
| **E2 · Slice B — Predicate Engine** | the single side-effect-free evaluator over the Fact Graph · versioned pure-function predicates · what-if — **NO projection (E4)** | A-2/A-4/A-7 | AC-GI2-*, AC-5A/5B-* |
| **E3 · Authorization** | capability eval · preconditions · commit-time validation · DENY codes | AZ-1/AZ-2/AZ-4 | AC-AUTH*-* |
| **E4 · Projection** | stage projection · operational attention · inconsistency computation | A-3/A-9 | AC-OWN1/STM/OPP3-* |
| **E5 · Migration Framework** | legacy reconstruction · migration principal · provenance (3-outcome rule) | A-10 | AC-*-M* |
| **E6 · API** | authorization + transition-result contracts | — | AC (contract) |
| **E7 · UI** | projection display · operational attention · guard confirmations | DENY presentation | AC-OPP31-* |
| **E8 · Automation** | GI-2 evaluator runtime + hooks (⚠ depends on D27; must not gate E1–E7) | A-5 | AC-GI2-* |

E1 → E2 → E3 → E4 → E5, then E6/E7/E8. Each depends only on stable contracts beneath it.

**Layering (the single-interpretation spine):**
```
Ledger (E1) → Fact Graph Builder (E2·A) → Predicate Engine (E2·B) → { Authorization (E3), Projection (E4), Automation (E8), Acceptance }
```
The Predicate Engine **evaluates predicates only** — it does not decide how predicate results become stages.
Projection (E4) *consumes* predicate results; it is not part of predicate evaluation.

---

## The one metric — Traceability Coverage

Every merged change answers all five:
1. Which **business decision** does this implement?
2. Which **Specification** section?
3. Which **architecture** artifact?
4. Which **acceptance** scenarios?
5. Which **Traceability Matrix** entry?

**If any answer is "none," stop** — the work is either a missing requirement (open a decision) or an unintended
semantic change (reject). Traceability Coverage, not lines of code or velocity, is the health signal for Phase 4.

---

*Architecture track complete. Next milestone is not "write code" — it is **authorize Phase 4 and begin E1 (Core
Fact Infrastructure)**, with owner assignment for the open realization questions, under the discipline above.*

# Fact Graph Contract (FROZEN on approval) — the single authoritative interpretation of the ledger

> **The seam between the ledger and everything that reasons over it.** The E1 ledger stores immutable facts; the
> Predicate Engine (E2), Authorization (E3), Projection (E4), Automation (E8), and tests all need to reason over
> "the current facts." This contract inserts **exactly one** component between them so there is a *single*
> authoritative interpretation of the ledger — one reconstruction, one supersession resolution, one active-fact
> calculation, one collection aggregation, one version-resolution strategy. Requested by the founder before E2.
> Depends on the frozen [E1 Public API v1.0](./E1_PUBLIC_API_CONTRACT.md). Governed by **Constitution Law 12**.
>
> **Status:** **RATIFIED · FROZEN 2026-07-22** (design + Law 12 + `activeFacts()` façade + first-class `FactGraph`
> object + explicit `FactGraphRequest` + FG-INV-1..8). **Amended v1.1 (post Slice-A acceptance): §4.3 formal
> Structural vs Decision-visible active-set distinction + FG-INV-12 Fact Graph completeness.** The **Fact Graph
> Builder** is E2 · Slice A — **implemented + accepted + merged** (`opp-slice2-e2a-complete`). Public interface
> frozen separately in [FACT_GRAPH_PUBLIC_API.md](./FACT_GRAPH_PUBLIC_API.md). Slice B (Predicate Engine) consumes
> it.
>
> **Why this seam matters (dependency linearization).** Before it, every consumer would reconstruct facts
> independently — `Ledger → {Projection, Authorization, Automation, …}` fanning out, each re-interpreting truth.
> After it, the platform dependency graph *linearizes*: `Ledger → Fact Graph Builder → Predicate Engine →
> {Authorization, Projection, Automation, What-if, Acceptance}`. Business-truth interpretation is centralized once;
> policy evaluation and decision-making remain independent above it. One authoritative interpretation, no drift.

---

## 1. Position in the architecture

```
        PipelineFact Ledger            (E1 · frozen v1.0 — records immutable facts)
                 │   reconstructHistory(org, opp)   ← the ONLY input
                 ▼
        Fact Graph Builder             (exactly one implementation — Law 12)
                 │   build(history, versionContext)
                 ▼
        Immutable Fact Graph           (a canonical, deterministic, read-only value)
                 │
     ┌───────────┼───────────┬───────────────┬───────────┐
     ▼           ▼           ▼               ▼           ▼
  Predicate   Authorization Projection    Automation    Tests
  Engine(E2)     (E3)          (E4)          (E8)
```

**No consumer reasons over the raw ledger.** The evaluator never calls `reconstructHistory`/`activeFacts` or Prisma
directly; it consumes the Fact Graph. The Builder is the *only* code that reads the ledger for interpretation.

## 2. Law 12 (Constitution addition)

> **Exactly one Fact Graph Builder exists.** The construction of the authoritative fact graph — reconstruction,
> supersession resolution, active-fact determination, collection aggregation, and version resolution — has a single
> implementation, so no two consumers can disagree about what "the current facts" are. It is the peer of Law 6
> (exactly one predicate evaluator): Law 6 guarantees one *interpretation of predicates*; Law 12 guarantees one
> *interpretation of the ledger* those predicates run against.

## 3. Responsibilities (the Builder owns these — and only these)

1. **Reconstruction** — read the complete, ordered history for an opportunity via the frozen ledger API
   (`reconstructHistory`), in `globalSequence` order. The Builder consumes **only** that API.
2. **Supersession resolution** — group rows by `factChainId` (semantic identity); the active member of a chain is
   the one no row supersedes. Retracted/invalidated chains are resolved to *absent-for-decision* while remaining
   fully present in history (the graph never discards history).
3. **Active-fact determination** — the single canonical active-fact set (a fact is active iff unsuperseded). This is
   the one-and-only active calculation in the platform (see §7 reconciliation with `activeFacts()`).
4. **Collection aggregation** — for the six collection fact types (`DILIGENCE_MATERIAL_RECEIVED`,
   `BUYER_CANDIDATE_IDENTIFIED`, `BUYER_QUALIFIED`, `CONTRACT_EXECUTION_EVIDENCE`, `CONTINGENCY_REMOVED`,
   `CHECKLIST_ITEM_SATISFIED`), assemble the per-`subjectKey` active members into an addressable set, so predicates
   ask "are all required subjectKeys present/satisfied?" without re-deriving grouping.
5. **Version resolution** — build the graph **relative to an explicit `versionContext`** (policy + rule-set
   version), and resolve the active `artifactVersion` for versioned facts (LOI/contract). Same history + same
   `versionContext` ⇒ byte-identical graph (GI-2 reproducibility).
6. **Expose a canonical, immutable graph** — a read-only value with stable, indexed access (below). It never mutates
   and never writes.

## 4. The interface — `FactGraphRequest` in, first-class `FactGraph` out

### 4.1 `FactGraphRequest` (required, explicit — nothing implicit)

The Builder's sole entry point is `buildFactGraph(request: FactGraphRequest): FactGraph`. The request makes every
graph **explicitly reproducible**:

```
FactGraphRequest = {
  organizationId,
  opportunityId,
  versionContext: {              // explicit — a graph is never built against an implicit "current" policy
    policyVersion,
    ruleSetVersion,
    artifactVersion?,            // optional; resolves versioned facts (LOI/contract) when supplied
  },
}
```

Structural interpretation (supersession, active-fact, collection membership) is **version-independent** and always
computed; `versionContext` governs version-resolution and policy-anchored reads and is **stamped onto the graph**
so the same request always yields the same graph (GI-2 / FG-INV-7).

### 4.2 `FactGraph` — a first-class immutable domain object

Consumers never manipulate reconstruction results directly; they hold a stable `FactGraph` and ask it questions.
The surface (technology-neutral):

- **`graph.activeFacts`** — the full canonical active set (unsuperseded), the one active calculation (FG-INV-3).
- **`graph.activeByType(factType)`** — the active singleton fact for a singleton type (e.g. `BUYER_MATCHED`,
  `CONTRACT_EXECUTED`, `TRANSACTION_CLOSED`), or absent.
- **`graph.byFactType(factType)`** — all facts of a type across history (active flagged).
- **`graph.byChain(factChainId)`** — the full lineage of one semantic fact (all versions; active one flagged).
- **`graph.collection(factType)`** — for the six collection types, `subjectKey → active fact` + the present-key
  set, for "all required present/satisfied" checks (FG-INV-4).
- **`graph.provenance(fact)`** — `VERIFIED` vs `MIGRATION_ORIGIN`, so consumers honor migration rules without
  re-reading the ledger.
- **`graph.versionContext`** — the context the graph was built under (reproducibility/replay).
- **`graph.assertInvariant()`** — self-check that the graph satisfies FG-INV-* (used by consumers/tests as a guard).
- **`graph.history`** — the complete ordered fact list (immutable reference; never filtered).

The object is **frozen/read-only**: no consumer can mutate its state (FG-INV-8). It exposes interpretation, never
storage columns, SQL, or Prisma types.

### 4.3 Two active sets — a formal, load-bearing distinction (do not collapse)

These are **different concepts**; future engineers must never "optimize" one into the other:

- **Structural Active Set** = the **unsuperseded** facts — the current tip of every chain. Exposed as
  **`graph.activeFacts`**. A `RETRACT`/`INVALIDATE` fact is *structurally active*, because it is the current tip of
  its chain. This set preserves E1's `activeFacts` behavior exactly.
- **Decision-visible Active Set** = the structurally-active facts that **currently participate in business
  reasoning** — i.e. facts still *asserting* their business claim. Exposed via **`graph.activeByType`** and
  **`graph.collection`** (and `byChain(...).asserted`). A retraction is **structurally active but not
  decision-visible**: it is the current tip, yet it deliberately *suppresses* the underlying assertion.

The subtlety: **a retraction fact remains structurally active while suppressing the business assertion it
withdraws.** Structural presence ≠ decision participation. The graph exposes both, on purpose; consumers reasoning
about business state use the **decision-visible** accessors, never the raw structural set.

## 5. Invariants (FG-INV) — each maps to an `AC-FG-*` family

The eight **single-interpretation** invariants (founder-ratified):

- **FG-INV-1 · One reconstruction.** A single algorithm reconstructs history for an opportunity.
- **FG-INV-2 · One supersession resolution.** A single algorithm resolves which member of a `factChainId` is active.
- **FG-INV-3 · One active-fact calculation.** A single computation yields the active (unsuperseded) set.
- **FG-INV-4 · One collection aggregation.** A single algorithm groups collection facts by `subjectKey`.
- **FG-INV-5 · One version resolution.** A single strategy resolves the `versionContext` / active `artifactVersion`.
- **FG-INV-6 · Immutable graph.** The `FactGraph` is a read-only value; construction performs no writes.
- **FG-INV-7 · Graph reproducible.** The same `FactGraphRequest` over the same history yields an identical graph
  (GI-2 determinism).
- **FG-INV-8 · Consumers cannot mutate graph state.** No accessor exposes a mutable handle; consumers observe only.

Plus three structural invariants the seam also guarantees:

- **FG-INV-9 · Ledger-only input.** The Builder reads the ledger solely through the frozen E1 v1.0 API; it issues no
  raw queries and touches no other source (Law 12's single reader).
- **FG-INV-10 · History-preserving.** The graph never deletes or rewrites history; supersession resolves *which fact
  is active*, not *what happened*.
- **FG-INV-11 · Interpretation only.** The graph exposes no predicate result, stage, authorization decision, or
  inconsistency — those are consumers' jobs (E2/E3/E4). Observational (Law 8).
- **FG-INV-12 · Fact Graph completeness.** The graph contains every fact necessary to answer every question the
  Specification permits about its opportunity, so **consumers never perform supplementary ledger reads.** The
  Predicate Engine, Authorization, Projection, Automation, and Acceptance each receive an *already-complete* graph
  and MUST NOT execute `SELECT …`, `lookupFact(…)`, or any other read against the ledger — doing so would create a
  second interpretation and weaken the single-interpretation guarantee (Law 12). Scope: the Builder loads the
  **complete per-opportunity history**; org policy/configuration enters only through the explicit `versionContext`,
  never through a side read. If a consumer finds it needs a fact the graph doesn't carry, that is a gap in this
  contract to be resolved *here* (extend the Builder), never patched by an independent query.

## 6. Boundaries — what the Fact Graph Builder must NOT do

No predicate evaluation (E2) · no stage projection (E4) · no authorization decision (E3) · no fact mutation or
supersession (that is a ledger write via E1) · no automation/scheduling (E8). It assembles the canonical graph and
stops. It is an **observer with one job**.

## 7. Reconciliation with the frozen ledger `activeFacts()` — **RATIFIED 2026-07-22**

E1's frozen API exposes `activeFacts(org, opp)`, which computes an active set. To honor Law 12 (one active-fact
calculation) there must not be a *second* implementation inside the Builder. **Ratified decision:**

> **`activeFacts()` becomes a thin compatibility façade that delegates to the Fact Graph Builder** — literally
> `return buildFactGraph(request).activeFacts` — so the frozen v1.0 signature and behavior are preserved (a v1.1
> *internal, non-breaking* refactor) while the Builder holds the single implementation. Active-fact determination is
> structural (version-independent), so the façade delegates cleanly; interpreting consumers (E2–E4, E8, tests)
> depend on the **graph**, not on `activeFacts()`. The API is kept — downstream code may rely on it — but there is
> now exactly one active-fact calculation.

This is the only architecture consistent with Law 12: any surviving second interpretation of the ledger would
eventually drift, which is precisely what the single-source discipline exists to prevent.

## 8. Acceptance (AC-FG-*, gated before the Predicate Engine)

Positive: reconstruction order; active resolution across a supersession chain; collection aggregation over multiple
`subjectKey`s; version-context reproducibility (same inputs ⇒ identical graph). Negative: retracted decision resolves
to absent-for-decision while present in history; a corrected fact exposes the corrected active member. Regression:
adding a later fact never changes earlier chains' resolution except through explicit supersession. Migration: a
`MIGRATION_ORIGIN` fact is interpreted identically to a `VERIFIED` one but reports its provenance. The Builder is not
"done" until AC-FG-* pass (Law 11).

## 9. Sequencing

**E2 · Slice A — Fact Graph Builder** (this contract) → **E2 · Slice B — Predicate Engine** (consumes the graph).
Slice B does not begin until Slice A passes its exit gate. Traceability: `Fact Graph Builder → this contract →
Spec (GI-1/GI-2, fact families, OWN-3 predicates) → Decision Log`. Every consumer PR from E2 onward cites the graph
as its input, not the ledger.

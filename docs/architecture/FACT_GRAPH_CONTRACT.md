# Fact Graph Contract (FROZEN on approval) — the single authoritative interpretation of the ledger

> **The seam between the ledger and everything that reasons over it.** The E1 ledger stores immutable facts; the
> Predicate Engine (E2), Authorization (E3), Projection (E4), Automation (E8), and tests all need to reason over
> "the current facts." This contract inserts **exactly one** component between them so there is a *single*
> authoritative interpretation of the ledger — one reconstruction, one supersession resolution, one active-fact
> calculation, one collection aggregation, one version-resolution strategy. Requested by the founder before E2.
> Depends on the frozen [E1 Public API v1.0](./E1_PUBLIC_API_CONTRACT.md). Governed by **Constitution Law 12**.
>
> **Status:** proposed for approval (design artifact — no implementation yet). On approval this contract freezes and
> the **Fact Graph Builder** is the first gated slice of E2, ahead of the Predicate Engine.

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

## 4. The Fact Graph — exposed shape (technology-neutral)

The graph is an **immutable value** keyed to `(organizationId, opportunityId, versionContext)`, exposing:

- **`history`** — the complete ordered fact list (reference to the immutable record; never filtered).
- **`activeByType(factType)`** — the active singleton fact for a singleton type (e.g. `DECISION` facts
  `BUYER_MATCHED`, `CONTRACT_EXECUTED`, `TRANSACTION_CLOSED`), or absent.
- **`collection(factType)`** — for collection types, the map `subjectKey → active fact`, plus the set of present
  keys, for "all required present" checks.
- **`chain(factChainId)`** — the full lineage of one semantic fact (all versions, with the active one flagged).
- **`versionContext`** — the policy/rule-set version the graph was built under (stamped for reproducibility/replay).
- **`provenanceOf(fact)`** — `VERIFIED` vs `MIGRATION_ORIGIN`, so consumers can honor the migration rules without
  re-reading the ledger.

Access is **derived and pure**: the graph exposes interpretation, never storage columns, SQL, or Prisma types.

## 5. Invariants (FG-INV)

- **FG-INV-1 · Single builder.** Exactly one implementation constructs the graph (Law 12).
- **FG-INV-2 · Ledger-only input.** The Builder reads the ledger solely through the frozen E1 API; it issues no raw
  queries and touches no other source.
- **FG-INV-3 · Pure & observational.** Building performs no writes and has no side effects (Law 8). Given identical
  `(history, versionContext)` it is deterministic and reproducible.
- **FG-INV-4 · History-preserving.** The graph never deletes or rewrites history; supersession resolves *which fact
  is active*, not *what happened*.
- **FG-INV-5 · One of each interpretation.** Active-fact, supersession, collection, and version resolution each have
  exactly one implementation, all inside the Builder.
- **FG-INV-6 · Version-anchored.** Every graph is stamped with the `versionContext` it was built under; two
  consumers using the same context see the same graph (GI-2).
- **FG-INV-7 · Interpretation only.** The graph exposes no predicate result, stage, authorization decision, or
  inconsistency — those are consumers' jobs (E2/E3/E4).

## 6. Boundaries — what the Fact Graph Builder must NOT do

No predicate evaluation (E2) · no stage projection (E4) · no authorization decision (E3) · no fact mutation or
supersession (that is a ledger write via E1) · no automation/scheduling (E8). It assembles the canonical graph and
stops. It is an **observer with one job**.

## 7. Reconciliation with the frozen ledger `activeFacts()` (the one open decision)

E1's frozen API already exposes `activeFacts(org, opp)`, which computes an active set. To honor Law 12 (one
active-fact calculation) we must not have a *second* implementation inside the Builder. Recommendation:

> **`activeFacts()` becomes a thin façade that delegates to the Fact Graph Builder** — same signature, same
> behavior, so the frozen v1.0 contract is unchanged (a v1.1 *internal* refactor, non-breaking), while the Builder
> holds the single implementation. Interpreting consumers (E2–E4, E8, tests) depend on the **graph**, not on
> `activeFacts()`; the façade remains only as a public convenience.

This is the one point I'd ask you to ratify before the Builder is implemented. (Alternative: mark `activeFacts()`
"raw/low-level, superseded by the graph for interpretation" and leave it untouched — but delegation is cleaner and
literally enforces Law 12.)

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

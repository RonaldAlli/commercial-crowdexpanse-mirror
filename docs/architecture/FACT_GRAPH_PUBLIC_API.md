# Fact Graph Builder — Public API Contract **v1.0** (FROZEN)

> **What this freezes:** the *interface* of the single Fact Graph Builder (E2 · Slice A) — the one component that
> interprets the ledger. E3 (Authorization), E4 (Projection), E8 (Automation), the Predicate Engine (E2 · Slice B),
> and the acceptance suite all **consume `buildFactGraph` + the `FactGraph` object** and MUST NOT reach past it to
> the ledger (FG-INV-12). The implementation behind this interface may change freely as long as the contract holds.
> Frozen 2026-07-22 at `opp-slice2-e2a-complete` (`f88644b`). Module: `lib/pipeline-facts` (barrel). Governed by
> Constitution **Law 12**; semantics in the [Fact Graph Contract](./FACT_GRAPH_CONTRACT.md).
>
> **Change discipline:** identical to the E1 API — a change traces `Code → Architecture → Specification → Business
> Decision`. Breaking change ⇒ major bump (v2.0) + decision process; additive/backward-compatible ⇒ minor (v1.1).

---

## 1. Consumption rule

- Consumers import from `lib/pipeline-facts` only. They call `buildFactGraph(request)` and then ask the returned
  `FactGraph` questions. They never import `@/lib/prisma` for `pipeline_facts`, never issue SQL, never call
  `reconstructHistory`/`activeFacts` for interpretation, and never re-derive active/supersession/collection/version.
- The graph is **already complete** for its opportunity (FG-INV-12) — no supplementary ledger reads, ever.
- The graph is **observational**: it yields interpretation, never predicate results, stages, authorization
  decisions, or inconsistencies (those belong to the consumer epics).

## 2. Entry point

### `buildFactGraph(request: FactGraphRequest): Promise<FactGraph>`
The **only** constructor of a `FactGraph` (Law 12). Reads the complete per-opportunity history via the frozen E1
v1.0 API and returns an immutable graph. Pure/deterministic: same request + same history ⇒ identical graph.

```
FactGraphRequest = {
  organizationId: string,
  opportunityId: string,
  versionContext: { policyVersion: string, ruleSetVersion: string, artifactVersion?: string | null },
}
```
`STRUCTURAL_CONTEXT` — an exported, explicit `VersionContext` for structural-only consumers (active-fact
determination is version-independent). Never an implicit default.

## 3. The `FactGraph` object (read surface)

| Member | Returns | Meaning |
|---|---|---|
| `graph.history` | `readonly PipelineFact[]` | complete ordered history (never filtered) — FG-INV-10 |
| `graph.activeFacts` | `readonly PipelineFact[]` | **Structural Active Set** — unsuperseded tips (incl. RETRACT/INVALIDATE) |
| `graph.activeByType(factType)` | `PipelineFact \| undefined` | **Decision-visible** asserted singleton of a type (absent if none/withdrawn) |
| `graph.activeAssertedByType(factType)` *(v1.1)* | `readonly PipelineFact[]` | **Decision-visible** asserted active facts of a type across any subjectKey — for multi-instance non-collection facts (e.g. `FUNDS_DISBURSED` by purpose) |
| `graph.collection(factType)` | `{ byKey: ReadonlyMap<string,PipelineFact>, keys: ReadonlySet<string> }` | **Decision-visible** per-`subjectKey` active facts |
| `graph.byChain(factChainId)` | `{ all, active, asserted }` | one semantic fact's lineage: full / structural tip / asserted tip |
| `graph.byFactType(factType)` | `readonly PipelineFact[]` | all facts of a type across history |
| `graph.isActive(factId)` | `boolean` | is this row the unsuperseded tip of its chain |
| `graph.provenance(fact)` | `VERIFIED \| MIGRATION_ORIGIN` | fact provenance without re-reading the ledger |
| `graph.versionContext` | `VersionContext` | the context the graph was built under (reproducibility) |
| `graph.assertInvariant()` | `void` (throws) | self-check of FG-INV-* — a consumer/test guard |

**Structural vs Decision-visible (do not collapse):** `activeFacts` is the structural set (tips, incl. retractions);
`activeByType`/`collection`/`byChain(...).asserted` are decision-visible (retractions suppress the assertion). See
[Fact Graph Contract §4.3](./FACT_GRAPH_CONTRACT.md).

## 4. Invariants a consumer may rely on

1. Exactly one Builder produced this graph; there is no other interpretation of the ledger (Law 12 / FG-INV-1..5).
2. The graph is immutable/frozen; no accessor exposes a mutable handle (FG-INV-6/8).
3. Same `FactGraphRequest` over the same history ⇒ identical graph (FG-INV-7).
4. The graph is complete for its opportunity; the consumer never needs a supplementary ledger read (FG-INV-12).
5. History is preserved; supersession resolves *which fact is active*, not *what happened* (FG-INV-10).

## 5. Out of scope (consumer epics own these)

Predicate evaluation (E2 · Slice B) · stage projection (E4) · authorization decisions (E3) · inconsistency
computation (E4) · fact mutation/supersession (an E1 ledger write) · automation (E8). The Builder interprets and
stops.

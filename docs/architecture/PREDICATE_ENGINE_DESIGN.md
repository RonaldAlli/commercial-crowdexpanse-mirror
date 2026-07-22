# E2 · Slice B — Predicate Engine · Technical Design (ratified before implementation)

> The single side-effect-free evaluator. `EvaluationContext → Predicate → EvaluationResult`. It reasons **only**
> over the immutable `FactGraph` (Law 13) and evaluates predicates — it does **not** project stages (E4),
> authorize (E3), mutate facts, or schedule automation. Realizes GI-2 (machine-evaluable, deterministic,
> reproducible). Consumes the frozen [Fact Graph Public API v1.0](./FACT_GRAPH_PUBLIC_API.md). Founder-ratified
> 2026-07-22; implementation is derivation of this doc under the Epic Exit Gate.

---

## 1. Predicate representation (ratified: pure versioned functions — no DSL)

A predicate is a **pure function over an immutable `FactGraph`**, identified by `(predicateId, ruleSetVersion)`.
Its policy constants (required material sets, required contingencies, archetype requirements) are **embedded in the
versioned implementation** — so the version fully determines the function; the graph determines the inputs. No
policy DSL now; if externally-authored policy is ever needed, a DSL can compile to this exact interface.

```
Predicate = (context: EvaluationContext) => PredicateOutcome
PredicateOutcome = { satisfied: boolean, reasons: Reason[], factsRelied: string[], missing: string[] }
```

## 2. `EvaluationContext` (the ratified abstraction — the predicate's whole world)

A predicate evaluates against **exactly** this context and nothing else:

```
EvaluationContext = {
  graph:          FactGraph,          // the single authoritative interpretation (already complete — FG-INV-12)
  ruleSetVersion: string,             // selects the predicate implementations / their embedded policy
  policyVersion:  string,             // policy anchor (carried for stamping/traceability)
  registry:       PredicateRegistry,  // (predicateId, ruleSetVersion) -> Predicate
  evaluate:       (predicateId) => EvaluationResult,  // sub-evaluation ONLY through the evaluator (PE-INV-1)
}
```

`context.evaluate` is the **only** way one predicate may use another — it routes through the evaluator, so there
are no hidden predicate-to-predicate dependency graphs (PE-INV-1). A predicate never imports another predicate
directly.

## 3. `EvaluationResult` (ratified + `evaluationId` and `determinismStamp`)

```
EvaluationResult = {
  evaluationId:     string,      // DETERMINISTIC content hash of the inputs (see §5) — NOT random
  predicateId:      string,
  satisfied:        boolean,
  policyVersion:    string,
  ruleSetVersion:   string,
  determinismStamp: { graphVersionContext: VersionContext, predicateVersion: string },
  reasons:          Reason[],    // structured, explainable — why satisfied / why not
  factsRelied:      string[],    // fact ids consulted (traceability)
  missing:          string[],    // unmet requirements (fail-closed detail)
}
```

`determinismStamp` = the graph's `versionContext` + the predicate version (`ruleSetVersion`). Two evaluations are
comparable across history by stamp; identical stamp **and** identical graph ⇒ identical result.

## 4. The evaluator (the one entry point — Law 6)

```
evaluate(predicateId: string, context: EvaluationContext): EvaluationResult
```
Resolves `registry.get(predicateId, ruleSetVersion)`, runs it against the context, wraps its `PredicateOutcome`
into an `EvaluationResult` (stamping `evaluationId` + `determinismStamp`). Fail-closed: an unknown predicate, or a
predicate that throws, yields `satisfied:false` with a reason — never an exception to the caller. The **same**
evaluator serves authorization, projection, what-if, and tests (Law 6), so they agree by construction.

## 5. Determinism surface (GI-2 realization rule — ratified, elevated)

**The evaluator accepts exactly `FactGraph + ruleSetVersion` (+ the carried `policyVersion`). Nothing else.**
Explicitly forbidden inside evaluation: current time, database/HTTP/IO, randomness, caches, environment variables.
Therefore:
- **PE-INV-2 · Referential transparency** — `evaluate(X) == evaluate(X)` for identical inputs; no observable side
  effects, no hidden state.
- `evaluationId` is a **deterministic** content hash over `(predicateId, ruleSetVersion, policyVersion, graph
  fingerprint)` — where the graph fingerprint is a stable digest of the graph's active facts + `versionContext`.
  Being content-derived (not random) is precisely what preserves PE-INV-2 while still giving a stable handle for
  comparing historical evaluations.

## 6. Predicate invariants (PE-INV)

- **PE-INV-1 · Predicate isolation.** Every predicate evaluates only against its supplied `EvaluationContext`; it
  may invoke another predicate **only** via `context.evaluate` (through the evaluator), never by direct call.
- **PE-INV-2 · Predicate referential transparency.** `evaluate(X) == evaluate(X)`; pure, deterministic, no side
  effects, no hidden state.
- **PE-INV-3 · Graph-only inputs (Law 13).** A predicate reads business truth solely from `context.graph`; it never
  reconstructs, reinterprets, or supplements the ledger (no `SELECT`, no `lookupFact`).
- **PE-INV-4 · Evaluation-only.** A predicate returns a verdict; it never projects a stage, authorizes, or mutates.

## 7. First predicate set (ratified acceptance anchors, `ruleSetVersion = "rs-1"`)

These exercise singleton facts, collection facts, versioned decisions, archetype policy, and policy composition:

| predicateId | Satisfied when (rs-1) | Exercises |
|---|---|---|
| `DILIGENCE_COMPLETE` | all rs-1 required diligence materials received (`collection('DILIGENCE_MATERIAL_RECEIVED')` ⊇ required) | collection facts |
| `CLEAR_TO_CLOSE` | `DILIGENCE_COMPLETE` (via `context.evaluate`) ∧ all rs-1 required contingencies removed ∧ `FINANCING` state ∈ cleared-set | composition + singleton state + collection |
| `TRANSACTION_CLOSED.CASH` | `CONTRACT_EXECUTED` (versioned decision) ∧ required contingencies removed ∧ `SETTLEMENT_COMPLETED` ∧ `FUNDS_DISBURSED{purpose:SellerProceeds}` | singleton + collection + versioned + evidence |
| `TRANSACTION_CLOSED.THIRD_PARTY_FINANCED` | `TRANSACTION_CLOSED.CASH` (via `context.evaluate`) ∧ `FINANCING` state = `FUNDED` | archetype composition + state |
| `TRANSACTION_CLOSED.ASSIGNMENT` | `CONTRACT_EXECUTED` ∧ `ASSIGNMENT_EXECUTED` ∧ `FUNDS_DISBURSED{purpose:AssignmentFee}` | archetype policy + typed payload |

Decision-visible reads only (retractions suppress assertions — FactGraph §4.3). Remaining predicates are added as
downstream consumers need them; each new predicate is a versioned addition, never an ad-hoc change.

## 8. Acceptance (AC-GI2-*), per the ratified matrix

For **every** predicate: **positive · negative · missing-evidence · wrong-version · regression · migration**.
Plus engine-level: PE-INV-1 (isolation), PE-INV-2 (referential transparency — same inputs ⇒ identical result incl.
`evaluationId`), determinism-surface (no time/IO/random), fail-closed (unknown predicate ⇒ `satisfied:false`).
Structure: `AC-GI2 → Evaluator → Predicate → Expected EvaluationResult`.

## 9. Boundaries (what Slice B must NOT do)

No stage projection (E4) · no authorization (E3) · no fact mutation/supersession (E1 write) · no automation (E8) ·
no ledger reads (Law 13). It evaluates predicates over the graph and stops. Traceability: `Predicate Engine → this
design → Fact Graph Public API + Spec (GI-2, OWN-3 archetypes, 5A/5B closing) → Decision Log`.

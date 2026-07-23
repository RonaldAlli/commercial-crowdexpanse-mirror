# E6 · API — Technical Design (ratified w/ refinements; for freeze before implementation)

> The operational seam that joins the canonical subsystems **without becoming a business-logic layer** (API-INV-1).
> A `Coordinator` sequences `FactGraph → Evaluator → Authorization → commit-under-guard → Projection` and translates
> outcomes to the frozen [API](./API_CONTRACT.md) / [Error](./API_ERROR_CONTRACT.md) contracts. Commit is
> transaction-scoped and race-safe (API-INV-2), side-effect-free before commit (API-INV-3), and transport-idempotent.
> Founder-ratified w/ refinements 2026-07-23.

---

## 1. Invariants

- **API-INV-1 · Transport/orchestration only.** The API/Coordinator never evaluates, authorizes, projects, migrates,
  or reconstructs; it never owns predicate conditions, permissions, stage rules, fact semantics, migration mappings,
  or DENY reinterpretation. It sequences canonical components and translates their outputs.
- **API-INV-2 · Transaction-scoped commit validation.** Every authoritative DB read **and** append in the commit
  path uses the **same transaction client** (`tx`). **No global-client escape** is permitted inside the commit path.
- **API-INV-3 · No pre-commit mutation.** Before commit-time revalidation succeeds, the Coordinator performs **no**
  authoritative write, workflow launch, event publication, or externally-visible side effect. Operational events are
  emitted **after** commit, or via an **outbox written atomically with the fact**.

## 2. Transaction-client threading (additive, required by API-INV-2)

The commit path must run the Builder, Evaluator inputs, and ledger append against one `tx`. This requires **additive,
backward-compatible** `client?` parameters on the frozen internals (existing callers unchanged; default = global
`prisma`):
- E1 `reconstructHistory(org, opp, client?)`, `recordFact(input, client?)` (and `recordMigrationFact`).
- E2·A `buildFactGraph(request, client?)` → threads `client` into `reconstructHistory`.
The Evaluator (E2·B) and Authorization (E3) stay pure (they consume the `tx`-built graph/artifact — no DB access).

## 3. Concurrency mechanism (explicit — an ordinary transaction is NOT enough)

Per opportunity, a **`pg_advisory_xact_lock(hashtext(org||opp))`** is taken **first** inside the commit transaction,
serializing commits for that opportunity for the transaction's lifetime. Within the lock: rebuild the graph (`tx`),
re-evaluate, recompute `authorize`, compare expected identities, then `recordFact` (`tx`). Belt-and-suspenders:
a **compare-and-insert on the latest `globalSequence`** for the opportunity (reject if it advanced past
`expectedGlobalSequence`). The advisory lock removes the read-then-write race without SERIALIZABLE-retry complexity;
the sequence compare is the explicit guard the API contract references. (Isolation choice documented: advisory lock
+ sequence compare; SERIALIZABLE-with-retry is the alternative if the lock proves insufficient.)

## 4. The write Coordinator

```
perform(request):                                   // API-INV-3: nothing authoritative happens before commit
  graph0    = buildFactGraph(vc)                     // pre-check (no lock)
  artifact0 = evaluateArtifact(policy.requiredPredicate, graph0)
  decision0 = authorize({actor, capability, operation, policy, artifact0})
  if !decision0.allow → DENIED(translate(decision0))          // no write

  requestId dedup: if an idempotency record for requestId exists → return its stored response (§6)

  COMMIT = prisma.$transaction(tx =>                  // API-INV-2: all reads+append on tx
     advisory_xact_lock(org, opp)                     // §3
     graphF    = buildFactGraph(vc, tx)
     artifactF = evaluateArtifact(policy.requiredPredicate, graphF)
     decisionF = authorize({actor, capability, operation, policy, artifactF})
     if !decisionF.allow                → throw DeniedInCommit(decisionF)
     if decisionF.decisionId ≠ expectedDecisionId
        or latestSeq(graphF) advanced past expectedGlobalSequence → throw Stale(STALE_FACT_GRAPH)
     fact = recordFact(operation, tx)
     idempotency.write(requestId, {factId, decisionId}, tx)   // atomic with the fact (outbox-style)
     return {fact, decisionF}
  )
  graphA = buildFactGraph(vc)                          // AFTER commit, includes the fact
  projection = project(spine, graphA)
  → COMMITTED { requestId, decision, committedFact, projection,
                committedGlobalSequence, projectedThroughGlobalSequence, contractVersions }
```

## 5. Response sequencing (proves the projection includes the committed fact)

The response carries **`committedGlobalSequence`** (the appended fact's sequence) and **`projectedThroughGlobalSequence`**
(the max sequence the post-commit graph observed). The client can verify `projectedThroughGlobalSequence ≥
committedGlobalSequence` — the projection provably reflects the committed fact.

## 6. Transport idempotency (distinct from reasoning identities)

`FactOperationRequest.requestId` is a **client-generated** transport identity (idempotency key). It is **not** a
substitute for `decisionId`/`evaluationId`/`projectionId`/`globalSequence` (which identify *reasoning*) — it solves
*transport retry duplication* (a lost response causing a re-send).

A **dedicated `ApiIdempotencyRecord`** (its own table — transport metadata does **not** live in the semantic
`PipelineFact.reason`) is written **atomically with the fact** inside the commit transaction:

```
ApiIdempotencyRecord { organizationId, requestId, requestDigest, factId, decisionId, originalResponse, responseDigest, createdAt }
@@unique(organizationId, requestId)
```

The **`originalResponse`** (the exact COMMITTED response, assembled inside the transaction so it includes the just-
appended fact) is stored. On retry (under the advisory lock): locate `(organizationId, requestId)`; if
`requestDigest` matches, **return the stored `originalResponse` verbatim** (never a rebuilt current view — the
projectionId/sequence boundaries are the originals); if it differs, **reject** (`IDEMPOTENCY_KEY_REUSE`) — the same
key must not be reused with a different payload. A retry **never** appends a second fact.

## 7. Coordinator purity

The Coordinator is **deterministic except for its explicitly operational dependencies** (the transaction, the clock
for an event timestamp, the requestId lookup). Its *decisions and translations* are fully delegated and reproducible
— it computes no business truth of its own (API-INV-1).

## 8. Error translation fidelity (no lossy translation)

Each `ApiError` preserves **`category` · `httpStatus` · `subsystemCode` · `subsystemOutcome`** and embeds the fresh
`AuthorizationDecision` AS-IS. E.g. `CONCURRENCY / 409 / STALE_FACT_GRAPH / {fresh decision}`. The API shapes
transport; the subsystem code keeps authority (API_ERROR_CONTRACT §3).

## 9. Acceptance (AC-API-*)

- **COMMITTED** — fact appended; post-commit projection reflects it; `projectedThroughGlobalSequence ≥
  committedGlobalSequence`.
- **DENIED** — deny codes → correct error categories; `AuthorizationDecision` embedded AS-IS.
- **STALE** — a fact appended between pre-check and commit ⇒ `STALE_FACT_GRAPH` / 409; **nothing appended**.
- **Transaction rollback** — force `recordFact` to fail after successful revalidation ⇒ no fact, no partial ledger
  state, no success response.
- **Concurrent competing commits** — two requests from the same expected state ⇒ **at most one** incompatible
  operation commits; the other gets a concurrency failure.
- **Transaction-context enforcement** — the test FAILS if the commit-path Builder/ledger uses the global client
  instead of the supplied `tx`.
- **Idempotent client retry** — the same `requestId` re-sent appends **no** second fact and returns the stored
  response.
- **Version stamps** + **API-INV-1 delegation** (Coordinator holds no predicate/authz truth).

## 10. Boundaries / traceability

No business logic (API-INV-1). No pre-commit side effects (API-INV-3). No reinterpretation of embedded contract
objects. `Coordinator → this design → API/Error Contracts + E1/FactGraph/Evaluation/Authorization/Projection
contracts → Decision Log`. HTTP routes are thin adapters over the Coordinator (acceptance targets the Coordinator).

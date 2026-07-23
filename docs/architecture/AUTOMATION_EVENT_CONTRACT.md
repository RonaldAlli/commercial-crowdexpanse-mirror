# AutomationEvent — Public Contract **v1.0** (FROZEN, pre-E8)

> **What this freezes:** the input to Automation (E8) — an **immutable event derived from committed state**, not
> mutable runtime observation. Automation is the first subsystem that *reacts*; it must react to canonical events,
> never to in-flight state. Frozen before E8, like every layer. Consumes the frozen `FactOperationResponse`
> ([API](./API_CONTRACT.md)) — `fact` (E1) + `decision` (E3) + `projection` (E4) + `contractVersions`. 2026-07-23.
>
> **⚠ Runtime gate (D27).** This contract + the **deterministic Automation Rule engine** are buildable now. The
> Automation **runtime** (out-of-request executor / scheduler) is gated on **D27** (the pm2/SIGINT investigation,
> still queued): the scheduler stays **OFF**, and **no prod-supervision changes** are made under this contract. E8
> delivers the rule engine; execution runtime is deferred until D27 resolves.

---

## 1. Invariants (AUTO-INV)

- **AUTO-INV-1 · Automation is event-driven.** Automation reacts **only** to **committed** facts, **committed**
  projections, and **committed** authorization outcomes — **never** to intermediate evaluation, transient UI state,
  or in-flight transactions. `Facts → Events → Automation`.
- **AUTO-INV-2 · Rule vs execution separation.** An **AutomationRule** is a **pure, deterministic** predicate over
  an `AutomationEvent` (same event ⇒ same decision). An **AutomationExecution** is the operational act of running the
  resulting action — separate, and (per the runtime gate) D27-gated. Mirrors Evaluation≠execution, Authorization≠
  commit, Migration Plan≠Execution.
- **AUTO-INV-3 · Events are immutable and derived.** An `AutomationEvent` is a disposable, reconstructable derivation
  of committed state (Law 4) — it is emitted **after** commit (or via the E6 outbox written atomically with the
  fact, API-INV-3); it is never a source of truth. `eventId` is a **deterministic identity** (content address of the
  committed state), so event processing is idempotent.

## 2. `AutomationEvent` (v1.0)

Every automation begins from the same canonical object:

```
AutomationEvent = {
  eventId:          string,               // deterministic identity = H(factId, decisionId, projectionId) — idempotent
  source:           string,               // where it originated (e.g. "fact-operation")
  organizationId:   string,
  opportunityId:    string,
  fact:             { id, factChainId, factType, globalSequence, provenance },  // the committed fact (E1) — AS-IS
  decision:         AuthorizationDecision, // the committed authorization outcome (E3) — AS-IS
  projection:       ProjectionResult,      // the committed post-commit projection (E4) — AS-IS
  contractVersions: ContractVersions,
}
```

All embedded contract objects are **AS-IS** (no reinterpretation — mirrors AUTH-INV-13 / PR-INV-7 / UI-INV-5). The
event is the *only* thing an AutomationRule may read (AUTO-INV-1) — it never queries the ledger, rebuilds a graph,
evaluates a predicate, authorizes, or projects (those already happened; the event carries their results).

## 3. Rule vs execution (the E8 shape, design-first)

```
AutomationEvent → AutomationRule (pure) → AutomationDecision → [ D27-gated ] AutomationExecution
```

- **AutomationRule** — `(event) → AutomationDecision { ruleId, ruleVersion, matched, action?, reasons[] }`. Pure,
  deterministic, versioned (like every rule-set in the platform). No side effects.
- **AutomationExecution** — runs `action` out-of-request. **Deferred to the D27-gated runtime**; the rule engine is
  fully testable without it.

## 4. Boundaries / traceability

Automation reads only `AutomationEvent`s (AUTO-INV-1); rules are pure (AUTO-INV-2); events are immutable/derived
(AUTO-INV-3). No prod-supervision change, scheduler OFF (D27 gate). `AutomationEvent → this contract → API
`FactOperationResponse` + E1/E3/E4 contracts → Decision Log`. Execution runtime → D27.

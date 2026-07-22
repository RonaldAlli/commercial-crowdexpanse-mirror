# EvaluationResult — Public Contract **v1.0** (FROZEN)

> **What this freezes:** the *output* of the single Predicate Engine (E2 · Slice B). Authorization (E3),
> Projection (E4), Automation (E8), what-if, and the acceptance suite all consume `EvaluationResult`, so its shape
> is a foundational contract — frozen now, exactly as the E1 ledger API and the Fact Graph API were, to prevent
> subtle divergence later. Frozen 2026-07-22 at `opp-slice2-e2b-complete` (`f3eaefa`). Module:
> `lib/pipeline-predicates`. Governed by Constitution Law 6/13; design in
> [Predicate Engine Design](./PREDICATE_ENGINE_DESIGN.md).
>
> **Change discipline:** identical to the other frozen APIs — `Code → Architecture → Specification → Business
> Decision`. Breaking change ⇒ major bump (v2.0) + decision process; additive/backward-compatible ⇒ minor (v1.1).

---

## 1. `EvaluationResult` (v1.0 — frozen)

```
EvaluationResult = {
  evaluationId:     string,                 // deterministic IDENTITY of an evaluation (see §2)
  predicateId:      string,
  satisfied:        boolean,
  policyVersion:    string,
  ruleSetVersion:   string,
  determinismStamp: { graphVersionContext: VersionContext, predicateVersion: string },
  reasons:          { code: string, detail?: string }[],   // structured, explainable
  factsRelied:      string[],               // fact ids consulted (traceability)
  missing:          string[],               // unmet requirements (fail-closed detail)
}
```

Consumers may rely on: **fail-closed** (`satisfied:false` with a reason on unknown/erroring predicate — the
evaluator never throws to the caller); **deterministic** (same inputs ⇒ identical result); **explainable**
(`reasons`/`missing`/`factsRelied` justify the verdict); **graph-derived only** (no ledger reads, Law 13).

## 2. `evaluationId` is an IDENTITY, not an execution id (ratified clarification)

`evaluationId = H(predicateId, ruleSetVersion, policyVersion, graphFingerprint)` — a **deterministic identity of an
evaluation**, *not* an execution/run identifier. Consequences a consumer may depend on:

- `evaluate(X)` always yields the same `evaluationId` — it is `H(X)`, not a per-run token. This is what preserves
  **PE-INV-2** (referential transparency): two evaluations of identical inputs are indistinguishable, `evaluationId`
  included.
- Therefore `evaluationId` is a **content address** for "this evaluation of these inputs." Comparing two results by
  `evaluationId` answers *"were these the same evaluation?"* — not *"were these two separate executions?"* The
  platform never needs an execution id here; if one is ever required (e.g. audit of *when* an evaluation ran), it
  belongs **outside** the evaluator, alongside the caller, never inside the deterministic result.

## 3. Predicate closure (PE-INV-5) is part of the guarantee

Because every predicate dependency is a **registered** predicate resolved through the evaluator (no arbitrary code,
plugins, dynamic imports, reflection, or external services — PE-INV-5), an `EvaluationResult` is the product of a
fully-enumerable, statically-analyzable reasoning closure. A consumer can trust that no hidden dependency or side
channel influenced `satisfied`.

## 4. `EvaluationTrace` — proposed companion concept (v1.1, awaiting your ratification)

You recommended an immutable **`EvaluationTrace`** alongside the result, capturing *logical reasoning* (not timing,
not performance). Proposed shape:

```
EvaluationTrace = {
  root: TraceNode,          // the predicate call tree, in evaluation order
}
TraceNode = {
  predicateId: string,
  satisfied:   boolean,
  factsExamined: string[],  // fact ids the predicate consulted
  missing:     string[],
  children:    TraceNode[], // sub-predicates invoked via ctx.evaluate, in order
}
```

It records: the **predicate call tree**, **evaluation order**, **facts examined**, and **intermediate predicate
results** — invaluable for debugging composed predicates (e.g. why `TRANSACTION_CLOSED.THIRD_PARTY_FINANCED` failed
through its `CASH` core). It stays **deterministic** (a pure function of the same inputs, so PE-INV-2 extends to the
trace) and **logical only** (no clocks/durations). It would ship as evaluator **v1.1**: the evaluator threads a
trace accumulator through `context.evaluate`, and returns `{ result, trace }` (or `result.trace?`), additively.

**Decision for you:** implement `EvaluationTrace` now as evaluator v1.1 **before E3**, or **freeze v1.0 as-is and
proceed to E3**, adding the trace when a consumer first needs it. I recommend implementing it now — it is cheap
while the evaluator is small, and E3/E4 debugging benefits immediately — but it is genuinely optional and I'll hold
until you rule.

## 5. Out of scope

The result carries no stage, no authorization decision, no inconsistency, and no execution/timing metadata. Those
belong to the consumer epics (E3/E4) or outside the evaluator entirely.

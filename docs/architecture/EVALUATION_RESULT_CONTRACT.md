# EvaluationResult / EvaluationArtifact — Public Contract (FROZEN · **result v1.0 + artifact v1.1**)

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

## 4. `EvaluationArtifact` — the single output object (v1.1, RATIFIED + implemented)

The evaluator's canonical output is **one object**: `evaluateArtifact(predicateId, input) → EvaluationArtifact`.
`EvaluationResult` v1.0 is unchanged — it is exactly `artifact.result`; consumers that don't need the trace ignore
it. (`EvaluationArtifact` is unrelated to the GI-3 ARTIFACT fact class — it is evaluator output.)

```
EvaluationArtifact = { result: EvaluationResult, trace: EvaluationTrace }
EvaluationTrace    = { root: TraceNode }
TraceNode = {
  predicateId: string,
  satisfied:   boolean,
  reasons:     { code, detail? }[],
  factsRelied: string[],   // facts examined (logical)
  missing:     string[],
  children:    TraceNode[], // sub-predicates invoked via ctx.evaluate, in evaluation order
}
```

The trace records **only logical reasoning** — predicate call tree, evaluation order, facts examined, intermediate
results. It contains **no** timestamps, durations, host/process data, random ids, or query details; those would make
it operational rather than semantic and could break referential transparency. Governing invariants:

- **PE-INV-6 · Trace determinism** — `evaluateArtifact(X)` yields an identical `{ result, trace }` every time for
  identical inputs; the trace is part of the deterministic contract.
- **PE-INV-7 · Trace completeness** — every reason in the result appears in the trace tree; no unexplained verdicts.
- **PE-INV-8 · Trace locality** — every node explains only its own predicate + its immediate children; no node
  summarizes, hoists, or reinterprets another subtree (grandchildren stay under their parent).
- **PE-INV-9 · Acyclic trace** — the trace is a finite tree; recursion always terminates. A predicate already on the
  evaluation path fails closed (`CYCLE_DETECTED`) rather than re-entering, so no cyclic rule-set can loop forever.
- **PE-INV-10 · Evaluation path locality** — the cycle-detection path lives only within one evaluation (a threaded
  parameter starting `[]`); no cached/thread-local/global state carries between evaluations, so they are fully
  independent.
- **The trace EXPLAINS the result** (explanatory); the **result is authoritative** — never the reverse.

**Navigation (deferred to v1.2).** Trace nodes are **pure, serializable, immutable data** now. An ergonomic
accessor surface (`self` / `children` / `flatten` / `find(predicateId)`) is defined for when visualization (E7)
needs it; it will wrap the data without changing it, so nodes stay pure. Consumers today traverse `root.children`
directly.

> **Status:** with PE-INV-8, the evaluator output is **FINAL** — `EvaluationResult` v1.0 + `EvaluationArtifact`
> v1.1. E3 and all downstream consumers build against this finalized contract.

**Traces are derived, disposable, and never persisted as business truth.** They are a pure function of
`Ledger → FactGraph → Predicate Engine` and can always be regenerated (Constitution Law 4). Persisting a trace as
an authoritative record would violate the architecture. Future consumers attach a trace to their own output for
explainability — Authorization: `ALLOW/DENY + trace`; Projection: `Stage + trace`; Automation: `decision + trace` —
all sharing this one deterministic reasoning chain, none inventing their own.

## 5. Out of scope

The result carries no stage, no authorization decision, no inconsistency, and no execution/timing metadata. Those
belong to the consumer epics (E3/E4) or outside the evaluator entirely.

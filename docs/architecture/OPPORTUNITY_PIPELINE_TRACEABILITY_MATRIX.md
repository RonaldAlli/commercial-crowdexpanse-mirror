# Opportunity Pipeline — Architecture Traceability Matrix (Phase 3 closeout)

> **Closes the loop:** `Decision → Specification → Architecture → Acceptance → Implementation`. Every governing
> requirement traces to the Spec clause that states it, the derived architecture artifact(s) that realize it, and
> the acceptance scenario IDs that verify it. **Every future implementation artifact MUST trace back through this
> matrix to a governing business decision.** 2026-07-22.
>
> Artifacts: **SPEC** = [Business Semantics Specification](./BUSINESS_SEMANTICS_SPECIFICATION.md) ·
> **STM** = [State-Transition Model](./OPPORTUNITY_PIPELINE_STATE_TRANSITION_MODEL.md) ·
> **AUTH** = [Authorization Model](./OPPORTUNITY_PIPELINE_AUTHORIZATION_MODEL.md) ·
> **ACC** = [Acceptance Suite](./OPPORTUNITY_PIPELINE_ACCEPTANCE_SUITE.md) ·
> **LOG** = [Decision Log](../releases/OPPORTUNITY_PIPELINE_SLICE2_DECISION_LOG.md) (decision record).

---

## Governing requirements

| Requirement | Decision (LOG) | Spec § | Derived architecture | Acceptance coverage |
|---|---|---|---|---|
| **GI-1** append-only | OPP-3 A | §1 | STM (correction/retraction §5d/5c), AUTH (§5, §10) | AC-GI1-* |
| **GI-2** deterministic-evaluator | OPP-3 A | §1 | AUTH (evaluator actor §4, §7), STM (§5f) | AC-GI2-* |
| **GI-3** fact-class taxonomy | OPP-3 A | §1 | AUTH (capability×class §3), STM (classes) | AC-GI3-* |
| **OWN-1** stage = projection | OWN-1 | §0 | STM (projection §3, four-layer §1) | AC-OWN1-* , AC-STM*-* |
| **OWN-2** fact families | D1/1A/1B/1C · 2.1/2A/2B/2C · 3.1/3A/3B · 4.1/4A/4B · 5.1/5A/5B/5C | §2 | AUTH (authority per family), STM (facts) | AC-D1/21/31/41/51-*, AC-*A-* |
| **OWN-3** configured closing policy | OWN-3.0/3.1/3.2/3.3 | §4 | **Policy engine** (predicate per archetype; single evaluator AUTH §11b) | AC-OWN3-*, AC-5A/5B-* |
| **OWN-4** stage enumeration | OWN-4 | §5 | STM (**projection** precedence §3, spine §2) | AC-OWN4-*, AC-OWN1-5-* |
| **OPP-3** guard policy | OPP-3 C | §6 | **Guard model** (STM §5c/§6, transition-result) | AC-OPP31-*, AC-OPP32-* |
| **Authority / fact-lifecycle model** | OPP-3 B | §3 | AUTH (whole document) | AC-AUTH*-* |
| **Hierarchy of Authority** | (Spec) | Hierarchy §| all (lower refines, never redefines) | (structural — enforced by every N-scenario) |

## Derived architecture invariants → source

| Derived invariant | Realizes | Verified by |
|---|---|---|
| STM-INV-1…8 | OWN-1, OPP-3, GI-1 | AC-STM*-*, AC-OWN1-* |
| AUTH-INV-1…11 | Spec §3, GI-1/2/3, OWN-1 INV-4/7 | AC-AUTH*-* |
| Single predicate evaluator (AUTH §11b) | OWN-1 INV-7 · GI-2(e) · AUTH-INV-10 | AC (all — run through it by construction) |
| DENY taxonomy (AUTH §11a) | AUTH result contract | AC (each asserts the exact code) |

## Open realization questions (carried into implementation planning)

Not requirements — **how-to-build** questions, scheduled by decision timing (STM §9a):
- **Before schema/API:** A-1 persistence/supersession · A-4 predicate-as-data · A-6 collection facts · A-8
  concurrency · A-10 legacy backfill (three-outcome rule, STM §9c) · AZ-1 capability→role storage · AZ-4 non-human
  principal identity.
- **Before runtime:** A-2 materialization · A-3 recompute execution · A-5 evaluator runtime · A-7 what-if
  projection · AZ-2 authorization invocation point.
- **Deferable:** A-9 inconsistency-computation shape · DENY-code presentation.
- **Resolved as constraints:** AZ-3 (single evaluator) · AZ-5 (frozen DENY taxonomy).

---

## Phase status

| Phase | Status |
|---|---|
| 1 · Decision | ✅ complete |
| 2 · Workflow Freeze (Specification) | ✅ complete · conformance gate ✅ PASS |
| **3 · Architecture & Acceptance** | ✅ **complete** — 3.1 STM · 3.2 AUTH · 3.3 Acceptance Suite · Traceability Matrix |
| 4 · Implementation | **not started** — begins only under explicit authorization, as **derivation** (each code/schema/API/UI/migration/test artifact traces through this matrix to a governing decision) |

> **The loop is closed.** No implementation artifact may exist without a traceable line back to a frozen business
> decision. Phase 4 introduces **no new behavior** — it realizes what is already specified, authorized, and
> acceptance-defined.

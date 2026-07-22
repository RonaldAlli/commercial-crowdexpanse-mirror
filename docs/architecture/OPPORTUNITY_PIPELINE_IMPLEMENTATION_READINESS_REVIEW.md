# Opportunity Pipeline — Implementation Readiness Review (Phase 3 → 4 gate)

> **Checkpoint, not a design phase.** Sole question: *can multiple engineers independently build the system from
> these artifacts and produce behavior that passes the same acceptance suite?* If yes, the architecture is mature
> enough for implementation. Reviewed 2026-07-22. **Result: ✅ READY** (one pre-kickoff action: assign owners to
> the open realization questions). Phase 4 (code) remains **gated on explicit authorization**.

Artifacts under review: [Spec](./BUSINESS_SEMANTICS_SPECIFICATION.md) · [Conformance](./BUSINESS_SEMANTICS_CONFORMANCE_REVIEW.md)
· [STM](./OPPORTUNITY_PIPELINE_STATE_TRANSITION_MODEL.md) · [AUTH](./OPPORTUNITY_PIPELINE_AUTHORIZATION_MODEL.md)
· [Acceptance](./OPPORTUNITY_PIPELINE_ACCEPTANCE_SUITE.md) · [Traceability](./OPPORTUNITY_PIPELINE_TRACEABILITY_MATRIX.md).

---

## 1. Readiness checklist

| # | Criterion | Verdict | Evidence / action |
|---|---|---|---|
| 1 | Every unresolved architecture question has an owner + planned resolution timing | ⚠️ **partial** | Timing classified (STM §9a; AUTH §13). **Owners not yet assigned** → the one pre-kickoff action (below). |
| 2 | Every implementation work item traces to the Traceability Matrix | ✅ | The slice plan (§2) maps every slice → matrix entries; the PR rule (§3) enforces it per change. |
| 3 | No implementation task requires reopening a semantic decision | ✅ | All open items are `A-*`/`AZ-*` **how-to-build** questions; the Conformance Review confirmed no semantic leakage. |
| 4 | Acceptance scenarios exist for every governing invariant | ✅ | Acceptance Suite coverage matrix (§F) enumerates every invariant group → P/N/R/M scenario IDs + exhaustiveness rule. |
| 5 | Migration strategy defined before schema work | ✅ | Strategy frozen: legacy-backfill **three-outcome rule** (STM §9c) + **migration principal** (AUTH §4, AUTH-INV-9). Detailed plan = slice 5, sequenced before API/UI. |
| 6 | Backlog organized by architectural slices, not UI screens | ✅ | §2 — slices by dependency, UI is slice 7 (a consumer), not the organizing axis. |

**Overall: READY.** The only gap (#1) is administrative — resolution *timing* is set; *ownership* is assigned at
Phase-4 planning kickoff. No conceptual work remains.

---

## 2. Phase-4 architectural slices (by dependency, not by feature)

Each slice depends only on stable contracts beneath it — minimizing rework.

| # | Slice | Realizes (Spec/artifact) | Resolves open Q | Acceptance |
|---|---|---|---|---|
| **1** | **Core Fact Infrastructure** — append-only persistence · supersession · versioning · audit | GI-1 · fact ontology (§2) | A-1 · A-6 · A-8 | AC-GI1-* |
| **2** | **Predicate Engine** — the **single** side-effect-free evaluator · policy execution · projection · what-if | GI-2 · OWN-3 predicates (§4) · projection (§5) | A-2 · A-4 · A-7 · AZ-3✅ | AC-GI2-*, AC-OWN1-*, AC-5A/5B-* |
| **3** | **Authorization Engine** — capability eval · preconditions · commit-time validation · stable DENY codes | AUTH (whole) | AZ-1 · AZ-2 · AZ-4 · AZ-5✅ | AC-AUTH*-* |
| **4** | **Projection Engine** — stage projection · operational attention · inconsistency computation | OWN-1 · OWN-4 · STM · guard (§6) | A-3 · A-9 | AC-OWN1-*, AC-STM*-*, AC-OPP3*-* |
| **5** | **Migration Framework** — legacy reconstruction · migration principal · provenance | STM §9c · AUTH-INV-9 | A-10 | AC-*-M* |
| **6** | **API Layer** — authorization result + transition-result contracts | AUTH §11 · STM §6 | — | AC (contract-shape) |
| **7** | **UI Layer** — projection display · operational attention · guard confirmations | §5 · §6 | DENY-code presentation | AC-OPP31-* |
| **8** | **Automation** — GI-2 deterministic-evaluator runtime + hooks | GI-2 · §4 | A-5 | AC-GI2-* |

**Cross-track dependency:** slice 8 (Automation) uses a GI-2 deterministic evaluator running out-of-request — its
runtime depends on the separately-tracked automation-process health (**D27**, the pm2/SIGINT investigation, still
queued). Automation is deliberately last and MUST NOT gate slices 1–7.

---

## 3. Implementation principle (engineering rule for Phase 4)

**Every pull request MUST cite the Traceability Matrix entry (and thereby the acceptance IDs) it implements.** A
change is never justified by "this seems useful" — it points back through the chain:
```
Code → Architecture Artifact → Specification → Business Decision
```
Corollary: **any genuinely new semantic requirement triggers a deliberate return to the decision process** (a new
OWN/OPP decision in the Decision Log → Spec update → re-derivation), never an ad-hoc code change. The Hierarchy of
Authority is enforced at the PR boundary.

---

## 4. Pre-kickoff action (the only open item)

- **Assign an owner** to each open realization question, grouped by resolution timing:
  - *Before schema/API:* A-1, A-4, A-6, A-8, A-10, AZ-1, AZ-4
  - *Before runtime:* A-2, A-3, A-5, A-7, AZ-2
  - *Deferable:* A-9 (+ DENY-code presentation)

Once owners are assigned, Phase 4 may begin **slice 1**, under explicit authorization, as derivation.

---

## 5. Verdict

The architecture has a complete lineage — **Business Decisions → Specification → Conformance → State-Transition →
Authorization → Acceptance → Traceability → (Implementation)** — with each layer deriving from, never redefining,
the one above. The remaining work is **engineering, not conceptual design**: faithfully realizing the frozen
contracts, slice by slice, every change traceable to intent. **Ready for Phase 4 on authorization.**

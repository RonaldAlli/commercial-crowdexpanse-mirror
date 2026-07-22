# Business Semantics Specification — Conformance Review

> **Checkpoint between Phase 2 (Workflow Freeze) and Phase 3 (Architecture).** NOT a decision phase. Sole question:
> *does the [Specification](./BUSINESS_SEMANTICS_SPECIFICATION.md) satisfy its own invariants and stay free of
> implementation leakage?* If it passes, Phase 3 begins as **derivation**, not design. Reviewed 2026-07-22.
> **Result: ✅ PASS** (two clarifications surfaced and applied; no blocking findings).

---

## Checklist

| # | Check | Verdict | Evidence |
|---|---|---|---|
| 1 | Every projected stage maps to exactly one decision fact | ✅ (w/ C-1) | `UNDERWRITTEN←UNDERWRITING_APPROVED`, `BUYER_MATCHED←BUYER_MATCHED`, `LOI_ACCEPTED←LOI_ACCEPTED`, `UNDER_CONTRACT←CONTRACT_EXECUTED`, `CLEAR_TO_CLOSE←CLEAR_TO_CLOSE`, `PAID←TRANSACTION_CLOSED` — each exactly one (`OWN4-INV-1`). `LEAD` = base case → **C-1**. |
| 2 | Every decision fact has an authority model | ✅ (w/ C-2) | `DILIGENCE_COMPLETE`/`BUYER_MATCHED`/`LOI_ACCEPTED`/`CONTRACT_EXECUTED`/`TRANSACTION_CLOSED` = 1A/2A/3A/4A/5A. `CLEAR_TO_CLOSE` + `UNDERWRITING_APPROVED` = fact-lifecycle model **by reference** → **C-2**. |
| 3 | Every authority model references GI-1/2/3 correctly | ✅ | Fact-lifecycle model (§3): append-only=GI-1, capability-by-class=GI-3, deterministic principals=GI-2. |
| 4 | Every deterministic evaluator conforms to GI-2 | ✅ | 1B/2B/3B/4B/5B each reference GI-2 (opt-in · machine-evaluable · reproducible · no-machine-waiver · fail-closed · observational · judgment-may-not-assert). |
| 5 | Every archetype predicate uses only ontology-defined facts | ✅ | Cash/Financed/Assignment predicates use `CONTRACT_EXECUTED`, `CONTINGENCY_REMOVED`, `SETTLEMENT_COMPLETED`, `FUNDS_DISBURSED{purpose}`, `FINANCING`, `ASSIGNMENT_EXECUTED` — all in the ontology (§2.5). No invented facts (`OWN3-INV-2`). |
| 6 | Every exception belongs only to the decision layer | ✅ | `ACCEPT_*_EXCEPTION` scoped to decision-layer/org-policy; never substitutes for evidence (`GI-3`, `4A-INV-2`, `5A-INV-3`). |
| 7 | No implementation concepts leaked into the specification | ✅ (w/ note) | Spec states facts/policies/predicates/projections — implementation-independent. §7 is explicitly *constraints impl must satisfy, not designs*. V1.3/V1.4 references name existing **authoritative** concepts (ontology grounding), not implementations. See **Note**. |

---

## Findings (surfaced + resolved — not blocking)

- **C-1 · `LEAD` vs. `OWN4-INV-1`.** `LEAD` is not backed by a decision fact, which read literally against
  "every projected stage maps to exactly one decision fact" looked like a gap. **Resolution:** `LEAD` is the
  **entry/base projection** — the value of the *total* projection (`OWN-1 INV-3`) when no decision fact yet holds;
  `OWN4-INV-1` governs the **decision-backed** stages. Spec §5 amended to state this explicitly. *Consistent.*
- **C-2 · `CLEAR_TO_CLOSE` / `UNDERWRITTEN` authority by reference.** These decision facts inherit their authority
  and deterministic-eval from the consolidated fact-lifecycle model + GI-2 rather than a dedicated per-family
  section (`UNDERWRITING_APPROVED` reuses the existing V1.3 authority). **Resolution:** legitimate — the
  fact-lifecycle model exists precisely so decision facts reference one authority model (OPP-3 Part B); Spec §5
  now states the reference explicitly. *Consistent.*

## Note (not a finding)

**§7 Implementation Constraints** deliberately sits at the Specification↔Architecture boundary. Terms like
"persistence layer," "cache," "code path" appear **only** as *constraints a compliant implementation must satisfy*
(e.g. "stages MUST be recomputable from facts"), never as prescribed designs. This is the intended purpose of that
section and is consistent with the Hierarchy of Authority (higher layer constrains lower). No semantic leakage.

---

## Conclusion

The Specification is **internally consistent** and **free of implementation leakage**. The two clarifications (C-1,
C-2) were applied to the Specification; neither changed a business decision. **Phase 3 (Architecture & Acceptance)
is authorized to begin as a disciplined derivation** — each Phase-3 artifact citing the Specification section(s) it
realizes, introducing **no** new business rule:

| Phase-3 artifact | Derived from (Spec §) |
|---|---|
| State-transition model | Projection model (§5) + fact families (§2) |
| Authorization model | Authority model (§3) |
| Automation model | GI-2 (§1) + authority model (§3) |
| Database schema | Fact ontology (§2) |
| API contracts | Authority model (§3) + ontology (§2) |
| UI behavior | Projection model (§5) + guard model (§6) |
| Acceptance criteria | Invariants (all §) |
| Regression suite | Acceptance criteria |

*Gate: Phase 3 begins only under explicit authorization. It answers "how do we faithfully realize this
specification," never "what should the workflow mean."*

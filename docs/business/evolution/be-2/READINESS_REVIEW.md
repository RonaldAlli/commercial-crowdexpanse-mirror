# BE-2 Step 1 — Implementation-Readiness Review (summary)

> Full read-only review conducted pre-implementation (3 repository-inspection passes). Verdict below;
> the conditions and their resolution are what this record preserves.

**Verdict: READY WITH CONDITIONS.**

## Key findings
- **Canonical control fact exists:** `CONTRACT_EXECUTED` (DECISION) projects `UNDER_CONTRACT`, carries
  org/opportunity/actor/timestamps/provenance, emitted through one path (`recordFact`). = "Deal Controlled" (D-1).
- **Fact layer is not idempotent** (`pipeline_facts` has no unique key) → enforce exactly-once at the
  **Deal layer** (`opportunityId @unique` + `ensureDeal` P2002).
- **Three distinctions:** Owner≠Seller ✅ distinct in code; Opportunity≠Deal ❌ (no Deal object — this
  initiative); Transaction≠Deal ❌ (→ BE-5).
- **Escalation 1 — control fact not emitted in prod** (pipeline dormant) → Step 1 ships **inert**.
- **Escalation 2 — BE-2 plan vs BE-5** on who owns execution records → resolved by **D-2** (Transaction).

## Conditions and resolution
| # | Condition | Status |
|---|---|---|
| 1 | Architecture merge gate closed (v1.0 on main) | ✅ M1, merge `8b73426` |
| 2 | `CONTRACT_EXECUTED` = "Deal Controlled" (no new event) | ✅ D-1 |
| 3 | One Deal per Opportunity; re-contracting → v1.1 | ✅ D-3 / O-1 |
| 4 | Deal↔Transaction boundary settled before re-parenting | ✅ D-2 (BE-2 re-parents nothing) |
| 5 | Exactly-once at the Deal layer | ✅ `opportunityId @unique` + P2002 |
| 6 | Step 1 ships inert; emission decision is separate | ✅ acknowledged (O-2) |
| 7 | Defer backfill | ✅ D-4 |
| 8 | Migration as a separate gated step (backup → deploy) | ✅ authored + validated on `_test`; prod application deferred |

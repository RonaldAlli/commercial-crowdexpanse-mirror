# Revenue Workspace — Milestone 1 — Increment 2 — Acceptance Record

> **Status: ACCEPTED WITH OBSERVATIONS** (founder-accepted 2026-08-01). Accepts Increment 2 "Revenue Deal List"
> (PR #95, merged to `main` `487e4c9`). Read-only listing of the existing realized-revenue authority; no schema /
> API / new calculations / accounting. Context: `UI_REVENUE_WORKSPACE_M1_INCREMENT1_ACCEPTANCE.md`,
> [[crowdexpanse-cre-workspace]], [[engineering-bi-rule-1]].

## Recorded

1. **Revenue Deal List implemented** — org-level list of realized revenue events (one row per EXECUTED
   assignment): deal, execution date, channel, campaign, realized amount.
2. **BI ownership preserved** — `realizedRevenueEvents` lists the same authoritative executed-assignment
   population as the grouped queries; no duplicate business logic, no new metric.
3. **Revenue Evidence preserved** — each row is traceable to its Opportunity.
4. **Revenue Traceability added** (new contract, below).
5. **Opportunity Workspace linkage approved** — each revenue row links to `/opportunity-workspace/[id]` (making
   Revenue Evidence actionable; consistent with the Operator Entry Principle, not a scope expansion).
6. **No schema authority changed. No API authority changed. No new calculations. No accounting authority.**

## Carry-forward — Revenue Traceability (new financial platform contract)

**Every realized revenue value displayed in the UI must let the operator navigate to the business object that
produced it.** Revenue is never an isolated number; the evidence chain always remains navigable:

Revenue → Assignment → Opportunity.

Complements **Revenue Evidence** (provenance) by emphasizing **navigation**. Together: an operator can always see
*why* a revenue figure exists AND move to the object that produced it.

## Next governed phase

**Increment 3 — Per-deal Revenue section (inside the Opportunity Workspace) — APPROVED TO IMPLEMENT.** Clearly
separate Projected / Expected / Realized (Financial Truthfulness); add the evidence-based Revenue Timeline from
existing pipeline facts (no synthesized events); preserve Revenue Evidence + Revenue Traceability. Reuse existing
authority only — no forecasting / invoices / payment reconciliation / commissions beyond assignment / accounting /
partner distributions. Stop for review before any merge or release activity.

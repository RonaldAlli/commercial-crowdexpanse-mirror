# Revenue Workspace — Milestone 1 (Realized Revenue) — Planning Acceptance Record

> **Status: PLANNING ACCEPTED WITH OBSERVATIONS** (founder-accepted 2026-07-31). Accepts
> `UI_REVENUE_WORKSPACE_MILESTONE_1_PLAN.md`. **Implementation authorized increment-by-increment; Increment 1
> only** (see below). Context: [[crowdexpanse-cre-workspace]], [[engineering-bi-rule-1]].

## Rulings

- **Route / placement APPROVED** — `/revenue` = the org-level executive Revenue Workspace ("how much revenue has
  the business actually earned?"). **Do NOT create `/revenue/[opportunityId]`** — per-deal revenue is a **section
  inside the Opportunity Workspace** (one primary landing page per Opportunity, Operator Entry Principle).
- **Four-increment sequence APPROVED:** (1) Executive Summary (org-level) → (2) Revenue Deal List (every realized
  revenue event: which deals, how much, when, which source) → (3) Per-deal Revenue inside the Opportunity
  Workspace (Projected/Expected/Realized separated, Revenue Timeline, execution date, settlement status, no
  calculations) → (4) Integration · Discoverability · Accessibility · Responsive · Workflow continuity.

## Accepted refinements

- **Revenue Health card** (Executive Summary, first): answer the operator's first question immediately —
  Realized / Expected / Projected each shown with a **distinct visual treatment** and a confidence indication, so
  the three are never confused. Progression Projected → Expected → Realized.
- **Revenue Timeline stays evidence-based:** Projected Revenue → Contract Executed → Assignment Executed →
  Settlement Completed → Revenue Realized — sourced only from existing pipeline facts; **no synthesized events.**

## New platform contract — Financial Truthfulness

**Financial information must always communicate which kind of financial truth is being presented.** Projected,
Expected, and Realized must never appear as interchangeable values; every financial number in the UI clearly
indicates its category. Joins the platform contracts (Executive Summary · Information Quality · Decision
Chronology · Workspace Progression · Workspace Discoverability · Operator Entry Principle · Workflow Intent
Preservation · Explicit Intent Navigation).

> **Implementation note (Financial Truthfulness applied to Increment 1):** the BI layer authoritatively aggregates
> **Realized** only (executed assignment fees, all-time — the same population the Command Center already totals via
> `revenueAllTimeView`). There is **no** org-level authority that aggregates Expected or Projected. Therefore the
> Revenue Health card shows Realized as the authoritative headline, and presents Expected/Projected as **per-deal
> truths not aggregated at the organization level in Milestone 1** — honestly, never as fabricated org totals.
> Org-level Expected/Projected aggregation would be a new backend decision (deferred).

## Recorded

`/revenue` approved · per-deal revenue belongs in the Opportunity Workspace · four-increment implementation
approved · Revenue Health added to the Executive Summary · Revenue Timeline remains evidence-based · Financial
Truthfulness added as a platform contract · No schema · No API · No new calculations · No generalized accounting.

## Authorization

**Increment 1 — APPROVED TO IMPLEMENT:** the organization-level Executive Summary only. Reuse only existing BI
authority; no deal-level work; no Opportunity Workspace integration; no new calculations. **Stop after Increment 1
for review.**

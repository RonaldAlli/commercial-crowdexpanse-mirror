# Revenue Workspace — Milestone 1 (Realized Revenue) — PLAN

> **Status: PLAN — AWAITING REVIEW. No implementation, no merge, no deployment.** Governed decision: *Revenue
> Workspace — Milestone 1 (Realized Revenue) — APPROVED TO PLAN.* Built entirely over **proven** authority (see
> the accepted `UI_REVENUE_WORKSPACE_BACKEND_CAPABILITY_AUDIT.md`); a read-only façade — **no schema, no API, no
> new calculations, no new authority.** Baseline: `main 94801e2`. Context:
> `..._AUDIT_ACCEPTANCE.md`, [[crowdexpanse-cre-workspace]], [[engineering-bi-rule-1]].

## 1. Objective

Answer one question: **"What revenue has actually been earned?"** — realized revenue only. Not *what might we
earn?* (projected) and not *what should we invoice?* (accounting). Everything reuses existing authority.

## 2. Governing contract — three separated revenue concepts (never combined)

| Concept | Meaning | Origin | Authority reused | Role in M1 |
|---|---|---|---|---|
| **Projected** | Estimate | Guided Underwriting | `ScenarioLineItem.spreadUsd`, `FinancingCaseResult.*` (LOCKED scenario) | shown only as a clearly-labeled *contrast* link; never summed into revenue |
| **Expected** | Contracted, expected at closing | Closing | `Opportunity.assignmentFeeUsd` (AS-3) | shown per deal for contrast with realized; never counted as earned |
| **Realized** | Actually received | Settlement | `AssignmentRecord.executedFeeUsdSnapshot` WHERE status=EXECUTED (BI Rule 1) | **the answer** — the only figure M1 totals/aggregates |

The workspace labels each by intent (Information Quality · Explicit Intent Navigation) and keeps them visually and
semantically distinct. **Realized is the only figure aggregated into "revenue earned."**

## 3. Authority reuse map (no new backend)

- **Realized totals + intelligence** — `lib/business-intelligence` (`revenueByChannel`,
  `assignmentRevenueByCampaign`, `revenueByAcquisitionEvent`, `closedWonConversionByChannel`) — the same
  authoritative population as `/insights`.
- **Per-deal realized fee** — `AssignmentRecord.executedFeeUsdSnapshot` + status (EXECUTED); expected =
  `Opportunity.assignmentFeeUsd`.
- **Revenue lifecycle / timeline** — pipeline facts (`CONTRACT_EXECUTED`, `ASSIGNMENT_EXECUTED`,
  `SETTLEMENT_COMPLETED`, `TRANSACTION_CLOSED`) via the existing fact-read path; `TRANSACTION_CLOSED` = PAID.
- **Projected contrast** — existing Guided Underwriting / `/analyzer` surfaces (link out, labeled projected).

## 4. Placement & discoverability (Operator Entry Principle)

- **`/revenue` — the org-level Revenue Workspace** (a new *revenue book* object): executive realized-revenue
  summary + a realized-revenue deal list. Reached via **global nav** ("Revenue"), and per the Discoverability
  contract, verified along the real click-path.
- **Per-deal realized revenue = a section on the Opportunity Workspace** (the deal's single primary landing —
  Operator Entry Principle), not a competing per-deal page. It shows expected vs realized, execution date,
  settlement status, and the revenue timeline, with a labeled link to Guided Underwriting (projected contrast).
- **(Design decision flagged for review):** confirm `/revenue` as the org-level route name and that per-deal
  revenue lives on the Opportunity Workspace rather than a standalone per-deal revenue route.

## 5. Proposed increments (business-scoped, reuse-first; each reviewed + accepted before the next)

- **Increment 1 — Executive Realized-Revenue Summary (`/revenue`).** The executive answer first: total realized
  revenue, revenue by channel, by campaign, by acquisition event, closed-won conversion — reusing the BI layer.
  Honest empty state ("revenue appears once an assignment is executed"). No new calculations.
- **Increment 2 — Realized-Revenue Deal List (`/revenue`).** Per executed deal: realized fee (executed snapshot),
  expected fee (contrast), execution date, settlement status — sourced from `AssignmentRecord` + `Opportunity`.
  Realized is the sortable/aggregated figure; expected is contrast-only.
- **Increment 3 — Per-deal Revenue section + Revenue Timeline (Opportunity Workspace).** For a deal: the
  expected→realized pairing and a read-only **Revenue Timeline** from the pipeline facts (Historical Integrity /
  Decision Chronology). Projected shown only as a labeled link to Guided Underwriting.
- **Increment 4 — Integration + Discoverability.** Global-nav entry to `/revenue`; Opportunity Workspace ↔
  Revenue cross-links (Explicit Intent Navigation: Projected → Guided Underwriting, Expected → deal, Realized →
  Revenue Workspace); re-run **click-path** Discoverability Verification.

## 6. Standing contracts honored

Executive Summary (answer first) · Information Quality (projected/expected/realized labeled, honest empties) ·
Decision Chronology + Historical Integrity (revenue timeline) · Workspace Progression · Workspace Discoverability
(click-path) · Operator Entry Principle (per-deal revenue on the deal's landing) · Workflow Intent Preservation ·
Explicit Intent Navigation (label by intent). Operational: Production Build Isolation (isolated verification
builds throughout). The Closing Console remains authoritative for execution; underwriting remains authoritative
for projected.

## 7. Stop conditions (report and stop if any is hit)

Stop if delivering any surface would require: a schema change; a new API; a new calculation or financial model;
combining projected/expected/realized into one figure; showing a revenue concept that has **no** existing
authority (any Missing-Authority item — fee types beyond assignment, accounting, settlement values, partner
splits, forecasting); or modifying the Closing Console / underwriting authority.

## 8. Verification approach (per increment)

Isolated production build · app `tsc` · scripts `tsc` · ESLint · unit · **browser verification** (each surface
shows realized from authority; expected/projected are labeled and never summed into realized) · full regression.
Then the Accepted → Released lifecycle with a click-path Discoverability Verification for `/revenue`.

## 9. What this plan does NOT do

No code. No schema/API/calculations/new authority. Increment scope and the §4 placement decision are proposals
awaiting review. On approval, implementation proceeds as governed increments (§5), each reviewed and accepted.

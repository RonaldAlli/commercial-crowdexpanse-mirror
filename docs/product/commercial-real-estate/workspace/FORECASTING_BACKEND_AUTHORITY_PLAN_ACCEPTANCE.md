# Forecasting Backend Authority — Plan — Acceptance Record

> **Status: PLANNING ACCEPTED WITH OBSERVATIONS** (founder-accepted 2026-08-01). Accepts
> `FORECASTING_BACKEND_AUTHORITY_PLAN.md` (PR #118, merged to `main` `f727a27`). **Forecasting Backend Authority —
> APPROVED TO IMPLEMENT** (the first CRE program to introduce schema / migrations / write paths / new APIs —
> evaluated against the accepted business model, not the read-only "delta NONE" standard). Context:
> `REVENUE_FORECASTING_MODEL_BUSINESS_SPECIFICATION_ACCEPTANCE.md`, [[crowdexpanse-cre-workspace]].

## Resolved founder decisions

- **FD-1 — Lost vs Dead: TWO distinct states.** **Lost** = a viable opportunity that will not proceed under
  current circumstances (seller declined, buyer unavailable, financing failed, pricing) — **reactivation allowed,
  always audited.** **Dead** = can no longer become a transaction (sold elsewhere, demolished, duplicate/corrupt,
  permanently withdrawn) — **not reopened through ordinary workflow; only an explicit audited administrative
  action** may reactivate.
- **FD-2 — Expected Payment Date: derived default → explicit override.** Initial value = `targetCloseDate`; once
  operations know better it becomes explicitly owned (not continuously re-derived) — preserves auditability.
- **FD-3 — Stage Probability Policy: versioned policy table** (version · effective date · stage · probability).
  Historical conversion may inform revisions but never becomes the probability automatically (Forecast Integrity).
- **FD-4 — Time-phasing: monthly forecast display, quarterly rollups.** Snapshot cadence: **on-demand (required)**
  now; **scheduled nightly** as a future capability.
- **FD-5 — Ownership: Opportunity owns Lost/Dead and Expected Payment Date** (they describe the deal's commercial
  lifecycle, not a specific closing transaction; closing records stay responsible for execution).

## New platform contract — Forecast Lineage

**Every forecast must be reproducible.** A forecast snapshot always identifies: forecast **model version** ·
**probability policy version** · **assumption set** · **population definition** · **effective date** ·
**calculation timestamp**. Two forecasts that differ must be explainable by a difference in one or more of those
recorded elements. Extends Forecast Integrity. (20th platform contract.)

## Authorized implementation — increment breakdown (each reviewed + accepted before the next; isolated builds; test-DB migrations only until release)

1. **Increment 1 — G-1 Lost/Dead authority.** Opportunity outcome state (ACTIVE default / LOST / DEAD) + reason +
   actor + timestamp; mark-Lost / mark-Dead + audited reactivation (Lost ordinary, Dead admin-only); the open
   pipeline (Pipeline Value + forecast population) excludes Lost/Dead → **Pipeline Value's Lost/Dead disclosure is
   removed**. Additive migration, backfill ACTIVE.
2. **Increment 2 — G-2 Expected Payment Date.** Nullable date on Opportunity; derived default = `targetCloseDate`,
   explicit override; write path.
3. **Increment 3 — G-3 Stage Probability Policy.** Versioned, effective-dated policy-as-data storage + a seeded
   initial policy version (values per FD-3, founder-provided) + governed versioning.
4. **Increment 4 — G-4 Forecast Snapshot + forecasting service.** Immutable snapshot (Forecast Lineage metadata) +
   the computation (Expected × policy probability, phased by expected-payment date; monthly display, quarterly
   rollups; on-demand). No UI.

Then the backend program's Accepted → Released lifecycle. **The Forecast UI is a separate subsequent program
(Revenue Workspace Milestone 2).** Each increment stops for review; no increment proceeds until the prior is
accepted.

## Recorded

FD-1…FD-5 approved as above · Lost and Dead remain separate · Lost supports audited reactivation · Dead requires
exceptional audited reactivation · derived-default Expected Payment Date · versioned probability policy · monthly
forecasting with quarterly rollups · Opportunity owns Lost/Dead and Expected Payment Date · Forecast Lineage added
as a platform contract · schema/migration/API changes are expected outcomes of building new authority.

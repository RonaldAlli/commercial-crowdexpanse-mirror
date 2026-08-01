# Forecasting Backend Authority — Increment 2 (G-2 Expected Payment Date) — Acceptance Record

> **Status: ACCEPTED WITH OBSERVATIONS** (founder-accepted 2026-08-01). Accepts Increment 2 "G-2 Expected Payment
> Date" (PR #122, merged to `main`). Backend authority; additive migration (test DB only); no UI/forecast.
> Context: `FORECASTING_BACKEND_AUTHORITY_PLAN_ACCEPTANCE.md`, [[crowdexpanse-cre-workspace]].

## Recorded

1. **Expected Payment Date authority introduced** — Opportunity-owned; distinct from `targetCloseDate`, Realized,
   and Forecast.
2. **Opportunity ownership preserved** (FD-5).
3. **Derived-default-then-explicit approved** — explicit ?? targetCloseDate ?? unavailable; explicit value stays
   owned.
4. **Clearing the override correctly restores derivation** (no copy, no fabrication).
5. **ActivityLog auditing preserved** (writes only through the service — State Transition Authority).
6. **Date Source Transparency added** (new contract, below).
7. **No Forecast UI or forecast calculation introduced. No production migration occurred.**

## Carry-forward — Date Source Transparency (new platform contract)

**Every date used in forecasting must disclose its source: Explicit (owned), Derived (resolved from target close
date), or Unavailable.** Forecasting must never present a derived date as though it were explicitly confirmed. The
resolver already returns `source: explicit | derived | none`; consumers must surface it.

## Next governed phase — G-3 (with FD-3 resolved)

**Increment 3 — G-3 Stage Probability Policy — APPROVED TO IMPLEMENT.** Initial governed policy
**CRE-STAGE-PROBABILITY-1** (founder-governed, effective-dated, replaceable via a new version — never edited in
place), probabilities for the forecast population only: **UNDER_CONTRACT 60% · BUYER_MATCHED 75% · CLOSING 90%.**
Pre-contract stages are outside the population (not 0% rows); LOST/DEAD excluded (conceptually 0%); PAID is
Realized (excluded, not a 100% row). Historical conversion may inform later revisions but never updates values
automatically. No forecast snapshots / aggregation / auto-updates / UI / G-4. Stop for review.

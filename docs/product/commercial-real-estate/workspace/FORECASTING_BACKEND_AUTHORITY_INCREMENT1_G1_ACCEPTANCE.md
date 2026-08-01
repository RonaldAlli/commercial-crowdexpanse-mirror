# Forecasting Backend Authority — Increment 1 (G-1 Lost/Dead) — Acceptance Record

> **Status: ACCEPTED WITH OBSERVATIONS** (founder-accepted 2026-08-01). Accepts Increment 1 "G-1 Lost/Dead
> authority" (PR #120, merged to `main` `2c8f5da`). First CRE backend-authority increment (schema + migration —
> expected). Context: `FORECASTING_BACKEND_AUTHORITY_PLAN(_ACCEPTANCE).md`, [[crowdexpanse-cre-workspace]].

## Recorded

1. **OpportunityOutcome introduced** (ACTIVE / LOST / DEAD) — a true business concept, not a heuristic.
2. **Lost/Dead modeled explicitly** (reason + actor + timestamp; never inferred).
3. **Transition rules approved** — reason required for Lost/Dead; Lost reactivation ordinary (audited); Dead
   reactivation admin-only (audited).
4. **ActivityLog auditing preserved.**
5. **Pipeline Value now excludes Lost/Dead** through explicit authority (population `outcome = ACTIVE`); the earlier
   "not yet excluded" disclosure is replaced with explicit exclusion.
6. **Migration discipline preserved** — schema-diff generated, Prisma regenerated, applied to the **test DB only**,
   production untouched.
7. **State Transition Authority added** (new backend contract, below).
8. **No unintended production change occurred** (the local-main slip never reached origin; recovered before review).

## Carry-forward — State Transition Authority (new backend platform contract)

**Business state transitions occur only through their authoritative service — no direct writes, no bypasses, no UI
mutations.** For Opportunity Outcome: `UI → Outcome Service → transition rules → persistence → ActivityLog`. This
guarantees consistent auditing and enforcement regardless of which future UI performs the transition. Complements
Financial State Authority · Forecast Integrity · Forecast Lineage.

## Next governed phase

**Increment 2 — G-2 Expected Payment Date — APPROVED TO IMPLEMENT.** Introduce Expected Payment Date authority:
derived initially from Target Close Date, explicit override permitted, ownership on Opportunity. Preserve Financial
State Authority · Forecast Integrity · Forecast Lineage · State Transition Authority. No Forecast UI, forecast
calculations, stage probability, forecast snapshots, or revenue weighting. Stop for review before any merge or
release activity.

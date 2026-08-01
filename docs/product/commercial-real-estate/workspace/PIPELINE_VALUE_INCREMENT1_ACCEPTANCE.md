# Pipeline Value — Increment 1 — Acceptance Record

> **Status: ACCEPTED WITH OBSERVATIONS** (founder-accepted 2026-08-01). Accepts Increment 1 "organization-level
> Pipeline Value summary" (PR #111, merged to `main` `c8e2372`). Read-only Operational Inventory over existing
> authority; no schema / API / forecasting. Context: `PIPELINE_VALUE_BUSINESS_PLAN(_ACCEPTANCE).md`,
> [[crowdexpanse-cre-workspace]].

## Recorded

1. **Pipeline Value implemented as Operational Inventory** — unweighted Σ `Opportunity.assignmentFeeUsd` over the
   active contractual pipeline (`UNDER_CONTRACT`/`BUYER_MATCHED`/`CLOSING`), excluding realized (executed).
2. **Inventory Integrity preserved** — one authoritative population derives total + stage/channel/campaign
   breakdowns; they reconcile exactly (unit-tested).
3. **Financial State Authority preserved** — Expected→Opportunity, Pipeline Value→Revenue; explicit, never
   implicit derivation.
4. **Financial Truthfulness preserved** — labeled Operational Inventory; never a forecast, never realized revenue.
5. **Lost/Dead limitation explicitly disclosed** (Information Quality; no heuristic inference).
6. **Population Transparency added** (new contract, below).
7. **No schema / API authority changed. No forecasting introduced.**

## Carry-forward — Population Transparency (new platform contract)

**Every operational inventory must explicitly define what is included, what is excluded, and why** — an operator
should never have to infer the population behind a reported total. This extends Inventory Integrity from arithmetic
correctness to semantic clarity. Complements Financial Truthfulness · Revenue Evidence · Revenue Traceability ·
Active Evidence · Revenue State Progression · Financial Workspace Progression · Financial State Authority ·
Forecast Integrity · Inventory Integrity.

## Next governed phase

**Increment 2 — APPROVED TO IMPLEMENT:** the contributing-deal list with per-deal traceability. Each contributing
deal must identify the Opportunity, its stage, acquisition channel, campaign, and expected fee, and link back to
the Opportunity Workspace; plus accessibility, responsive, and workflow-continuity verification. No forecasting /
weighting / probability / Lost-Dead inference / new backend / schema / API. Stop for review before any merge or
release activity.

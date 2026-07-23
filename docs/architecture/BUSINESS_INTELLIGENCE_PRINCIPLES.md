# Business Intelligence Principles (platform-wide)

> How the platform turns authoritative business facts into business truth. Sits alongside
> `AUTHORITY_PRINCIPLES.md` and `ATTRIBUTION_PRINCIPLES.md`. Established 2026-07-23 with the
> Business Query Primitives (Phase 1).

---

## BI Rule 1 — Metrics derive from authoritative facts

> **Every business metric must be derived from authoritative business facts — never duplicated,
> manually maintained, or inferred from presentation strings.**

> **Companion:** *Metric names must describe exactly what the authoritative facts prove.*

That companion is why buyer *coverage* ships now but assignment-record creation is **not** honestly
called a "contract date": a precise-sounding name over an administrative timestamp would lie.

## The layer

```
Business Facts            (Opportunity, AssignmentRecord, BuyerMatch, attribution — the truth)
        ↓
Business Query Primitives (lib/business-intelligence/ — pure, deterministic, org-scoped)
        ↓
Dashboards · Reports · KPIs · Exports · Email · AI     (mere CONSUMERS — the truth exists once)
```

Dashboards are not the artifact. They are one consumer among many. `revenueByChannel()` is written
once, proven once, and every presentation reads that same trusted implementation.

## Frozen semantics (Phase 1)

- **Realized revenue** = `SUM(AssignmentRecord.executedFeeUsdSnapshot)` where `status = EXECUTED`. The
  mutable `Opportunity.assignmentFeeUsd` is an *expected* amount and must never be mixed into realized
  revenue (it may back a future *projected pipeline value* metric — a different name for a different fact).
- **Rates use DISTINCT opportunity counts**, so multiple related records cannot inflate them.
- **Zero denominator → `null`**, never `0`: no population means *not measurable*, not zero performance.
- **UNKNOWN is explicit.** Null channel/campaign/eventKey normalizes to the label `UNKNOWN` in results
  (the DB value may stay null). It is never silently filtered — totals must reconcile, unattributed
  volume measures attribution quality, and optimization reports must not look better by hiding gaps.
- **Revenue is integer USD**, consistent with the authoritative snapshot field.
- **Org-scoped + all-time.** Every primitive takes `organizationId` (Authority Rule 1). Date-window
  filtering is a later ADDITIVE input — never hidden default behavior.
- **Deterministic ordering:** highest primary value first, then normalized key alphabetically as the
  tie-breaker; `null` values sort last.

## Phase 1 primitives (`lib/business-intelligence/`)

`revenueByChannel` · `closedWonConversionByChannel` · `buyerCoverageByChannel` ·
`assignmentRevenueByCampaign` · `revenueByAcquisitionEvent`.

Each is deterministic, unit-tested (pure shaping) + e2e-tested (against real data), reusable, and
presentation-independent.

## Deferred (honesty over completeness)

- **`daysToContractByChannel()`** — deferred until an authoritative contract-effective timestamp exists
  (a structured `UNDER_CONTRACT` transition time, `contractExecutedAt`, or `agreementEffectiveAt`).
  Today only ActivityLog *display strings* record stage changes; deriving a KPI from them would violate
  BI Rule 1. "Days to assignment-record creation" is computable but is **not** "days to contract".
- **`confirmedMatchRateByChannel()`** — a stricter future primitive, added separately. The existing
  buyer-coverage metric is never silently redefined.

## Out of scope for this phase

No charts, dashboard widgets, KPI cards, executive homepages, scheduled reports, exports, or AI
summaries — and no speculative timestamp instrumentation. Presentations come after the primitives exist.

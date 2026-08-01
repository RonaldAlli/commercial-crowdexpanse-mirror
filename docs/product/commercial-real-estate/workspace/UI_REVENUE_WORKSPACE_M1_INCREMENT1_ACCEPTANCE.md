# Revenue Workspace — Milestone 1 — Increment 1 — Acceptance Record

> **Status: ACCEPTED WITH OBSERVATIONS** (founder-accepted 2026-08-01). Accepts Increment 1 "org-level Executive
> Summary" (PR #93, merged to `main` `238a54f`). Read-only consumer of the business-intelligence authority; no
> schema / API / new calculations. Context: `UI_REVENUE_WORKSPACE_MILESTONE_1_PLAN_ACCEPTANCE.md`,
> [[crowdexpanse-cre-workspace]], [[engineering-bi-rule-1]].

## Recorded

1. **Executive Summary preserved** — `/revenue` opens with the answer (Revenue Health) before supporting detail.
2. **Financial Truthfulness preserved** — Realized / Expected / Projected are distinct, labeled, and never combined.
3. **Realized revenue reused from BI authority** — the org headline reuses the same executed-fee reduction the
   Command Center uses (`revenueAllTimeView`); no duplicate business logic.
4. **Expected and Projected honestly presented as per-deal truths** — "Measured per deal", not fabricated org
   totals (no org-level authority aggregates them).
5. **No fabricated organization totals.**
6. **No schema authority changed. No API authority changed. No new calculations.**

## Carry-forward — Revenue Evidence (new financial platform contract)

**Every realized revenue figure must be traceable to the operational event that produced it** — using existing
evidence, never reconstructed history. The intended evidence chain:

Realized Revenue → Revenue Event → Assignment → Settlement → Opportunity.

The workspace should always be able to answer *"Why do we believe this revenue exists?"* from existing authority
(AssignmentRecord execution snapshot, pipeline facts, the Opportunity). Complements Financial Truthfulness. This
shapes Increments 2–3 (the deal list rows and the per-deal revenue section link back to their originating
evidence) without introducing any new authority.

## Next governed phase

**Increment 2 — Revenue Deal List — APPROVED TO IMPLEMENT.** Organization-level list of realized revenue events
over existing authority only (realized assignment revenue, execution dates, acquisition channels, campaign
attribution, revenue events). No forecasting / invoices / commissions / accounting / partner distributions /
settlement calculations. Stop for review before any merge or release activity.

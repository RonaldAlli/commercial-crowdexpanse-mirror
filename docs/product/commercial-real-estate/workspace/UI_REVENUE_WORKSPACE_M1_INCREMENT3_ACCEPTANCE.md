# Revenue Workspace — Milestone 1 — Increment 3 — Acceptance Record

> **Status: ACCEPTED WITH OBSERVATIONS** (founder-accepted 2026-08-01). Accepts Increment 3 "per-deal Revenue
> section" (PR #98, merged to `main` `6c5f472`), re-implemented on the approved **Option A** basis (ActivityLog +
> AssignmentRecord evidence; dormant pipeline facts excluded). Read-only over active authority; no schema / API /
> new calculations / accounting. Context: `UI_REVENUE_WORKSPACE_M1_INCREMENT2_ACCEPTANCE.md`,
> `UI_REVENUE_WORKSPACE_BACKEND_CAPABILITY_AUDIT.md` (§1.4 correction), [[crowdexpanse-cre-workspace]].

## Recorded

1. **Three-tier revenue presentation preserved** — Projected / Expected / Realized, distinct and never blended.
2. **ActivityLog adopted as authoritative evidence** — the Revenue Timeline derives from recorded ActivityLog
   events (`deal.controlled`, `escrow.*`, `financing.*`, `settlement.*`) + the active `AssignmentRecord`.
3. **Dormant pipeline authority excluded** — no `pipeline-facts` / `PipelineFact` import; the standing
   `opportunity-inc3.contract.test.ts` still passes (evidence source changed, guardrail not weakened).
4. **Revenue Evidence preserved · Revenue Traceability preserved · Active Evidence preserved.**
5. **Honest pending states** — Settlement (no active authority yet) displays *pending*, never fabricated.
6. **Revenue State Progression added** (new contract, below).
7. **No schema authority changed. No API authority changed. No new calculations. No accounting authority.**

## Carry-forward — Revenue State Progression (new financial platform contract)

**Revenue always moves through explicit states — Projected → Expected → Realized — and may only move forward.** A
value must never appear to move backward; historical values remain historical evidence. Naturally upheld by the
read-only, evidence-based design: Realized derives from the immutable executed-fee snapshot, and the timeline is
append-only recorded evidence. Complements Financial Truthfulness · Revenue Evidence · Revenue Traceability ·
Active Evidence.

## Next governed phase

**Increment 4 — Integration · Discoverability · Accessibility · Responsive · Workflow continuity — APPROVED TO
IMPLEMENT.** Complete the operator flow **Opportunity → Revenue → Revenue Workspace**, with the Revenue Workspace
as another *intentional branch* of the Opportunity Workspace (not a competing entry point), while preserving the
existing journeys (Opportunity → Guided Underwriting → Closing Workspace → Closing Console). No schema / API /
accounting / forecasting / partner distributions / settlement authority. Stop for review before any merge or
release activity.

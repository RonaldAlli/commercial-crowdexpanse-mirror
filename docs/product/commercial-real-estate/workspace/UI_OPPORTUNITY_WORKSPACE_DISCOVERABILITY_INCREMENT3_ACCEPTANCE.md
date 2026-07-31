# Opportunity Workspace Discoverability Remediation — Increment 3 — Acceptance Record

> **Status: ACCEPTED WITH OBSERVATIONS** (founder-accepted 2026-07-31). Accepts Increment 3 "Open Closing Console
> affordance" (PR #87, merged to `main` `e0c6b31`) — the final implementation increment. Workspace-only link
> addition; the Closing Console page is not modified. Context:
> `UI_OPPORTUNITY_WORKSPACE_DISCOVERABILITY_INCREMENT2_ACCEPTANCE.md`, [[crowdexpanse-cre-workspace]].

## Accepted (recorded)

1. **Direct Closing Console affordance added** — "Open Closing Console →" on the Opportunity Workspace, a one-hop
   execution exit (`components/workspace-ui/opportunity/OpportunityWorkspace.tsx`).
2. **Closing Workspace affordance preserved** — "Open Closing Workspace →" (readiness) remains.
3. **Guided Underwriting preserved** — reachable via Related records.
4. **Operator Entry Principle preserved** — the Opportunity Workspace remains the single primary landing page;
   specialized workspaces branch from it intentionally.
5. **Workflow Intent Preservation reinforced** — operators already in an execution mindset reach the Console
   directly, without passing through the readiness workspace.
6. **No schema authority changed. No API authority changed. No workflow authority changed. No Closing Console
   modification** (the affordance links *to* the console; the console page is untouched).
7. **Verification** — isolated build, app `tsc` 0, scripts `tsc` 0, ESLint clean, unit 130, browser verification
   (`cre-discoverability-inc3.spec.ts`: console exit present, readiness/execution distinct, GU preserved, click
   navigates), full regression **Playwright 123/123** (OB-1 teardown non-blocking).

## Carry-forward — Explicit Intent Navigation (new platform contract)

**When multiple destinations exist for the same business object, the UI labels them by operator *intent*, not by
implementation detail.** For an Opportunity:

- **Understand structure** → Guided Underwriting
- **Understand closing readiness** → Closing Workspace
- **Execute closing** → Closing Console

Operators choose by what they are trying to accomplish, not by internal architecture. Complements the Operator
Entry Principle and Workflow Intent Preservation.

## Status

Implementation phase of the Discoverability Remediation is **complete** (Increments 1–3 accepted). The Accepted →
Released lifecycle is authorized (see `..._MILESTONE_ACCEPTANCE_REVIEW.md` and the production release record).

# Opportunity Workspace Discoverability Remediation — Increment 2 — Acceptance Record

> **Status: ACCEPTED WITH OBSERVATIONS** (founder-accepted 2026-07-31). Accepts Increment 2 "conditional surfaces
> (C1/C2/C4)" (PR #85, merged to `main` `3917778`). Read-only navigation repointing via existing links; no schema /
> API / workflow / Closing Console changes. **No deployment; the remediation is not released.** Context:
> `UI_OPPORTUNITY_WORKSPACE_DISCOVERABILITY_INCREMENT1_ACCEPTANCE.md`,
> `UI_OPPORTUNITY_WORKSPACE_DISCOVERABILITY_REMEDIATION_PLAN.md`, [[crowdexpanse-cre-workspace]].

## Accepted (recorded)

1. **Buyer Matches repointed** → Opportunity Workspace (`matches/page.tsx:103`).
2. **Analyzer back-links repointed** (×2) → Opportunity Workspace (`analyzer/[opportunityId]/page.tsx:134,222`);
   completes the loop Workspace → Guided Underwriting → Analyzer → Workspace.
3. **Post-create redirect repointed** → Opportunity Workspace (`opportunities/actions.ts`); a new deal begins its
   lifecycle on the workspace.
4. **Post-update redirect intentionally preserved** on the Closing Console — editing an existing transaction is an
   execution activity.
5. **Closing Dashboard (C3) intentionally preserved** on the Closing Console.
6. **Operator Entry Principle reinforced.**
7. **No schema authority changed. No API authority changed. No workflow authority changed. No Closing Console
   modification.**
8. **Verification** — isolated production build, app `tsc` 0, scripts `tsc` 0, ESLint clean, unit 130, browser
   verification for C1/C2/C4 (`cre-discoverability-inc2.spec.ts`, with buyer/match + create-flow fixtures torn
   down), full regression **Playwright 119/119** (OB-1 teardown non-blocking). Continued use of isolated
   verification builds per the Production Build Isolation contract.

## Carry-forward — Workflow Intent Preservation (new platform contract)

**Navigation must preserve the operator's intent.** Discovery surfaces lead to the Opportunity Workspace; analysis
surfaces lead *back* to the Opportunity Workspace; execution surfaces continue to lead to execution. This is
distinct from — and complements — the **Operator Entry Principle**:

- **Operator Entry Principle** answers *"Where does a user normally begin?"* → one primary landing page per object.
- **Workflow Intent Preservation** answers *"When a user is already in a workflow, don't unexpectedly move them
  into another."*

Both join the platform-wide workspace contracts and govern future navigation decisions.

## Next governed phase

**Increment 3 — APPROVED TO IMPLEMENT** (founder 2026-07-31): add the "Open Closing Console" affordance to the
Opportunity Workspace. Requirements: Opportunity Workspace only; no Closing Console modification; preserve Guided
Underwriting and Closing Workspace links; preserve the Operator Entry Principle and Workflow Intent Preservation.
Continue isolated verification builds. **After Increment 3, stop for review before any merge or release activities.**
The Accepted → Released lifecycle (with a re-run click-path Discoverability Verification and the release-record
correction) follows on its own authorization.

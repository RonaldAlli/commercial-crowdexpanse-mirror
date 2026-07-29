# CRE Operating Workspace — UI Milestone 1, Increment 3 Implementation Report

> **Scope: Opportunity Workspace + Activity Timeline.** One operating record for an opportunity, binding
> the accepted Increment-1 primitives to the **existing** opportunity / diligence / stage-policy /
> closing-gate / timeline capabilities, and **reusing** the existing `StageSelect` control and
> `TransactionTimelinePanel`. Additive only (5 new files + report, zero modifications); Increment-1 and
> Increment-2 files byte-unchanged; no schema, API, domain-model, tenant-authority, projection-layer, or
> BE-3 change. Branch `feat/cre-ui-m1-increment-3` off verified main `85ae70e`. Context:
> `UI_MILESTONE_1_PLAN.md`, `UI_M1_INCREMENT2_ACCEPTANCE.md`, [[crowdexpanse-cre-workspace]].

## What was built (additive only)

| File | Role |
|---|---|
| `app/(workspace)/opportunity-workspace/[id]/page.tsx` | route (server; tenant-scoped; 404 on miss) |
| `components/workspace-ui/opportunity/OpportunityWorkspace.tsx` | presentation (primitives + reused StageSelect + reused TransactionTimelinePanel) |
| `lib/workspace-ui/opportunity-view.ts` | pure view-models (stage position, diligence, closing gate, stage readiness, cross-links, usd) |
| `tests/unit/workspace-ui/opportunity-view.test.ts` | pure-logic tests |
| `tests/unit/workspace-ui/opportunity-inc3.contract.test.ts` | structural boundary tests |

**Tests:** full `workspace-ui` suite **62/62 green** (24 Inc1 + 19 Inc2 + 19 Inc3). Increment-3 files
`tsc`-clean. Increment-1 and Increment-2 files verified **byte-unchanged** vs `origin/main`.

## Reused existing capabilities (no replacements)

Read: tenant-scoped `prisma.opportunity.findFirst` (seller/property/`_count` includes),
`ensureOpportunityDiligence` + `summarizeDiligence`, `getClosingGateStatus`, `getOpportunityTimeline`,
`listGeneratedAgreements`, `STAGE_OPTIONS`. Controls: the existing **`StageSelect`** (bound to the
existing `moveOpportunityStage` + `evaluateStageMove`) and the existing **`TransactionTimelinePanel`**.

## Findings — classified

### Proven
- Tenant-scoped opportunity lookup; missing/inaccessible → `notFound()` (404).
- **Native `OpportunityStage` is authoritative**; stage moves run through the existing governed path
  (`StageSelect` → `moveOpportunityStage`), gated by the existing policy; the dormant projection layer is
  never read or written.
- Stage readiness for the next stage displays the existing `evaluateStageMove` output honestly: `outcome`,
  `missingTruth`, `missingArtifacts`, and — when blocked (`DENY`) — the policy `message`; `suggestedAction`
  is shown as **Recommended** (verbatim, no new recommendation logic).
- Observed identity/seller/property/financials; **Computed** stage position, diligence summary,
  closing-gate status, and buyer-match/agreement/document counts — visually distinguished via the
  Observed/Computed/Recommended taxonomy.
- Activity timeline is the **reused** `TransactionTimelinePanel` over `getOpportunityTimeline`
  (deterministic order, timestamps, event types, attribution, empty-state) — no second event history.
- Cross-links (Seller → the Increment-2 seller record, Property, Buyer Matches, Agreements, Documents,
  Closing) render only where the destination exists; unavailable ones are shown `aria-disabled`, never
  implied as working.
- Increment-2 seller handoff preserved (Seller cross-link → `/seller-queue/[id]`).

### Existing Backend Constraint
- **Financials on the opportunity are thin** (`contractValueUsd` / `assignmentFeeUsd` only); richer figures
  live in the underwriting engine, which is a **future workspace** — shown here only as on-record values
  and links, never duplicated.
- **Buyer-match / agreement / document detail is summarised as counts** with links to the existing global
  surfaces; per-opportunity deep views belong to their own future workspaces.

### Intentionally Unsupported (this increment)
- No Command Center orchestration; no Next Best Action selection; no Missing Information synthesis engine
  (the displayed `missingTruth`/`missingArtifacts` are existing stage-policy outputs, not synthesis).
- No global-shell nav wiring — reachable by route and by inbound cross-links; wiring is a later increment.
- No duplication of the Underwriting / Buyer Matching / Deal Room / Closing workspaces (summaries + links
  only).

### Deferred
- Browser-level accessibility/responsive automation → Increment 6.

## Accessibility (source-level)

The reused `StageSelect` is a keyboard-operable `<select>` that surfaces DENY/errors inline; cross-links
are focus-visible `<Link>`s with descriptive names; unavailable links are `aria-disabled`; stage/closing
status is conveyed as **text** (position label, status label), not color alone; the timeline uses the
existing accessible panel. Browser-level automation remains Increment 6.

## Boundaries honored

No new opportunity services · no stage-policy change · no projection activation/modification · no
underwriting calculations · no buyer-matching logic · no agreement/document/closing domain behavior · no
APIs · no schema · no tenant-authority change · no Next Best Action · no Missing Information synthesis ·
no global-shell wiring · no Increment-4+ work · no BE-3 change.

## Stop

Opened for the **UI Milestone 1 Increment 3 Review**. Not to be merged, accepted, tagged, deployed, or
followed by Increment 4 without separate governed authorization.

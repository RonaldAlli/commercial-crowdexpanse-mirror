# CRE Operating Workspace — UI Milestone 1, Increment 3 Acceptance Record

> **Status: ACCEPTED WITH OBSERVATIONS** (founder-accepted 2026-07-29). Accepts the Opportunity Workspace
> + Activity Timeline, which binds the accepted Increment-1 primitives to the **existing** opportunity /
> diligence / stage-policy / closing-gate / timeline capabilities and **reuses** `StageSelect` and
> `TransactionTimelinePanel` (PR #43, `5a104fc` → merge `4563af7`, verify PASS 12/12 with
> `--mirror-mode ancestor`). Additive only (5 new files + report, zero modifications); Increment-1 and
> Increment-2 files byte-unchanged; no schema, API, domain-service, tenant-authority, projection-layer, or
> BE-3 change. **No tag. No deployment. Do not begin Increment 4.** Context:
> `UI_M1_INCREMENT3_REPORT.md`, `UI_MILESTONE_1_PLAN.md`, [[crowdexpanse-cre-workspace]].

## What was accepted

`/opportunity-workspace/[id]` (server, tenant-scoped; `notFound()` on miss); `OpportunityWorkspace`; the
pure `lib/workspace-ui/opportunity-view.ts`; and pure-logic + structural tests. Full `workspace-ui` suite
**62/62 green**; Increment-3 files `tsc`-clean.

## Proven

- Tenant-scoped lookup; missing/inaccessible → `notFound()`.
- Native `OpportunityStage` authoritative; moves via the existing governed path
  (`StageSelect` → `moveOpportunityStage`, `evaluateStageMove`); dormant projection never touched;
  blocked moves explained (DENY message + `missingTruth`/`missingArtifacts`; `suggestedAction` as
  Recommended, verbatim; no new recommendation logic; no Missing-Information synthesis).
- Reused timeline (`TransactionTimelinePanel` / `getOpportunityTimeline`); Observed/Computed/Recommended
  taxonomy; cross-links only where the destination exists; Increment-2 seller handoff preserved.

## Observations (governed)

1. **Native `OpportunityStage` remains the sole authoritative lifecycle; the dormant projection layer
   remains intentionally unused.**
2. **Opportunity timelines are reused rather than recreated, preserving a single activity history.**
3. **Financial analysis remains intentionally summarized; full underwriting belongs to the future
   Underwriting Workspace.**
4. **Future dashboards should deep-link into this workspace rather than constructing alternate opportunity
   summaries** — i.e., when the Command Center (Increment 4) arrives, the Opportunity Workspace is the
   authoritative deep-link target. (Future architectural guidance; not implemented here.)

## Boundaries this acceptance does NOT authorize

No tag; no deployment; no Increment 4. **Not authorized:** Increment 4 (Command Center orchestration),
Increment 5 (Next Best Action + Missing Information synthesis), Increment 6 (accessibility, responsiveness,
milestone verification). The next governed decision is whether to authorize **UI Milestone 1 —
Increment 4**.

## Artifacts

| File | Role |
|---|---|
| `app/(workspace)/opportunity-workspace/[id]/page.tsx` | workspace route (tenant-scoped) |
| `components/workspace-ui/opportunity/OpportunityWorkspace.tsx` | presentation |
| `lib/workspace-ui/opportunity-view.ts` | pure view-models |
| `tests/unit/workspace-ui/{opportunity-view,opportunity-inc3.contract}.test.ts` | tests (19) |
| `UI_M1_INCREMENT3_REPORT.md` | implementation report |
| `UI_M1_INCREMENT3_ACCEPTANCE.md` | this acceptance record |

**No tag** by design; the workspace stays additive and unwired into the global shell until a later increment.

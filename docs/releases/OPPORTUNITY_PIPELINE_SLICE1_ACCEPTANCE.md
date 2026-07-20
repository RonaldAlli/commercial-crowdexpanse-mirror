# Opportunity Pipeline — Slice 1 · Release Acceptance

> **Status: ✅ ACCEPTED · PRODUCTION VERIFIED · FROZEN (2026-07-20).** Founder-accepted after a clean
> production browser re-drive + a ~49-minute evidence-based observation window. Frozen baseline:
> **`main a2f9fd4` / build `AKUhg2gFVCyjthMDVFvL3`** (tag `opportunity-pipeline-slice1`).

## Release
| | |
|---|---|
| Feature | Opportunity Pipeline Slice 1 — Stage Policy Evaluation + defect fixes |
| Commit | `a2f9fd4` (main = Gitea = GitHub) |
| Build ID | `AKUhg2gFVCyjthMDVFvL3` |
| Migrations | 30 (unchanged — no schema in this slice) |

## Scope delivered
- **Stage Policy Evaluation architecture** — pure rule engine (`lib/stage-policy.ts`, rich result:
  outcome/policyId/missingTruth/missingArtifacts/message/suggestedAction/canOverride) → reusable service
  (`evaluateStageTransition` / `applyStageTransition`, structured attestation via
  `lib/attestation-events.ts`) → workflow delegation in `moveOpportunityStage` (role + PAID gates
  composed, not replaced). Slice-1 rules: `FINANCIALS_REQUESTED` / `T12_RECEIVED` / `RENT_ROLL_RECEIVED`;
  `UNDER_CONTRACT` test-only.
- **OPP-1** PAID gate fails closed on empty/all-optional checklist; **OPP-2/OWN-2** diligence-stage
  validation with imported-deal ActivityLog attestation.
- **PB-1** bounded board (per-stage counts + one bounded scan + ≤25 cards/column + View-all → List).
- **PB-2** deterministic stage-move submission (explicit FormData; removed the RAF/DOM race).
- Reusable **attestation dialog** (`components/attestation-dialog.tsx`).

## Deployment
| Event | Time (UTC) |
|---|---|
| Deployed (build + web-only restart) | 2026-07-20 ~02:50Z |
| Observation started | 2026-07-20 03:03Z |
| Observation ended | 2026-07-20 ~03:52Z (~49 min) |

## Validation evidence
- **Browser acceptance (Founder):** board loads quickly · ≤25 cards/column · true counts · View-all →
  List · normal move relocates the card · missing-T12 opens the attestation dialog · Cancel unchanged ·
  reason moves it · PAID blocked when checklist incomplete. **All 9 passed.**
- **Automated gate (at `a2f9fd4`):** tsc 0 · unit 65 files/93% · E2E 43 · Playwright 3/3 (plain move +
  attestation cancel/confirm + bounded board) · isolated build ok · frozen V1.3/V1.4 kernels unchanged.
- **Predeploy gate + smoke:** all green; migrations 30 before & after.
- **Observation close-out (revised criterion — no crashes / no unstable-restart loop / no post-startup
  error burst / restarts consistent with the pre-existing memory-recycle policy):** 10/10.
  - Build unchanged · HEAD+remotes `a2f9fd4` · no tracked drift · health ok · **unstable_restarts=0** ·
    error log flat (no new errors post-startup) · DB integrity clean · migrations 30 · Automation absent ·
    rollback snapshot + backup restore-verified.

## Non-Slice-1 operational note (explicitly excluded from Slice-1 attribution)
One PM2 restart occurred at **03:20:41Z**. pm2's daemon log confirms it was a **graceful memory-limit
recycle** (`exceeds --max-memory-restart`, current 577–605 MB > 512 MB limit; exit 0 / SIGINT;
`unstable_restarts=0`). This is a **long-standing pre-existing pattern** — the app has hit the 512 MB
ceiling multiple times per day since **2026-06-22** (many recycles occurred *before* this deploy). It is
**not** caused by Slice 1 (which reduces board memory) and does **not** constitute a Slice-1 defect. It
is tracked separately — see [Technical Debt](../roadmap/TECHNICAL_DEBT.md) (memory investigation).

## Outcome
**Status: Accepted · Production Verified · Frozen.** Frozen baseline `main a2f9fd4` / build
`AKUhg2gFVCyjthMDVFvL3` (tag `opportunity-pipeline-slice1`). Rollback assets retained per policy:
`.next.rollback-20260720-024800Z` (prior build `sso5PnSYezUNfdBC1w7YQ`) + restore-verified backup
`20260720-024801Z`. Automation remains paused (D19 open). Companion:
[Retrospective](./OPPORTUNITY_PIPELINE_SLICE1_RETROSPECTIVE.md).

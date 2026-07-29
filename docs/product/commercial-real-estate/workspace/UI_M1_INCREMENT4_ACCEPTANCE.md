# CRE Operating Workspace — UI Milestone 1, Increment 4 Acceptance Record

> **Status: ACCEPTED WITH OBSERVATIONS** (founder-accepted 2026-07-29). Accepts the Command Center — a
> thin, tenant-scoped, **read-only orchestration façade** over the existing acquisition-queue,
> transaction-dashboard, and business-intelligence services, deep-linking into the accepted Seller and
> Opportunity workspaces (PR #45, `3cececf` → merge `e12dcaa`, verify PASS 12/12 with
> `--mirror-mode ancestor`). Additive only (4 new files + report, zero modifications); Increment-1/2/3
> files byte-unchanged; no schema, API, domain-service, permission, write-path, middleware, or BE-3
> change. **No tag. No deployment. Do not begin Increment 5.** Context: `UI_M1_INCREMENT4_REPORT.md`,
> `UI_MILESTONE_1_PLAN.md`, [[crowdexpanse-cre-workspace]].

## What was accepted

`/command-center` (server; tenant-scoped; role-gated sections via existing `can(READ, …)`); `CommandCenter`;
the pure `lib/workspace-ui/command-center.ts`; and pure-logic + structural tests. Full `workspace-ui`
suite **78/78 green**; Increment-4 files `tsc`-clean.

## Proven

- Read-only façade over existing services (`getAcquisitionQueue`, `getDailyAcquisitionMetrics`,
  `getTransactionDashboardRows`, `revenueByChannel`, a recent-opportunities read) — no writes, no new
  service, no new business truth.
- Tenant-scoped; sections role-gated via the existing matrix; only accessible destinations shown.
- Seller order preserved (date-driven queue); opportunity ordering explicit + deterministic + documented
  (`updatedAt desc, id asc`; transaction overdue-first) — not a score; neutral section labels.
- Opportunity Workspace is the authoritative deep-link target; no alternate opportunity detail.
- Every metric tagged Observed/Computed with a time basis; revenue is all-time and labeled as such.
- Duplicate suppression; honest empty and explicit "not yet available" states.

## Observations (governed)

1. **The Command Center is a read-only façade and does not establish a new business-truth layer.**
2. **Seller ordering remains the existing date-driven queue order.**
3. **Opportunity ordering is deterministic presentation logic, not a score or ranking.**
4. **Revenue is currently available only on an all-time basis and is labeled accordingly.**
5. **Appointments, offers, and period-based revenue remain unavailable rather than simulated.**
6. **Future loading or caching optimization must not create an authoritative persistent aggregation
   layer** — the Command Center must remain a coordinator of independent reads, never a source of truth.

Also recorded (from the review, future-only): neutral section labels must not be renamed to "Top Deals",
"Best Opportunities", or similar unless a governed scoring model exists; every future metric must continue
to disclose its time basis.

## Boundaries this acceptance does NOT authorize

No tag; no deployment; no Increment 5. **Not authorized:** Increment 5 (Next Best Action + Missing
Information synthesis), Increment 6 (accessibility, responsiveness, milestone verification), and
global-shell nav wiring (unless explicitly included in a later governed increment). The next governed
decision is whether to authorize **UI Milestone 1 — Increment 5**.

## Artifacts

| File | Role |
|---|---|
| `app/(workspace)/command-center/page.tsx` | Command Center route (tenant-scoped, role-gated) |
| `components/workspace-ui/command-center/CommandCenter.tsx` | presentation |
| `lib/workspace-ui/command-center.ts` | pure orchestration/view-models |
| `tests/unit/workspace-ui/{command-center,command-center-inc4.contract}.test.ts` | tests (16) |
| `UI_M1_INCREMENT4_REPORT.md` | implementation report |
| `UI_M1_INCREMENT4_ACCEPTANCE.md` | this acceptance record |

**No tag** by design; the Command Center stays additive and unwired into the global shell until a later increment.

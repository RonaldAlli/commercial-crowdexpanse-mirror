# CRE Operating Workspace — UI Milestone 1, Increment 2 Acceptance Record

> **Status: ACCEPTED WITH OBSERVATIONS** (founder-accepted 2026-07-29). Accepts the first live-data
> increment — Seller Work Queue + Seller Record — which binds the accepted Increment-1 primitives to the
> **existing** tenant-scoped seller-acquisition services and server actions (PR #41, `07957cf` → merge
> `308f0f8`, verify PASS 13/13 with `--mirror-mode ancestor`). Additive only (8 new files + report, zero
> modifications); Increment-1 primitives byte-unchanged; no schema, API, service, domain, middleware,
> permission, tenant-scope, opportunity-stage, or BE-3 change. **No tag. No deployment. Do not begin
> Increment 3.** Context: `UI_M1_INCREMENT2_REPORT.md`, `UI_MILESTONE_1_PLAN.md`,
> [[crowdexpanse-cre-workspace]].

## What was accepted

`/seller-queue` and `/seller-queue/[id]` (server, tenant-scoped; record `notFound()` on miss);
`SellerQueue`, `SellerRecordView`, `SubmitButton`; the pure `lib/workspace-ui/seller-view.ts`; and
pure-logic + structural tests. Full `workspace-ui` suite **43/43 green**; Increment-2 files `tsc`-clean.

## Proven

- Tenant-scoped queue + record; inaccessible/missing seller fails closed with `notFound()`.
- Queue keeps the existing **deterministic date-based order**, explicitly not presented as a proprietary
  score.
- Observed facts / Computed qualification progress / Recommended promotion (only when the existing
  resolver provides it) are visually distinguished.
- Existing timeline reused (no second event history); existing status / disposition / contact-touch
  actions reused; promotion does **not** directly create an opportunity.
- Communications gates shown honestly, with no inert send controls.
- No schema / API / domain / tenant-authority / opportunity-stage / BE-3 change.

## Observations (governed)

1. **Queue-level completeness and promotion detail remain constrained by the existing thin queue
   projection and are shown on the seller record instead.**
2. **Existing mutation actions provide pending and refreshed state but not granular success/error results
   because their current contracts return void.**
3. **Seller-to-opportunity promotion continues through the existing governed route; future work should
   evaluate the clarity of handoff context** — i.e., whether a user can clearly see which seller is being
   promoted and what qualification evidence supports the handoff.

## Boundaries this acceptance does NOT authorize

No tag; no deployment; no Increment 3. **Not authorized:** Increment 3 (Opportunity Workspace + Activity
Timeline), Command Center, Next Best Action / Missing Information synthesis, and global-shell nav wiring
(unless separately included in a later approved increment). The next governed decision is whether to
authorize **UI Milestone 1 — Increment 3**.

## Artifacts

| File | Role |
|---|---|
| `app/(workspace)/seller-queue/page.tsx`, `.../[id]/page.tsx` | queue + record routes (tenant-scoped) |
| `components/workspace-ui/seller/{SellerQueue,SellerRecordView,SubmitButton}.tsx` | presentation |
| `lib/workspace-ui/seller-view.ts` | pure view-models |
| `tests/unit/workspace-ui/{seller-view,seller-inc2.contract}.test.ts` | tests (19) |
| `UI_M1_INCREMENT2_REPORT.md` | implementation report |
| `UI_M1_INCREMENT2_ACCEPTANCE.md` | this acceptance record |

**No tag** by design; the surface stays additive and unwired into the global shell until a later increment.

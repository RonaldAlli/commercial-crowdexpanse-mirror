# CRE Operating Workspace — UI Milestone 1, Increment 2 Implementation Report

> **Scope: Seller Work Queue + Seller Record — the first LIVE-DATA increment.** Binds the accepted
> Increment-1 primitives to the **existing** seller-acquisition services and server actions. Additive
> only (8 new files, zero modifications); no schema, API, domain-model, tenant-authority, opportunity-
> stage, or BE-3 change; the Increment-1 primitives are byte-unchanged. Branch
> `feat/cre-ui-m1-increment-2` off verified main `d84226a`. Context: `UI_MILESTONE_1_PLAN.md`,
> `UI_M1_INCREMENT1_ACCEPTANCE.md`, [[crowdexpanse-cre-workspace]].

## What was built (additive only)

| File | Role |
|---|---|
| `app/(workspace)/seller-queue/page.tsx` | Seller Work Queue route (server; tenant-scoped) |
| `app/(workspace)/seller-queue/[id]/page.tsx` | Seller Record route (server; tenant-scoped; 404 on miss) |
| `components/workspace-ui/seller/SellerQueue.tsx` | queue presentation (order preserved) |
| `components/workspace-ui/seller/SellerRecordView.tsx` | record presentation + existing-action forms |
| `components/workspace-ui/seller/SubmitButton.tsx` | client pending-state submit (`useFormStatus`) |
| `lib/workspace-ui/seller-view.ts` | pure view-models (urgency, promotion, gate, ordering basis) |
| `tests/unit/workspace-ui/seller-view.test.ts` | pure-logic tests |
| `tests/unit/workspace-ui/seller-inc2.contract.test.ts` | structural boundary tests |

**Tests:** full `workspace-ui` suite **43/43 green** (24 Increment-1 + 19 Increment-2). Increment-2 files
are `tsc`-clean. Increment-1 primitive files verified **byte-unchanged** vs `origin/main`.

## Reused existing capabilities (no replacements, no new write paths)

- Read: `getAcquisitionQueue`, `getDailyAcquisitionMetrics`, `prisma.seller.findFirst` (tenant-scoped),
  `sellerQualificationChecklist` + `checklistProgress`, `resolveSellerPromotion`, `commsGate`, and the
  seller `activities` (ActivityLog) timeline.
- Write (existing server actions, invoked via bound forms): `setSellerOutreachStatus` (revalidates → the
  record refreshes), `recordDisposition` and `logContactTouchAction` (redirect to a caller-supplied
  `redirectTo`, which I set back to the record so the operator stays in this surface). Promotion is a
  **link** to the existing New-Opportunity path — never a direct create.

## Findings — classified

### Proven
- Tenant-scoped queue + record; a cross-tenant / missing id → `notFound()` (404), never a leak.
- Queue renders in the service's **date-driven order**, unmodified; the UI states this and explicitly says
  it is **not** a proprietary score.
- Follow-up urgency (overdue / due-today / scheduled / none) is a deterministic **Computed** value over
  the Observed `nextFollowUpAt`.
- Qualification checklist + progress rendered as **Computed**; Observed facts and **Recommended** promotion
  guidance are visually distinguished (Observed/Computed/Recommended taxonomy).
- Promotion guidance appears **only** where the existing resolver returns it; otherwise an honest
  not-eligible reason. No opportunity is created by this UI.
- Status / disposition / contact-touch mutations run through the **existing** actions with a pending
  state; the actions' own revalidate/redirect refresh the UI.
- Communications shown as **per-channel eligibility STATE** (`commsGate`) with real reasons; no active
  send/dial control is exposed.
- Existing seller ActivityLog timeline reused (no second event history).

### Existing Backend Constraint
- **Queue projection is thin.** `getAcquisitionQueue` returns `{id,name,company,phone,outreachStatus,
  nextFollowUpAt,lastTouchAt}` only. Per-row **qualification completeness** and **promotion eligibility**
  are therefore shown on the **Seller Record** (where the full seller is fetched), not on each queue row —
  surfacing them per-row would require expanding the queue service (a new query), which this increment is
  forbidden to do.
- **Actions return `void` (revalidate/redirect).** A pending state is provided (`useFormStatus`) and the
  UI refreshes after completion, but **granular inline success/error toasts** are not available without
  the existing actions returning structured results — out of scope here (would modify the actions).
- **Contact-touch / disposition swallow invalid input** (no-op / redirect) rather than returning field
  errors, so there is no inline field-error surface to associate; native `required` is used on the
  relevant selects.

### Intentionally Unsupported (this increment)
- No motivation or priority **score** (queue is date-driven).
- No **Next Best Action** selection and no **Missing Information** synthesis beyond the existing
  qualification checklist (that is Increment 5).
- No active communications sending/dialing (comms remains inert; shown as state only).
- No bulk actions (no existing backend bulk action to reuse safely).
- Global-shell **nav wiring is not added** — the queue/record are reachable by route and by the queue↔record
  links; wiring into `workspace-shell.tsx` (or the Command Center) is a later increment, keeping this
  increment additive and leaving the production shell untouched.

### Deferred
- Appointment scheduling — **no appointment/calendar model exists**; follow-up is represented solely by
  the existing `Seller.nextFollowUpAt` field.
- Seller-linked tasks — **`Task` has no `sellerId`** (only `opportunityId`/`ownerId`); no seller task UI.
- Browser-level accessibility/responsive automation — Increment 6 (per the Increment-1 acceptance).

## Accessibility (source-level, per repo convention)

Queue rows are keyboard-reachable `<Link>`s with a visible focus ring; the record's action controls are
labelled; the submit control exposes `aria-busy` while pending; status/urgency are conveyed by text +
tone (never color alone); `sr-only` context is provided. Browser-level automation remains Increment 6.

## Boundaries honored

No motivation/priority score · no Next Best Action · no Missing-Information inference beyond the existing
checklist · no appointment scheduling · no communications redesign · no new APIs/domain models · no schema
change · no tenant-authority change · no opportunity-stage change · no Increment-3+ work · no BE-3 change.

## Stop

Opened for the **UI Milestone 1 Increment 2 Review**. Not to be merged, accepted, tagged, deployed, or
followed by Increment 3 without separate governed authorization.

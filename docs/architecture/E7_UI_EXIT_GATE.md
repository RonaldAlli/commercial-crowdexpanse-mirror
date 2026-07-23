# E7 · UI · Epic Exit Gate

> Implementation of the [E7 UI Design](./E7_UI_DESIGN.md). Pure view-model assembly (the acceptance boundary) + thin
> HTTP adapters + one complete Pipeline screen. UI observational (UI-INV-1..5). Branch `feat/opp-pipeline-e7-ui` off
> `main` (`9ff367c`). Code-only. 2026-07-23.

## What was built (a consumer of frozen contracts — no business logic)

- **`lib/pipeline-view-models/` (pure — AC-VM boundary):** `assemble*` (Opportunity / Activity / ProjectionPanel /
  Timeline / AuthorizationPanel / Validation) → `assemblePipeline` (the presentation `PipelineViewModel`) →
  `toRenderProps` (a **stable** React-props shape). Each domain VM embeds its frozen contract object **unchanged**
  (UI-INV-2/5); deterministic (UI-INV-4). `read.ts` wires the canonical read path (build FactGraph → project →
  assemble) server-side.
- **Thin HTTP adapters:** `GET /api/pipeline/[opportunityId]` (read) and `POST /api/pipeline/[opportunityId]/
  fact-operations` (→ `Coordinator.perform`). Transport validation only; everything after belongs to the
  Coordinator / read assembly (API-INV-1).
- **One complete Pipeline screen:** `app/(workspace)/pipeline/[opportunityId]/page.tsx` (server) + `PipelinePanels`
  (boring client renderer) — panels **Projection · Activity · Decision Timeline · Validation · Authorization · Fact
  Operations**, consuming `PipelineRenderProps`.
- **`scripts/e2e-view-models.mjs`** — `AC-VM-*` (12 assertions).

## Invariants → coverage

| Invariant | AC |
|---|---|
| UI-INV-2/5 · domain VM embeds the contract AS-IS (no reinterpretation) | [1], [6], [7] |
| PR-INV-8 into the UI · stage vs attention separation | [2] |
| UI-INV-4 · view-model determinism | [3] |
| **projection changes ⇒ VM changes ⇒ renderer shape unchanged** | [4] |
| UI never reconstructs · timeline from ordered facts + active set | [5] |
| UI-INV-3 · navigation is presentation state | [8] |

## Gate (clean worktree)

```
Architecture satisfied            ✓  UI consumes contracts (UI-INV-1) · view models not raw objects (UI-INV-2) · deterministic (UI-INV-4) · no mutation (UI-INV-5) · renderer independent of semantics
Acceptance scenarios passing       ✓  AC-VM 12/12 (Law 11)
Full E2E sweep                     ✓  53/53 (all prior epics green)
Build (routes + page)              ✓  build:isolated compiled the HTTP adapters + Pipeline screen into the Next app
Traceability complete              ✓  view model → E7 Design → UI View-Model Contract + API/Projection/Authorization/Error contracts → Decision Log
No constitutional violations       ✓  no business logic in the UI · thin adapters (API-INV-1) · Law 4 (view models disposable)
Ready for next                     ✓  seventh layer complete; React component/Playwright tests are a lower-tier follow-on
```
**Build gate:** `tsc` 0 · e2e 53/53 · AC-VM 12/12 · unit 73 files · `build:isolated` ok.

## Deviations (disclosed)

- **Acceptance targets the pure view-model assembly** (ratified boundary). React components are boring renderers —
  their rendering is covered by the existing Playwright/visual tier, not `AC-VM`.
- **Page reads `organizationId` from `searchParams`** for this first slice (session-wiring is a follow-on); an empty
  org yields a valid LEAD state (no crash). The screen is functionally complete and renders all six panels.
- **HTTP routes are un-authenticated at the route level** for the slice — the `(workspace)` layout/middleware auth
  wraps the page; production wiring of route-level auth is a thin follow-on.

## State

Branch pushed; **NOT merged** (code-only, no migration). Awaiting E7 acceptance → on acceptance, FF-merge. Deploying
the UI to prod (build + release) is a **separate** step (via the D25 deploy engine), never bundled into the merge.

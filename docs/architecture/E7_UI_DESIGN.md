# E7 · UI — Technical Design (ratified w/ refinements; for freeze before implementation)

> The UI is a **consumer** of frozen contracts, not a place where behavior is invented (UI-INV-1). Three layers:
> pure **view-model assembly** (the acceptance boundary), **thin HTTP adapters**, and **boring React renderers**.
> First slice = **one complete Pipeline screen** (Option C). Consumes [UI View-Model Contract](./UI_VIEW_MODEL_CONTRACT.md)
> + API/Projection/Authorization/Error contracts. Founder-ratified w/ refinements 2026-07-23.

```
HTTP route adapters  →  Coordinator.perform / read (build graph → project)      [thin — transport validation only]
View-model assembly  →  Frozen contracts → Domain VMs → PipelineViewModel        [PURE — AC-VM-* acceptance boundary]
React components      →  render PipelineViewModel                                [intentionally boring]
```

## 1. Invariants (UI-INV-1..5)

UI observational (1) · view models not raw subsystem objects (2) · navigation is presentation state, not business
state (3) · view-model determinism — same API response ⇒ same view model, no clock/storage/cache (4) · no contract
mutation — organize/group/format/sort only, never rewrite/reinterpret/infer/synthesize (5).

## 2. View-model assembly (pure — the acceptance boundary)

`lib/pipeline-view-models/`: deterministic functions mapping frozen contracts → **Domain view models** → the
**Presentation** `PipelineViewModel`. Each domain VM embeds its contract object **unchanged** (UI-INV-2/5).

```
assembleOpportunity(projection)        → OpportunityViewModel   { stage, completeness, versions, projection(AS-IS) }
assembleActivity(projection)           → ActivityViewModel      { indicators, labels } (attention — never stage)
assembleProjectionPanel(projection)    → ProjectionPanelViewModel { frontier[], inconsistencies[], projection(AS-IS) }
assembleTimeline(orderedFacts)         → TimelineViewModel      { entries[] } (from the API read; UI never reconstructs)
assembleAuthorizationPanel(decision?)  → AuthorizationPanelViewModel { allow, denyCodes[], explanation(AS-IS) }
assembleValidation(apiError?)          → ValidationPresentation { category, httpStatus, subsystemCode, message }
assemblePipeline({...}) → PipelineViewModel { opportunity, projectionPanel, activity, timeline, authorization?, validation?, navigation }
```

`toRenderProps(pvm)` maps the `PipelineViewModel` → the React component's props — a **stable** boundary: the props
*shape* does not change when business semantics change (only the values do). Navigation (`{ tabs, activeTab }`) is
presentation state carried in the VM (UI-INV-3).

## 3. Thin HTTP adapters

- `GET  /api/pipeline/[opportunityId]` → read assembly (build FactGraph → project → `assemblePipeline`) → JSON.
- `POST /api/pipeline/[opportunityId]/fact-operations` → validate DTO → `Coordinator.perform` → JSON
  (`FactOperationResponse`; on `DENIED`/`STALE`, the `ApiError` → `ValidationPresentation`).
The route validates **transport** concerns only; everything after DTO validation belongs to the Coordinator / read
assembly (API-INV-1).

## 4. The Pipeline screen (one complete screen — the canonical consumer)

`app/(workspace)/pipeline/[opportunityId]/page.tsx` renders `PipelineViewModel` panels:
**Projection · Activity · Decision Timeline · Validation · Authorization · Fact Operations.** Every panel already
exists in the architecture — nothing new is invented. Components receive immutable presentation view models and
render them (boring).

## 5. Acceptance (AC-VM-*) — the deterministic boundary

- Each domain VM embeds its contract object **byte-identical** (UI-INV-2/5) and applies only labels/order.
- `stage` (opportunity) and attention (activity) stay **separate** (PR-INV-8 carried into the UI).
- **Determinism** (UI-INV-4): same input ⇒ same `PipelineViewModel`.
- **Projection changes ⇒ view model changes ⇒ renderer unchanged**: two different `ProjectionResult`s yield two
  different VMs, but `toRenderProps` has the **same shape** for both — the renderer is independent of business
  semantics.
- Validation: an `ApiError` maps to a `ValidationPresentation` preserving `category`/`httpStatus`/`subsystemCode`.

React component tests (rendering) and Playwright (integration) are separate, lower-tier concerns — not the AC-VM
boundary.

## 6. Boundaries / traceability

No business logic in the UI (UI-INV-1). No raw subsystem objects in components (UI-INV-2). No navigation-driven
semantics (UI-INV-3). Deterministic (UI-INV-4). No contract mutation (UI-INV-5). `view model → this design → UI
View-Model Contract + API/Projection/Authorization/Error contracts → Decision Log`.

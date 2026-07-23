# UI View-Model Contract **v1.0** (FROZEN, pre-E7)

> **What this freezes:** the presentation view models the UI (E7) renders — assembled **only** from the frozen API /
> subsystem contracts, never re-derived. The UI is **observational** (UI-INV-1): it renders canonical outputs and
> holds no business behavior. Frozen before E7, like every layer. Consumes [API](./API_CONTRACT.md) /
> [Error](./API_ERROR_CONTRACT.md) / [ProjectionResult](./PROJECTION_RESULT_CONTRACT.md) /
> [AuthorizationDecision](./AUTHORIZATION_DECISION_CONTRACT.md). 2026-07-23.
>
> **Change discipline:** `Code → Architecture → Specification → Business Decision`. Breaking ⇒ major bump; additive ⇒
> minor. View models are **derived and disposable** (Law 4) — never a source of truth.

---

## 1. Invariants

- **UI-INV-1 · UI is observational.** The UI **never** derives business truth, evaluates predicates, authorizes,
  projects stages, classifies migration, or infers workflow. Flow: `UI → API → { ProjectionResult / AuthorizationDecision /
  timeline / ApiError } → view model → render`. It consumes canonical responses exactly as they are.
- **UI-INV-2 · View models, not raw subsystem objects.** The UI consumes **stable view models**; it never reaches
  into subsystem internals (a `PipelineFact` row, a `TraceNode`, a graph). A view model is a *presentation shaping*
  of a frozen contract object — it re-labels and arranges, it never reinterprets (mirrors AUTH-INV-13 / PR-INV-7).
- **UI-INV-3 · Navigation is presentation-only.** `Opportunity → Tabs → Panels` is a display structure, independent
  of business semantics. **Navigation is presentation state, not business state** — changing tabs never changes
  projection, authorization, facts, or evaluation, and vice versa.
- **UI-INV-4 · View-model determinism.** The same API response always produces the same view model — no client
  clock, local storage, browser state, or hidden cache may influence assembly (mirrors the determinism discipline
  of every layer below).
- **UI-INV-5 · No contract mutation.** The UI may **organize / group / format / sort**; it may **never** rewrite,
  reinterpret, infer, or synthesize the frozen contracts (mirrors AUTH-INV-13 / PR-INV-7).

## 2. View models (assembled from frozen contracts)

| View model | Assembled from | Renders |
|---|---|---|
| **OpportunityViewModel** | `ProjectionResult` (+ opportunity identity) | headline `stage`, `completeness`, top indicators, version stamps |
| **TimelineViewModel** | API read of ordered fact history (`globalSequence`) | chronological fact-chain lineage (supersession as linked entries); **read-only, from the API — the UI never reconstructs** |
| **ActivityViewModel** | `ProjectionResult.indicators` / `labels` / `derivedFacts` | the operational-attention feed (e.g. `NEEDS_REVIEW`, `BLOCKED_ON_EVIDENCE`) — attention, never stage |
| **ProjectionPanelViewModel** | `ProjectionResult` (incl. `frontier`, `inconsistencies`) AS-IS | the stage frontier + inconsistencies, explained by the embedded artifacts |
| **AuthorizationPanelViewModel** | `AuthorizationDecision` (from a what-if / attempted `FactOperationResponse`) | `allow` / `denyCodes` + the preserved `explanation` (why permitted/denied) |
| **ValidationPresentation** | `ApiError` (`category` / `httpStatus` / `subsystemCode`) | user-facing message per the six categories — **never a new business code**, only presentation of the frozen one |

Every view model **embeds or references** the frozen contract object unchanged; assembly only selects, labels, and
orders for display (UI-INV-2).

### 2a. Two view-model tiers (Domain → Presentation)

A seam so presentation can change without touching contracts:

```
Frozen contract  →  Domain View Model      →  Presentation View Model  →  React props
(ProjectionResult)   (OpportunityViewModel…)   (PipelineViewModel)          (component input)
```

- **Domain view models** shape a *single* frozen contract for display (the table above), embedding it unchanged.
- **Presentation view models** (e.g. **`PipelineViewModel`**) compose the domain view models into a screen's worth
  of panels — still derived, still disposable. React components consume **presentation** view models only, never a
  raw subsystem object. If presentation needs to change, it changes the presentation tier — the domain tier and the
  contracts are untouched.

## 3. Separation preserved

`stage` (OpportunityViewModel) vs attention (ActivityViewModel) stay distinct (PR-INV-8 carried into the UI). The
AuthorizationPanel presents *permission*; the ProjectionPanel presents *state*; the ValidationPresentation presents
*transport outcomes*. None derives the others.

## 4. Boundaries / traceability

No business logic in the UI (UI-INV-1). No raw subsystem objects in components (UI-INV-2). No navigation-driven
semantics (UI-INV-3). View models are disposable/reconstructable (Law 4). `View model → this contract → API /
Projection / Authorization / Error contracts → Decision Log`. E7 assembles these from `perform` responses + read
endpoints; components render them.

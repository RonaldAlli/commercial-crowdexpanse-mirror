# UI Milestone 2 — Increment 4 Report: Opportunity Workspace Integration + Milestone Verification + Discoverability

> **Status: IMPLEMENTED — awaiting review.** Governed decision "M2 Increment 4 — APPROVED TO IMPLEMENT"
> (only Increment 4 — the FINAL implementation increment for Milestone 2). Additive, read-only, off `main`
> `c5b5304`. **No merge, no acceptance, no deployment, no Milestone 2 release.**

## Plain statements (as required)

- **Milestone 2 integration complete** — Guided Underwriting is now reachable from the Opportunity Workspace,
  completing the operator journey Opportunity → Guided Underwriting → Advanced Analysis.
- **Executive Summary preserved** · **Information Quality preserved** · **Decision Chronology preserved** —
  no earlier-increment behavior changed (regression green).
- **Opportunity integration completed** via the existing cross-link mechanism (no new orchestration).
- **`/analyzer` remains authoritative** for editing, comparison, and advanced workflows.
- **No underwriting authority changed** — no schema, API, engine, recommendation, or decision logic changes.

## What was built (files)

Product: `app/(workspace)/opportunity-workspace/[id]/page.tsx` — a read-only underwriting-existence check
(`prisma.underwriting.findUnique … activeScenarioId`) and a **"Guided underwriting" cross-link** prepended to
the existing cross-link list (available → `/guided-underwriting/[id]`; honestly **"Not started"** and
non-linked when no active scenario exists). Tests: extended `cre-workspace-guided-underwriting.spec.ts`
(Increment-4 discoverability, honest-unavailable, full section order, accessibility, tablet responsive; added
a `TABLET` viewport). **No changes** to `prisma/schema.prisma`, `app/api/*`, `lib/underwriting*`,
`/analyzer`, the NBA synthesis, navigation, or the underwriting engine.

## Integration decisions

- **Entry point:** reused the Opportunity Workspace's existing `crossLink` mechanism — no new component, no
  new orchestration service. Prominent (first cross-link) yet honest when underwriting has not started.
- **Next Best Action:** the existing `synthesizeOpportunity` authority makes **no reference to underwriting**,
  so — per the authorization — existing NBA behavior was **preserved**; no new action was synthesized.
- **Navigation philosophy preserved:** no top-level nav entry added. Guided Underwriting remains part of the
  Opportunity workflow, reached via the Opportunity Workspace and deep links — consistent with the established
  "part of a workflow, not a standalone product" principle.

## Workspace contract (unchanged order, verified)

Executive Structurability Summary → Missing Information → Why Recommended → Decision History → Supporting
Metrics → Advanced Analysis. Section order asserted in the browser (desktop + tablet).

## Classification

### Proven
- **Discoverability / workflow continuity:** Opportunity Workspace → Guided Underwriting → Advanced Analysis
  round-trip (browser-clicked; no dead ends, no loops).
- **Honest entry:** an opportunity with no active underwriting shows the label but **no link** ("Not started").
- **Complete section order** verified (5 headings, y-ascending).
- **Accessibility:** exactly one `h1`; section headings at level 2; `main` landmark present; the analyzer
  handoff is keyboard-focusable. (Built on the M1 a11y primitives — sr labels, semantic lists, focus-visible,
  break-words wrapping for provenance / rationale / decision history.)
- **Responsive:** no horizontal overflow at desktop (1440), tablet (768), or mobile (390); order maintained.
- **Milestone verification:** Playwright **28/28** — Increment 4 + Increment 3 + Increment 2 + Increment 1 +
  Milestone 1 + navigation, all green. app `tsc` 0 · ESLint clean · unit suite PASS.

### Existing Backend Constraint
- The existing NBA authority does not model an "underwriting review" action; surfacing one would require new
  NBA authority, so it was intentionally **not** added (existing behavior preserved).
- Underwriting availability is surfaced via a read-only existence check (`activeScenarioId`), reusing existing
  authority — no new orchestration or workflow engine.

### Deferred
- Milestone 2 review, acceptance, and release (each a separate governance decision; no deployment authorized).

## Stop conditions — none triggered
No schema, API, new workflow service, underwriting-engine, analyzer, recommendation/decision synthesis, or
deployment work was required.

## Milestone status
With Increment 4, **UI Milestone 2 (Guided Underwriting) is feature-complete across all four increments** and
prepared for a milestone-level review. Boundaries honored: only Increment 4 implemented; no merge, acceptance,
deployment, or Milestone 2 release. Next: review.

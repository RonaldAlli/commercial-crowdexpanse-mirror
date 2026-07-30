# UI Milestone 2 — Increment 1 Report: Guided Underwriting — Scenario Result Workspace

> **Status: IMPLEMENTED — awaiting review.** Governed decision "M2 Increment 1 — APPROVED TO IMPLEMENT"
> (only Increment 1). Off released baseline `main` (post-M1). Additive, read-only. **No merge, no acceptance,
> no deployment, no Increment 2 work.**

## Plain statements (as required)

- **`/analyzer/[opportunityId]` remains authoritative** for advanced underwriting work; this workspace never
  duplicates its editing/compare capabilities — it deep-links out to it ("Advanced analysis").
- **The workspace is read-only.** No writes, no scenario create/edit, no assumption/financing writes, no
  `recordUnderwritingDecision`, no approval actions.
- **The existing engine is reused.** All values come from the existing read service `getActiveScenarioResult`
  (already-persisted `ScenarioResult` / `ScenarioRecommendation` / `ScenarioFinding` / primary
  `FinancingCaseResult`). No new calculation; no duplicated underwriting engine.
- **No underwriting authority changed.** No schema, no API, no permission changes, no engine modification.

## What was built (files)

New (product): `lib/workspace-ui/guided-underwriting.ts` (pure view-model), `components/workspace-ui/
guided-underwriting/GuidedUnderwritingWorkspace.tsx` (presentational, read-only), `app/(workspace)/
guided-underwriting/[opportunityId]/page.tsx` (server route, tenant-scoped, `notFound()` on miss). New
(tests): `tests/unit/workspace-ui/guided-underwriting.test.ts` (8 pure-logic tests), `tests/visual/
cre-workspace-guided-underwriting.spec.ts` (6 browser specs). Test fixtures: extended `tests/visual/seed.mjs`
(added a persisted `ScenarioResult` + `ScenarioRecommendation` + decisive `ScenarioFinding` to the active
opportunity — test-only, no runtime impact). Test robustness: `tests/visual/cre-workspace-nav.spec.ts`
(hardened a pre-existing mobile-drawer assertion against CSS-transition timing — behavior-neutral).

**No changes** to `lib/underwriting*`, `prisma/schema.prisma`, `app/api/*`, `lib/permissions.ts`, or
`components/workspace-shell.tsx`.

## Refinement implemented

Leads with an **Executive Structurability Summary** answering "Can we structure this deal?" first:
**Structurable: Yes / Conditional / No** (a 1:1 presentation mapping of the persisted engine
`RecommendationLevel`; "Not yet assessed" when none exists — never fabricated) · **Primary constraint** (the
top decisive persisted finding) · **Engine recommendation** (existing output). Supporting metrics (NOI, cap
rate, DSCR, sized debt, levered IRR) render beneath it, each honestly "Not available" when absent.

## Classification

### Proven
- Tenant-scoped lookup; foreign/unknown id → **404** (browser-verified).
- Existing scenario renders: structurability verdict + engine recommendation + primary constraint +
  supporting metrics, all from persisted outputs (browser + unit verified).
- **Honest empty state** when no underwriting exists ("Underwriting has not yet been started"); **no
  fabricated verdict or metrics** (asserted: zero "Structurable:" / metric strings on the empty opportunity).
- Observed/Computed/Recommended taxonomy applied per section.
- Analyzer **deep-link** present, correct `href=/analyzer/[id]`, keyboard-reachable.
- Read-only proven: no writes issued; pure view-model has no data access/clock/random.
- No duplicated calculations: values are a straight presentation of `getActiveScenarioResult`.
- Accessibility: single `h1`; structurability meaning carried by text + `sr-only` sentence (never
  color-only); semantic `<dl>` metrics; focus-visible deep-link; mobile (390px) no horizontal overflow.
- Verification: app `tsc` 0 · ESLint clean · unit **suite PASS** (incl. 8 new) · Playwright **19/19**
  (6 new + 8 M1 + 5 nav regression).

### Existing Backend Constraint
- A scenario may carry a financing-case result but **no operating result / recommendation / findings**
  (e.g. the seeded active scenario before this increment added them). The workspace reflects this honestly
  ("Not yet assessed", "Not available") — it does not compute the missing pieces (that is the analyzer's /
  engine's job). Percentages (cap rate, IRR) are stored as percent-numbers per the existing display
  convention.
- `getActiveScenarioResult` also returns `assumptions`, `lineItems`, `sensitivity`, and `decisions`.
  These are **intentionally not surfaced** here (assumptions → Increment 2; decisions → Increment 3).

### Deferred
- Missing-assumption synthesis (Increment 2).
- Decision history, decision contrast, approval history, and any write/approval action (Increment 3 /
  future — kept read-first per the accepted plan).
- Global-nav discoverability entry for the workspace (Increment 4).

## Stop conditions — none triggered
No new calculation, schema, API, write path, scenario editing, approval write, engine modification, or
analyzer replacement was required. Increment 1 was implementable entirely on existing read authority.

## Boundaries honored
Only Increment 1 implemented. No merge, acceptance, deployment, or Increment 2 work. Next: review.

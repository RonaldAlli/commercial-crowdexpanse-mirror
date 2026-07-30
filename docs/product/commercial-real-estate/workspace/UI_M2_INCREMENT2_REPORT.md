# UI Milestone 2 — Increment 2 Report: Missing Assumption Synthesis + Provenance

> **Status: IMPLEMENTED — awaiting review.** Governed decision "M2 Increment 2 — APPROVED TO IMPLEMENT"
> (only Increment 2). Additive, read-only, off `main` `f5272fa`. **No merge, no acceptance, no deployment,
> no Increment 3 work.**

## Plain statements (as required)

- **Executive Structurability Summary preserved** — it remains the first thing the operator sees; the
  missing-information section is rendered *beneath* it (order asserted in the browser test). The summary is
  only *enriched* with an input-completeness line, never replaced.
- **`/analyzer` remains authoritative** — assumptions are edited there; this workspace is read-only and
  deep-links out.
- **Provenance is reused, never inferred** — `source` / `sourceField` / `sourceAsOf` are read verbatim from
  the persisted rows; when absent it is stated honestly ("not recorded" / "No value on file").
- **Assumptions remain read-only** — no create/update/delete, no `recordUnderwritingDecision`.
- **No underwriting authority changed** — no schema, API, engine, or recommendation-level change; existing
  findings are not reinterpreted.

## What it answers

*"What information is preventing this deal from being fully underwritten?"* — by classifying the existing
assumption set into the accepted four-state model, grouped by operational category, with provenance.

## What was built (files)

New (product): `lib/workspace-ui/guided-underwriting-assumptions.ts` (pure four-state synthesis),
`components/workspace-ui/guided-underwriting/MissingAssumptionsPanel.tsx` (presentational, reuses the accepted
`MissingInfoBadge`). Extended additively (Increment-1 files, behavior preserved): `GuidedUnderwritingWorkspace.tsx`
(optional `assumptions` prop → renders the panel after the summary + a completeness line) and the route
`page.tsx` (builds the view from the same `getActiveScenarioResult` data). Tests: new unit
`guided-underwriting-assumptions.test.ts` (7 cases); extended `cre-workspace-guided-underwriting.spec.ts`
(Increment-2 desktop + mobile). Test fixtures: extended `tests/visual/seed.mjs` (added `UnderwritingAssumption`
rows — one complete, one incomplete-provenance — and a `FinancingAssumption`; test-only). **No changes** to
`prisma/schema.prisma`, `app/api/*`, `lib/underwriting*`, `lib/permissions.ts`, `/analyzer`, or the
recommendation/findings logic.

## Grounding (no invention)

- **Expected keys & operational groups** come from the engine's own `lib/underwriting/assumptions.ts`
  (`ASSUMPTION_KEYS`, `PROJECTION_ASSUMPTION_KEYS`, `CAPITAL_ASSUMPTION_KEYS`, `isCapitalKey`): *Core
  underwriting inputs* / *Projection* / *Debt & capital*. The refinement (group by category) is satisfied by
  existing metadata — no categories were invented. (Had no reliable grouping existed, the fallback was a flat
  list.)
- **Labels** mirror the existing analyzer key→label map.
- **"Missing"** = an expected key with no persisted row. **PURCHASE_PRICE** is the engine's only hard
  precondition (`assumptionsToAnalysisInputs` / `validateAssumptions`), so a missing PURCHASE_PRICE is the one
  **blocking** gap; all others degrade (map to null), not block.

## Classification

### Proven
- Four states preserved and **distinct** (missing / incomplete / conflicting / unavailable) — not collapsed.
- Grouping by existing key-sets (Core / Projection / Debt & capital).
- Provenance rendering (source / field / as-of) for present values; **honest absence** for missing/unavailable
  (never fabricated).
- Missing PURCHASE_PRICE flagged as the sole **blocking** gap.
- Executive Structurability Summary **remains first** (DOM-order asserted); completeness only enriches it.
- Honest empty state (missing-info section absent when there is no underwriting).
- Read-only (no writes); `/analyzer` unchanged; taxonomy preserved (Observed/Computed/Recommended).
- Accessibility: `MissingInfoBadge` carries text + `sr-only` meaning (not color-only); group headings;
  provenance readable and wrapping on mobile; no horizontal overflow at 390px.
- Verification: app `tsc` 0 · ESLint clean · unit suite PASS (7 new) · Playwright **21/21** (Increment 2 +
  Increment 1 + M1 + nav regression).

### Existing Backend Constraint
- **"Conflicting" is preserved but currently has no per-assumption source of truth.** The engine exposes no
  per-assumption conflict detector (`validateAssumptions` only enforces PURCHASE_PRICE > 0), so the state is
  kept available in the model but is **not fabricated** — it would only be assigned if existing data disagreed.
- **"Incomplete"** is grounded as a present value whose provenance is partial (`sourceField`/`sourceAsOf`
  absent) — an honest reading of the existing provenance fields, not a value judgement.
- **Capital assumptions** live on the `FinancingCase` (`FinancingAssumption`); the Debt & capital group reads
  the primary financing case, and is **Unavailable** when no financing case exists (structurally can't evaluate).

### Deferred
- Decision surfacing / decision contrast / approval history (Increment 3).
- Opportunity-Workspace integration + accessibility pass + discoverability (Increment 4).
- Any assumption editing/writing (remains in `/analyzer`).

## Stop conditions — none triggered
No new assumption categories, provenance fields, recommendation synthesis, schema, APIs, write paths, analyzer
modification, or underwriting-engine changes were required.

## Boundaries honored
Only Increment 2 implemented. No merge, acceptance, deployment, or Increment 3 work. Next: review.

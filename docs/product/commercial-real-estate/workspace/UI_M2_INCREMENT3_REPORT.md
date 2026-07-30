# UI Milestone 2 — Increment 3 Report: Decision Contrast + Approval History (Read-First)

> **Status: IMPLEMENTED — awaiting review.** Governed decision "M2 Increment 3 — APPROVED TO IMPLEMENT"
> (only Increment 3). Additive, read-only, off `main` `6b73da6`. **No merge, no acceptance, no deployment,
> no Increment 4 work.**

## Plain statements (as required)

- **Executive Structurability Summary preserved** — still first; the new sections render *beneath* the
  summary and the missing-information section (order asserted: Summary → Missing info → Why recommended →
  Decision history).
- **`/analyzer` remains authoritative** — decisions are recorded there; this workspace is read-only.
- **Engine recommendation reused** — displayed from the persisted `ScenarioRecommendation`; never recalculated.
- **Decision history reused** — the persisted `UnderwritingDecision` records (decision, timestamp, actor,
  rationale, engine-suggested-at-time) are displayed as an append-only timeline.
- **No approval authority added** — no approval/decision controls, no write actions, no workflow change.
- **No underwriting authority changed** — no schema, API, engine, recommendation, or findings changes.

## What it answers

*"Why does the engine recommend this, and what decision history already exists?"* — a "Why is this
recommended?" section (engine recommendation + persisted findings) and a "Decision history" section (the
human decision timeline + a factual Agreement / Override / Awaiting-decision status).

## What was built (files)

New (product): `lib/workspace-ui/guided-underwriting-decision.ts` (pure contrast/history synthesis),
`components/workspace-ui/guided-underwriting/DecisionContrastPanel.tsx` (presentational). Extended additively
(behavior preserved): `GuidedUnderwritingWorkspace.tsx` (optional `decision` prop → renders the panel after
missing-info) and the route `page.tsx` (builds the view from the same `getActiveScenarioResult` data + a
single read-only user lookup to resolve actor names). Tests: new unit
`guided-underwriting-decision.test.ts` (10 cases — full contrast matrix); extended
`cre-workspace-guided-underwriting.spec.ts` (Increment-3 desktop + mobile; and disambiguated two earlier
assertions now that the recommendation/finding legitimately appear in both the summary and the new "why"
section). Test fixtures: extended `tests/visual/seed.mjs` (a recorded `UnderwritingDecision` — test-only).
**No changes** to `prisma/schema.prisma`, `app/api/*`, `lib/underwriting*`, `lib/permissions.ts`, or `/analyzer`.

## Contrast status — derived from records only (no inferred intent, no correctness judgement)

The `UnderwritingDecision` persists `suggestedLevel` (the engine recommendation captured at decision time)
alongside the human `decision`, so the contrast is read from the records:
- no decision records → **Awaiting decision**;
- latest decision `APPROVED` + engine positive (PROCEED / PROCEED_WITH_CONDITIONS), or `DECLINED` + `PASS`
  → **Agreement**;
- latest decision opposing the engine → **Override**.

## Classification

### Proven
- Engine recommendation displayed from persisted authority (no recalculation).
- Human decision records displayed (decision · timestamp · actor · rationale · engine-suggested-at-time).
- Contrast status derived from records; Agreement case browser-verified (seed: APPROVED vs PROCEED_WITH_CONDITIONS).
- Findings shown in **persisted position order** — not reordered, reinterpreted, or created.
- Approval history is a read-only timeline — no controls.
- Honest empty states (no recommendation / no decision) — sections absent, never fabricated.
- Executive Summary remains first; analyzer deep-link unchanged; read-only (no writes).
- Accessibility: contrast status carries a `sr-only` sentence (not color-only); decision timeline ordered;
  long rationale wraps; mobile readable, no overflow.
- Verification: app `tsc` 0 · ESLint clean · unit suite PASS (10 new) · Playwright **23/23** (Increment 3 +
  Increment 2 + Increment 1 + M1 + nav regression).

### Existing Backend Constraint
- The human `UnderwritingDecisionLevel` (APPROVED / DECLINED / DEFERRED) and engine `RecommendationLevel`
  (PROCEED / PROCEED_WITH_CONDITIONS / PASS) are **distinct enums**, so alignment uses an explicit
  positive/negative correspondence (APPROVED ↔ engine-positive; DECLINED ↔ PASS). This is a factual alignment,
  not a judgement of who is correct.
- Two honest edge states beyond Ronald's three: **Deferred** (a `DEFERRED` record is a recorded hold, not a
  clean agree/override) and **Recorded** (a decision exists but there is no engine level to compare) — both
  derived from records, never fabricated.
- Actor display names resolved via a single read-only, tenant-scoped user lookup.

### Deferred
- Any approval action / decision write (remains in `/analyzer`; read-first only).
- Increment 4: Opportunity-Workspace integration + accessibility pass + discoverability.

## Stop conditions — none triggered
No approval actions, decision writes, schema, APIs, recommendation recalculation, engine modification, or
analyzer modification were required.

## Boundaries honored
Only Increment 3 implemented. No merge, acceptance, deployment, or Increment 4 work. Next: review.

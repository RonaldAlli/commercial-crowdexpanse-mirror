# Closing Workspace — Increment 3 Report: Timeline + Closing History (Read-First)

> **Status: IMPLEMENTED — awaiting review.** Governed decision "Closing Workspace — Increment 3 — APPROVED TO
> IMPLEMENT" (only Increment 3). Additive, read-only, off `main 2372f75`. **No merge, no acceptance, no
> Increment 4 work, no deployment.**

## Plain statements (as required)

- **Executive Summary preserved** — first; the timeline is placed AFTER current-state and next-step (order asserted).
- **Domain Progression preserved** — timeline entries carry the existing category/domain label in one unified
  chronological sequence (no separate domain timelines, no regrouping that breaks order).
- **Closing Confidence preserved** — the timeline shows the evidence trail; current readiness remains
  authoritative in the Executive Summary (events alone are never presented as proof of readiness).
- **Operational Accountability preserved** — actors shown where recorded ("System" when unattributed); never inferred.
- **Decision Chronology preserved** — history is chronological and append-only in presentation (the reused
  panel enforces the deterministic ordering + tie-break; nothing is reordered).
- **Closing Console remains authoritative** — no timeline actions, no editing controls.
- **No closing authority changed** — no schema, API, event generation, workflow, or write.

## What was built (files)

Extended additively (no new view-model — pure reuse): `app/(workspace)/closing-workspace/[opportunityId]/
page.tsx` (accepts `tlorder`/`tlpage` searchParams, calls the existing `getOpportunityTimeline`, passes the
timeline down) and `components/workspace-ui/closing/ClosingWorkspace.tsx` (a "What has happened so far?" section
that renders the **existing `TransactionTimelinePanel` verbatim**). Tests: extended
`cre-closing-workspace.spec.ts` (Increment-3 desktop). **No changes** to schema, API, services, the timeline
module, or the panel; Increments 1 & 2 view-models are byte-unchanged.

## Reuse (no duplicated timeline logic)

The entire timeline behavior is the existing authority: `getOpportunityTimeline` (org-scoped, chronological,
paginated, deterministic in-page tie-break TL-3) → `TransactionTimelinePanel`, which already renders per entry:
the recorded **title** (never synthesized, TL-10), a **category/domain** badge, **detail**, **timestamp**,
**actor** ("System" when unattributed), and the **evidence reference link** when one exists (SnapshotReference,
TL-11). Increment 3 adds **zero** timeline logic — it only positions the reused panel under the operator-framed
"What has happened so far?" heading, after current-state and next-step.

## Refinement — event evidence

Satisfied by reuse: the panel renders `entry.reference` (a concrete record/document/artifact link) only when
the existing timeline authority exposes it — so the operator distinguishes a recorded event from the evidence
behind it. No links are created that do not already exist.

## Classification

### Proven
- Timeline placed after current-state + next-step; Executive Summary remains first (order asserted).
- Reused `TransactionTimelinePanel` + `getOpportunityTimeline` verbatim (chronological, paginated,
  actor-resolved, evidence-referenced) — no duplication.
- Honest empty history (section renders; no fabricated entries).
- Chronological order preserved (Decision Chronology); category/domain label in the unified sequence.
- Read-only; Closing Console deep-link retained; no timeline actions.
- Accessibility: operator-framed `h2` + the panel's semantic list/timestamps/actor; responsive
  desktop/tablet/mobile, no overflow (long event details wrap via the reused panel).
- Verification: app `tsc` 0 · scripts `tsc` clean · ESLint clean · unit PASS (regression) · Playwright
  **107/107** (Closing Workspace Inc 1–3 + full regression).

### Existing Backend Constraint
- "Closing history" is a view over the existing **transaction/opportunity timeline** (closing + escrow /
  financing / assignment / stage events). Domain attribution, actor resolution ("System"), evidence
  references, ordering and pagination are exactly what the existing `TimelineEntry` / panel expose — surfaced
  as-is, invented nowhere.

### Deferred
- Increment 4: Opportunity-Workspace integration + accessibility pass + discoverability.

## Stop conditions — none triggered
No schema, API, event-generation logic, workflow, write authority, timeline recalculation, or Closing-Console
modification was required.

## Boundaries honored
Only Increment 3 implemented. No merge, acceptance, deployment, or Increment 4 work. Next: review.

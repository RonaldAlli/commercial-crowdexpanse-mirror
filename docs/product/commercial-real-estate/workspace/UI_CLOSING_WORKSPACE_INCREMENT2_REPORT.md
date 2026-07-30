# Closing Workspace — Increment 2 Report: Blocker Detail + Ownership + Next Milestone

> **Status: IMPLEMENTED — awaiting review.** Governed decision "Closing Workspace — Increment 2 — APPROVED TO
> IMPLEMENT" (only Increment 2). Additive, read-only, off `main b52eb5d`. **No merge, no acceptance, no
> Increment 3 work, no deployment.**

## Plain statements (as required)

- **Executive Summary preserved** — the verdict remains first; Increment 2 enriches the blockers section and
  adds "What happens next?", it does not replace the summary (order asserted).
- **Domain Progression preserved** — the four domain panels are unchanged; blocker detail *reinforces* them
  (operational-domain blockers shown separately from checklist owner groups).
- **Closing Confidence preserved** — checklist evidence, operational-domain evidence, and ownership evidence
  are kept distinct.
- **Closing Console remains authoritative** — `/opportunities/[id]` executes owner assignment / due dates /
  resolution; this workspace is read-only and deep-links to it.
- **Blocker ownership reused** — owner names resolved from existing authority (one org-scoped query, no N+1),
  never inferred.
- **No closing authority changed** — no schema, API, workflow, write, owner-assignment logic, or milestone
  generation.

## What was built (files)

New (product): `lib/workspace-ui/closing-blockers.ts` (pure enrichment view-model). Extended additively
(Increment-1 files, verdict/domains/summary preserved): `ClosingWorkspace.tsx` (owner-grouped blocker detail +
"What happens next?" milestone section, behind optional props) and the route `page.tsx` (owner resolution +
next-milestone via existing `milestoneCandidates`/`selectNextMilestone`). Tests: new unit
`closing-blockers.test.ts` (6 cases); extended `cre-closing-workspace.spec.ts` (Increment-2 desktop). Test
fixture: `tests/visual/seed.mjs` assigns an owner to one `active` blocker (no due-date change → no milestone
impact). The Increment-1 view-model `closing-workspace.ts` is **byte-unchanged**. No schema/API/service change.

## Read surface (existing authority only)

`blockingItems(checklist.items)` (persisted order) carrying `ownerId` + `dueDate`; owner names via one
`prisma.user.findMany`; next milestone via existing `milestoneCandidates` + `selectNextMilestone(now)`
(candidates: Target close, escrow deadlines, PENDING item due dates). Non-materialising reads preserved from
Increment 1.

## Ownership clarity (refinement)

Checklist blockers are **grouped by owner**, so the operator immediately sees whether one person owns multiple
blockers (one group, N items), multiple owners each own some (multiple groups), or ownership is unknown
("Unassigned" / "Owner on record — name unavailable"). Grouping uses only persisted ownership records — no
inference of organisational responsibility.

## Classification

### Proven
- Executive Summary first; "Primary blockers" then "What happens next?" (order asserted).
- Blocker detail: title · status · owner · due date · originating domain — existing only, persisted order, no
  reprioritisation, no synthesised severity.
- Ownership resolved from existing authority; honest **Unassigned** and **owner-on-record-but-unresolved**
  states; owner grouping delivers the clarity refinement.
- Domain blockers separate from checklist owner groups (Domain Progression reinforced).
- Next milestone reused; **overdue** shown when already derived; honest "No upcoming milestone recorded".
- Read-only (no writes); Closing Console deep-link.
- Accessibility: owner grouping with headings, owner/due readability, break-words for long owner/milestone
  names; responsive desktop/tablet/mobile, no overflow.
- Verification: app `tsc` 0 · scripts `tsc` clean · ESLint clean · unit PASS (6 new) · Playwright **105/105**
  (Closing Workspace Inc 1+2 + full regression, no pollution from the owner seed).

### Existing Backend Constraint
- Operational-domain blockers (escrow / financing / assignment) carry **no checklist-style internal owner**
  (`ownerId` exists only on checklist items), so they are shown distinctly **without** an owner — honest, not
  inferred.
- Milestone deadline candidates come from Target close, escrow (earnest/contingency) and PENDING item due
  dates only; financing/assignment date fields are historical stamps (existing `milestoneCandidates`
  behavior), so those domains contribute status, not deadlines.

### Deferred
- Timeline (Increment 3).
- Opportunity-Workspace integration + discoverability (Increment 4).

## Stop conditions — none triggered
No schema, API, workflow, write authority, owner-assignment logic, milestone generation, or Closing-Console
modification was required.

## Boundaries honored
Only Increment 2 implemented. No merge, acceptance, deployment, or Increment 3 work. Next: review.

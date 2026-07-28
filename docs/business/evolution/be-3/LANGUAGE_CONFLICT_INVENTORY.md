# BE-3 — Language Conflict Inventory (planning)

> **Status: PLANNING — for review.** This inventory does **not** discover vocabulary from scratch — the
> authoritative harvest already exists in `../../LANGUAGE_CONFLICT_REPORT.md` (Passes 2–4) and is
> resolved in `../../3_LANGUAGE_SPECIFICATION.md`. This document is the **BE-3-scoped filter** of that
> report: the deviations BE-3 is chartered to close, measured against `CANONICAL_GLOSSARY.md`. No
> renames, no code/schema/surface changes.

## Relationship to existing records

- **Oracle:** `CANONICAL_GLOSSARY.md` → `3_LANGUAGE_SPECIFICATION.md §2` (frozen canonical words).
- **Full deviation harvest:** `LANGUAGE_CONFLICT_REPORT.md` (all nine concepts, aliases + homonyms,
  every `file:line`). BE-3 does not re-run this; it **selects** the "Retire via BE-3" subset.
- This inventory is therefore a *narrowing view*, not a new source of truth.

## BE-3 deviation register (the six + Lead-surface)

Each entry is a deviation from the frozen vocabulary that BE-3 must close. Evidence is carried from the
Conflict Report / Spec §3; it is **indicative and to be re-confirmed at implementation**, not acted on here.

| ID | Deviation (as it appears) | Canonical target | Class | Evidence | Compat tier (see strategy) |
|---|---|---|---|---|---|
| **L1** | "Pipeline" naming the Opportunity **object** in nav | **Opportunity** (object); keep "Pipeline" only as a §7 *view* | homonym (object vs view) | `workspace-shell.tsx:24` | E (surface) |
| **L2** | "deal contact" / "target" / "contact" for the acquisition party | **Seller** | synonym | `schema.prisma:899`; `acquire/page.tsx:130` | B/D (code + schema) + E |
| **L3** | `Opportunity.source` free-text origin | **Acquisition Channel** (structured) | synonym | `schema.prisma:1164` | D (persistence) |
| **L4** | BI "closed-won" | **Transaction Closed** | synonym (CRM-ism) | `queries.ts:70` | E (report label) |
| **L5** | "match" meaning identity de-duplication | **Resolution / Merge** ("Match" stays for Buyer↔Deal only) | homonym | `OwnerMatchDecision`, `PropertyMatchDecision` | B (code identifiers) |
| **L6** | `Task.ownerId` "owner" = the task **assignee** | **assignee** | homonym | `schema.prisma:1741` | D (schema) |
| **L0** | "Lead" as a stage/prospect word | *(retired — `Owner → Seller`)* | retirement | `acquire/page.tsx:174`; imports | E surface now; **code = BE-4** |

## Conflict classes (already resolved by Doc 3 — restated for enforcement)

1. **Synonyms** (No-Synonyms Rule): L2, L3, L4 — several words for one concept → keep the canonical, deprecate the rest.
2. **Homonyms** (No-Homonyms Rule): L1, L5, L6 — one word for several concepts → reserve the canonical meaning, rename the off-meaning.
3. **Retirement**: L0 — a non-business word ("Lead") removed from surfaces now; code enum removed in BE-4.

## Deliberately excluded (owned elsewhere — do not touch in BE-3)

`Deal`(=Opportunity)→BE-2 (done) · `OpportunityStage`-as-authority & *Lead* code→BE-4 · first-class
`Transaction` object (Closing dashboard / `AssignmentRecord` / money)→BE-5. Including any of these in
BE-3 would exceed the ratified "Retire via BE-3" charter.

## What the implementation phase adds (not now)

Re-confirm each `file:line` against the live tree, attach every hit to its L-ID, and produce the
alignment-score baseline. That is a **read-only detector** run (Enforcement Plan Phase 1), not a change.

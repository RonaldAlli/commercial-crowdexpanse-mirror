# Opportunity Pipeline — Post-Deploy Production Defects (Slice 1)

> **Status: ROOT-CAUSE REPORT · PENDING FOUNDER REVIEW — no code changed yet.** Two defects surfaced
> by the Founder's production browser re-drive of the deployed Slice 1 build (`sso5PnSYezUNfdBC1w7YQ`,
> main `e85c44b`). **The release stays in the OBSERVATION window; it is NOT accepted/frozen.** Rollback
> assets retained (`.next.rollback-20260720-014146Z` → prior `9_gv6zY2…`; backup `20260720-014146Z`).
> Branch `fix/pipeline-board-stage-select`. **Do not use the board for bulk stage changes until fixed.**

---

## DEFECT PB-1 · Board loads & renders every opportunity (9,641) — unacceptable load time · HIGH

**Reproduced (measured, test DB, N=9,641):** the board query returns **9,641 rows in ~481 ms** (DB
alone) via `scripts/perf-board-load.mjs`.

**Root cause (code):** `loadBoardOpportunities` in `app/(workspace)/opportunities/page.tsx` is
`prisma.opportunity.findMany({ where:{organizationId}, select: BOARD_SELECT, orderBy })` — **no
`take`/`skip`/pagination**. The board then renders **one card per opportunity**
(`STAGE_ORDER.map → items.map`), and **each card mounts an interactive `<StageSelect>` client
component**. So at 9,641 leads the page ships an O(9,641) RSC payload and **hydrates 9,641 client
components** — the load-time problem. *(The List view already paginates via `skip`/`take` + a count;
only the Board is unbounded — this predates Slice 1 but only became visible at production volume.)*

**Fix direction (Founder-ratified):** the board must not render thousands of cards. Smallest safe
correction = **limited per-column loading + counts** (`take` N per stage, real total via `count`,
"Load more" / link to the paginated List), then virtualization if needed. Keep BOARD_SELECT lean.

## DEFECT PB-2 · Changing a lead's stage from the dropdown does not move the card · HIGH

**Symptom (Founder):** the dropdown visually changes (e.g. → "Seller Contacted") but the card stays
put.

**Root-cause analysis — two compounding causes:**
1. **Board-scale revalidation (dominant).** A successful move calls `revalidatePath("/opportunities")`;
   with 9,641 cards the RSC refresh re-renders the entire board, so the card's move is extremely
   delayed/janky — it *appears* not to move. This is a direct consequence of PB-1.
2. **Fragile client submission (genuine regression from the Slice 1 rewrite).** The rebuilt
   `components/stage-select.tsx` uses a **controlled `<select value>` + hidden `<input value=reason>`**
   and submits via `requestAnimationFrame(() => formRef.requestSubmit())` *after* an `await
   evaluate(...)`. React state is asynchronous; a single animation frame does **not** guarantee both
   controlled inputs have committed to the DOM before the native submit reads the form, so a **stale
   stage value** (equal to the current stage) can be submitted → `moveOpportunityStage` sees
   `nextStage === existing.stage` → **no-op**, while the controlled dropdown still shows the new value
   (`useEffect(setValue(current))` only resyncs after a *committed* refresh). This exactly matches
   "dropdown changed, card didn't move." The OLD pre-Slice-1 control (uncontrolled `defaultValue` +
   immediate `requestSubmit` in the change handler) had no such timing dependency.

**Fix direction (Founder-suggested):** make submission deterministic — **construct a `FormData`
explicitly and call the server action directly with the chosen stage + reason** (no reliance on
controlled-input/RAF timing). Keep the evaluate → ALLOW/REQUIRES_ATTESTATION/DENY flow.

### Answers to the specific verification questions
| Question | Finding |
|---|---|
| Board loads all 9,641 at once? | **Yes** — no limit; 481 ms query + 9,641 client components. |
| `evaluateStageMove` completes? | Yes — extra server round-trip before submit; ALLOW for unruled stages. |
| `moveOpportunityStage` gets the selected stage + reason? | **Not reliably** — controlled-input/RAF timing can submit a stale stage (PB-2 cause 2). |
| DB stage changes? | `applyStageTransition` is proven by tests; it persists **when the correct stage reaches it** — the stale-submit path no-ops instead. |
| Revalidation occurs? | Yes (`revalidatePath`), but on a 9,641-card board the refresh is heavy (PB-2 cause 1). |
| Client resets to stale `current`? | `useEffect(setValue(current))` resyncs only after a committed refresh; on a no-op/laggy refresh the dropdown shows the new value while the card stays. |

## Proposed smallest-safe fix (for your nod before I code)
1. **PB-1:** limited per-column board loading (`take` per stage + counts + "Load more"/List link); no schema change.
2. **PB-2:** rewrite `StageSelect` submission to build `FormData` explicitly and invoke the action directly (deterministic values); keep the evaluate/attestation flow.
3. **Regression tests:** a **Playwright** spec (harness exists under `tests/visual/`) — load a seeded board, change a lead's stage, assert the card moves to the new column and the DB stage changed; plus a bounded-board assertion (only N cards per column rendered). Full gate + no deploy until reviewed.

**Rollout:** stay in observation; do **not** deploy until both defects are fixed, tested, and reviewed;
keep rollback assets. Production remains on `sso5PnSYezUNfdBC1w7YQ` (the defects are live but non-destructive — no data risk; advise against bulk board stage changes meanwhile).

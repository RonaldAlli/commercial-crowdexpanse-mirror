# Deal Analyzer Loading Defect — Defect · Cause · Fix · Verification

> **Product defect (user-facing workflow blocked). Reproduced + root-caused BEFORE any change; smallest safe
> fix on an isolated branch; verified in staging. STOP for review before production.** 2026-07-21.

---

## Defect (observed, reproduced)
Clicking **Deal Analyzer** (`/analyzer`) appears to hang / load endlessly at production scale. Reproduced
with a read-only GET (minted operator session, no mutation) against production:

| Route | Result |
|---|---|
| `GET /analyzer` (entry list) | **HTTP 200 but 9.5 MB, ~3.42 s server render, 9,642 `/analyzer/` links / 9,644 `<li>`** |
| `GET /api/health` (baseline) | 200, 0.015 s |
| `GET /analyzer/<id>` / `.../edit` (per-deal) | fast (0.06–0.13 s) — **not** affected |

So it is **not** a crash, auth failure, null data, or a server error (the error log is clean) — it is an
**unbounded data render**: the page builds a ~9.5 MB HTML document, which the browser then parses/hydrates
(~9.6k links) → the "endless loading."

## Cause
`app/(workspace)/analyzer/page.tsx` fetched **every** opportunity for the org and rendered a `<li>`/`<Link>`
per row:
```ts
const opportunities = await prisma.opportunity.findMany({ where: { organizationId }, include: { property }, orderBy: { updatedAt: "desc" } }); // NO take/limit
```
At this org's scale (**9,641 opportunities, none analyzed** → all land in the "Needs analysis" list), that is
9.6k rows fetched + rendered. This is the **same class as PB-1** (the Opportunity board), which was bounded;
the Deal Analyzer entry was never given the same treatment. **Not a recent code regression** — it is
data-volume-driven (it degrades as the org grows).

## Fix (smallest safe correction — mirrors the PB-1 board bound)
Single file (`app/(workspace)/analyzer/page.tsx`):
- Fetch only the **most-recently-updated slice** + the true total, instead of all rows:
  ```ts
  const ANALYZER_LIMIT = 60;
  const [opportunities, totalOpportunities] = await Promise.all([
    prisma.opportunity.findMany({ where: { organizationId }, include: { property: {…} }, orderBy: { updatedAt: "desc" }, take: ANALYZER_LIMIT }),
    prisma.opportunity.count({ where: { organizationId } }),
  ]);
  ```
- Scope the analyzed/needs-analysis derivation (underwriting/result/financing) to the bounded scan
  (`opportunityId: { in: scanIds }`).
- When `total > ANALYZER_LIMIT`, render a note: *"Showing the 60 most recently updated of N opportunities.
  View all in Opportunities"* (link to `/opportunities`) — the full set stays reachable.

No schema change, no API change, no change to the per-deal analyzer or nearby routes. Additive + bounded.

## Verification
- **Gate:** `tsc` 0; unit **72** files; e2e **43**; `build:isolated` ok. Diff = 1 file (+30 / −9).
- **Staging** (seeded 100 opportunities, fixed build deployed via the engine):
  | | Before (prod, unbounded) | After (staging, fixed) |
  |---|---|---|
  | `/analyzer` | 9.5 MB · 3.42 s · 9,642 links | **86 KB · 0.18 s · ~60 links + "View all"** |
- **Nearby flows (staging):** entry opens (200, fast); clicking a deal → 307 to `/edit` (correct for an
  un-analyzed deal); **refresh** `/analyzer` works (200); empty/incomplete handled by the existing
  empty-state; **no** `__next_error__` / no new server errors.

## Recommended follow-up (not required for the fix)
A Playwright regression (mirroring `tests/visual/opportunity-board-stage.spec.ts`) asserting `/analyzer`
renders ≤ `ANALYZER_LIMIT` rows + the "View all" affordance at scale.

---
*Stop point: reproduced, root-caused, smallest fix implemented + verified in staging. Branch
`fix/analyzer-unbounded-load`. Awaiting review before production deployment.*

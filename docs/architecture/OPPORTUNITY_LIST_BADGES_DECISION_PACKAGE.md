# Opportunity-List Closing Badges (Roadmap #7) — Architecture Decision Package

> **Status: ✅ RATIFIED (2026-07-16).** Founder ratified Roadmap #7 with the recommended
> scope. Ratified: **TX-6 Projection Reuse** (standing principle); a small pure
> **`projectClosingBadges()`** in the shared projection module (composing the same
> authoritative helpers — not a parallel implementation); **List view only — the Kanban
> Board is NOT modified** (Board badges reserved as a separate benchmarked decision);
> **compact chip row beneath the Opportunity title** (no new table column); badge content
> = readiness (✓ Ready / ⚠ N blockers) + Escrow/Financing/Assignment status **where
> Closing is relevant**. **Display rules:** early-stage Opportunities with no Closing
> activity stay visually quiet (no cluster, no row of "Not started" badges); an
> Opportunity **at or beyond `UNDER_CONTRACT` without a checklist** shows a concise
> **"Closing not started"**. Founder added four invariants at ratification — **LB-9 Stage-aware
> visibility, LB-10 Bounded query contract, LB-11 Navigation ownership, LB-12 Graceful
> projection** — and, on approving #7 for release, two more: **LB-13 Badge stability** and
> **LB-14 Projection completeness** (see §8); LB-1…LB-8 ratified as written. The authoritative statement
> now lives in `CLOSING_CENTER_ARCHITECTURE_LOCK.md` (Slice 7); this package is preserved
> as the decision record. Implementation proceeds on a dedicated feature branch and
> **stops before merge**. After release, Version 1.4 moves into formal acceptance /
> freeze / tag — not straight into Version 2.0.
>
> **Slice context:** Closing Center, Version 1.4, Roadmap item #7 — the final read
> surface. The Closing read model is otherwise complete: **Closing Center** (one deal's
> operational workspace), **Transaction Dashboard** (current state across all in-flight
> deals — Slice 5, LIVE), **Transaction Timeline** (one deal's history — Slice 6/TX-0,
> LIVE). #7 adds **at-a-glance closing health on the Opportunity list** so users see it
> without opening each deal. Smaller than the preceding slices by design.
>
> **Design authority:** extends `CLOSING_CENTER_ARCHITECTURE_LOCK.md`; **composes**
> `TRANSACTION_DASHBOARD_DECISION_PACKAGE.md` (ratified) and the pure
> `lib/transaction-dashboard.ts` module. Nothing here weakens the PAID + readiness gate,
> touches the frozen V1.3 underwriting engine, or modifies Slices 1–6's records.

---

## 1. Purpose — what #7 is, and is not

Compact **Closing badges** on each Opportunity list row summarizing that deal's closing
health — readiness (✓ Ready / ⚠ N blockers) and per-domain Escrow / Financing /
Assignment status — each linking into the full Closing Center. The badges are a **read
projection**, derived at read time from records the deal already owns.

**#7 is NOT:** a new domain, table, migration, index, service, cached readiness, or any
recomputation of closing state. It introduces **no new derivation logic whatsoever** — it
consumes the *same* pure projection the Dashboard already uses (TX-6, below).

---

## 2. Discovery evidence (repository is the source of truth)

### 2.1 The Opportunity list surface

`app/(workspace)/opportunities/page.tsx` has **two views**:
- **List (table)** — `:312 ListTable`, columns Opportunity / Stage / Priority / Target
  close / Contract / Fee / Seller. **Paginated**: `:152-158` `count` + `findMany({ where,
  include: OPP_INCLUDE, orderBy: SORT_ORDER[sort], skip, take })`, page size
  **`LIST_PAGE_SIZE = 20`** (`lib/list-params.ts:8`). Search (`q`) + sort
  (updated/newest/title) apply here. `OPP_INCLUDE` (`:37-40`) = `property{…}`,
  `seller{name}`.
- **Board (kanban)** — `:265` grouped by stage over `BOARD_SELECT` (`:51-59`: id, title,
  stage, priority, contractValueUsd, assignmentFeeUsd, property{name,assetType}); loads
  **every** org opportunity (unpaginated).

Existing badges are rendered with the shared `Badge` + `statusTone` (`components/ui/badge.tsx`):
stage chip (`:339` `<Badge tone="info" dot>{stageLabel(opp.stage)}</Badge>`), priority.

### 2.2 The projection to reuse (`lib/transaction-dashboard.ts`)

`projectTransactionRow(input: TransactionProjectionInput, referenceMs)` (`:127`) already
returns, per opportunity, **exactly** what a badge needs:
- `readiness: { ready, requiredSatisfied, requiredTotal, outstandingCount, blockerLabels } | null` (`:112`)
- `escrow / financing / assignment: StatusChip | null` (`:113-115`, `StatusChip = {label, tone}`)
- plus `closed`, `nextMilestone`, `responsibleParties`, `href`.

It reuses the authoritative `closingReadinessSummary` / `blockingItems` (`lib/closing`) and
the `escrow/financing/assignment` status label+tone helpers, so a badge **cannot disagree**
with the Dashboard or the Closing Center. It is pure (no clock/Prisma), immutable, and
degrades gracefully — a missing domain record yields a `null` chip, never an error (TD-11).

### 2.3 The service pattern to mirror (`lib/transaction-dashboard-service.ts`)

`getTransactionDashboardRows` runs **one** org-scoped `findMany` selecting the opportunity
+ its 1:1 `escrow` / `financing` / `assignment` records + `closingChecklist.items`, then
resolves item owners in one lookup. The **only** extra query is the owner-name resolution —
needed solely for `responsibleParties`, which the badges **do not display**. So the badge
path is *leaner* than the Dashboard (no owner lookup).

### 2.4 Persistence check

Every input already exists on the Opportunity's 1:1 closing records + checklist items
(`Opportunity.escrow / financing / assignment / closingChecklist`, all `@unique`). **No new
table, column, migration, or index is required.** The badge data is reachable by adding the
same 4 includes the Dashboard already uses to the list's existing paginated query.

---

## 3. Projection reuse determination (the core question)

**The Opportunity list can consume the existing Dashboard projection directly.** The badge
is a **subset of `projectTransactionRow`'s output** — readiness + three status chips — with
**zero new derivation**. #7 therefore needs: (a) additive query includes on the existing
paginated list query, (b) a small pure badge-shaping helper that *reuses the same module's
helpers*, and (c) a compact presentation component. No persistence, no migration, no index,
no service, no new domain.

---

## 4. TX-6 — Projection Reuse (new ratified principle)

> **Any UI surface that summarizes Closing state MUST consume the shared projection layer.
> Closing status is never computed independently inside the Opportunity List, Dashboard,
> Timeline, Reporting, or any future widget. One source, many consumers.**

TX-6 is the natural sibling of **TX-4 Projection Composition**: TX-4 says read surfaces
compose the same pure modules; TX-6 makes it a hard prohibition on *recomputing* closing
status anywhere else. Concretely for #7: the badges call into `lib/transaction-dashboard.ts`
(readiness via `closingReadinessSummary`/`blockingItems`; chips via the domain status
helpers) — they never re-derive "ready", "blocker count", or a status label locally.

---

## 5. Proposed architecture

### 5.1 Pure badge projection (reuse, don't fork)

Add a small pure helper to `lib/transaction-dashboard.ts` (the shared module, honoring
TX-6):

```
export type ClosingBadgeSummary = {
  hasClosingActivity: boolean;              // any checklist/escrow/financing/assignment present
  closed: boolean;                          // PAID
  readiness: { ready: boolean; outstandingCount: number } | null;  // null = checklist not started
  escrow: StatusChip | null;
  financing: StatusChip | null;
  assignment: StatusChip | null;
};
export function projectClosingBadges(input: TransactionProjectionInput): ClosingBadgeSummary
```

It reuses the **same** `closingReadinessSummary`/`blockingItems` + status helpers that
`projectTransactionRow` uses — no duplicated logic (TX-6). It needs **no `referenceMs`** (no
milestone/overdue on the list) and **no `ownerName`** (no responsible party on the list), so
the badge input can carry `ownerName: null` and skip the Dashboard's owner-name query
entirely. (Optional, deferrable: later refactor `projectTransactionRow` to compose
`projectClosingBadges` if a clean seam emerges — a behavior-neutral change reviewed on its
own. Not required for #7.)

### 5.2 Read path — additive includes on the existing paginated query

Extend the List view's `findMany` (`page.tsx:153`) with the 4 closing includes (the same the
Dashboard selects): `escrow{status,earnestDueDate,contingencyDeadline}`,
`financing{status}`, `assignment{status}`, `closingChecklist{items{required,status,label,dueDate}}`.
Map each row → `TransactionProjectionInput` → `projectClosingBadges`. **One query, bounded by
`take: 20`** (the existing page size) — a bounded, additive join, no N+1, no owner lookup.
`force-dynamic` already set.

### 5.3 Scope — List view first; Board deferred

Badges land on the **paginated List view** (bounded to 20 rows/page). The **Board (kanban)
loads every opportunity unpaginated** (`getBoardData`), so adding 4 joins per card is an
unbounded payload increase — deliberately **out of scope** for #7 (a separate, benchmark-gated
decision, consistent with TX-A "prove first, optimize second"). Recommendation: **List only.**

### 5.4 Which opportunities show badges

Badges appear **only where closing is relevant** — i.e. `hasClosingActivity` (a checklist
started or any escrow/financing/assignment record) or an in-flight/closed stage. Early-stage
deals with no closing data render **no badge cluster** (no noise) — the graceful-absence
posture of TD-11. This keeps the list quiet for leads and informative for live deals.

### 5.5 UI

A compact badge cluster per row: a **Closing** chip (`✓ Ready` success / `⚠ N blockers`
danger / `Checklist not started` neutral) plus **Escrow / Financing / Assignment** status
chips where present, reusing the shared `Badge` + the domain tones. Each cluster (or the row)
links into that Opportunity's Closing Center (`/opportunities/{id}`) — the same
orchestration-not-ownership posture as the Dashboard (TX-3). **Placement — decision for
ratification:** (a) a compact chip row **under the title** in the existing Opportunity cell
(no table-width change — recommended), or (b) a dedicated **"Closing" column** (widens the
already-`min-w-[900px]` table). No inline editing.

### 5.6 RBAC & isolation

Org-scoped (existing list `where`). Reuses the **existing opportunity read** — the badges
show only status **labels** + a blocker **count** (no amounts, no party names), i.e. a strict
subset of what the Closing Center already shows the same viewer. **No new RBAC resource.**

---

## 6. Performance

Bounded by the existing pagination (20 rows/page); one paginated query with 4 additive 1:1/1:n
joins; **no owner-name lookup** (leaner than the Dashboard); **no index** (the list already
queries by `organizationId`; benchmark real usage before considering one, TX-A). Board
excluded to avoid an unbounded join.

---

## 7. Scope exclusions (explicit)

#7 does **NOT**: add persistence / a table / a migration / an `ActivityLog` or closing index ·
add a service or domain · recompute any closing status (TX-6) · cache readiness · duplicate
blocker/milestone/status logic · add new filters or sort keys (badges are display-only) ·
modify the Board view · modify Slices 1–6 or their records · touch the frozen V1.3 underwriting
engine · weaken/bypass the PAID + readiness gate · add a mutating action.

---

## 8. Invariants (proposed — for the lock on ratification)

- **TX-6** Projection Reuse — every Closing-state summary consumes the shared projection
  layer; no surface recomputes closing status.
- **LB-1** Badge data = `projectClosingBadges` over the opportunity's existing 1:1 closing
  records + checklist items; no new persistence.
- **LB-2** Reuse — readiness/blocker/status derived only via the shared module's helpers
  (no forked logic).
- **LB-3** Additive, bounded read — the List query gains 4 includes within the existing
  `take: 20` pagination; no owner lookup; no N+1.
- **LB-4** Graceful absence — an opportunity with no closing activity renders no badge
  cluster; a missing domain record degrades to a null chip, never an error (TD-11 posture).
- **LB-5** Read-only, links OUT — badges never edit; they navigate into the Closing Center
  (TX-3).
- **LB-6** Org-scoped, reuses opportunity read; no new RBAC; badges expose only status
  labels + blocker count (a subset of already-visible data).
- **LB-7** List view only in #7; Board deferred (unbounded payload, benchmark-gated).
- **LB-8** No new index (TX-A); benchmark before any list-query optimization.
- **LB-9 — Stage-aware visibility.** Closing badges render only when the Opportunity is
  at a **Closing-relevant stage** (`UNDER_CONTRACT` or later — i.e. `UNDER_CONTRACT` /
  `BUYER_MATCHED` / `CLOSING` / `PAID`) **OR** at least one Closing domain record exists.
  Early-stage deals (`LEAD`…`LOI_SENT`) with no closing activity show **no cluster** — no
  clutter. An in-flight/closed Opportunity **without a checklist** shows a concise
  **"Closing not started"** (distinct from the quiet early-stage state).
- **LB-10 — Bounded query contract.** The badge projection stays bounded by the existing
  page size (20). **No** removal of pagination, **no** per-row service/DB calls, **no**
  N+1, **no** `ActivityLog` fetch, **no** document/snapshot payloads — only the minimal
  Closing selects `projectClosingBadges()` needs, added to the one existing list query.
- **LB-11 — Navigation ownership.** The badge cluster may link to the Opportunity detail
  page / Closing Center anchor and nothing more — **no** inline actions, status
  transitions, waivers, terminal resolutions, or document generation. The list stays a
  summary surface.
- **LB-12 — Graceful projection.** Missing Checklist / Escrow / Financing / Assignment
  data must never break or remove an Opportunity row — it degrades to a null chip / quiet
  state (TD-11 posture).
- **LB-13 — Badge stability.** The cluster never changes **height** as a status appears or
  disappears (single reserved row via `flex-nowrap` + `min-h`); rows never jump while
  closing progresses. Extra width is absorbed by the table's existing horizontal scroll.
  (Founder addition, 2026-07-16.)
- **LB-14 — Projection completeness.** Every rendered badge — including the readiness
  chip's label + tone — is produced by `projectClosingBadges`; the UI renders it verbatim
  and never knows more than the projection, preventing subtle later divergence. (Founder
  addition, 2026-07-16.)

---

## 9. Testing & verification plan (post-ratification)

- **Unit (CRITICAL ≥90% branch):** `projectClosingBadges` — ready vs N-blockers vs
  not-started; each domain chip present/absent; `hasClosingActivity` true/false; never
  mutates input; PAID `closed`.
- **E2E (`scripts/e2e-opportunity-badges.mjs`):** seed opportunities across stages/closing
  states; assert badge summary matches the authoritative readiness/status; graceful absence
  for a bare lead; org isolation; **no writes** on list read.
- **Playwright (`tests/visual/opportunity-list-badges.spec.ts`):** badges render on live-deal
  rows, absent on a lead row, link into the Closing Center, reader-role access, no console
  errors, desktop/tablet/mobile screenshots.
- **Full gate:** typecheck, lint, unit, full E2E, Playwright, isolated build — schema/migration
  unchanged (code-only).

---

## 10. Decisions — RATIFIED (2026-07-16)

1. **TX-6 Projection Reuse — approved** as a standing architectural principle.
2. **Reuse approach — approved:** add a small pure `projectClosingBadges()` to
   `lib/transaction-dashboard.ts` that **composes the same authoritative helpers**
   (`closingReadinessSummary`/`blockingItems` + the domain status label/tone helpers) —
   it must **not** become a parallel implementation.
3. **Scope — approved: List view only.** The Kanban Board is **not** modified in this
   slice; Board badges are reserved as a separate benchmarked decision.
4. **Placement — approved: a compact Closing chip row beneath the Opportunity title.** No
   dedicated "Closing" column (would widen the table and crowd out Opportunity info).
5. **Badge content — approved** with the LB-9 display rules: readiness (✓ Ready / ⚠ N
   blockers) + Escrow / Financing / Assignment status where Closing is relevant; quiet on
   early-stage no-activity deals; "Closing not started" for `UNDER_CONTRACT`+ without a
   checklist.
6. **Scope exclusions (§7) + invariants (§8) — approved** (LB-1…LB-8), plus four founder
   additions: **LB-9 Stage-aware visibility, LB-10 Bounded query contract, LB-11
   Navigation ownership, LB-12 Graceful projection.**

**Post-ratification path:** move the accepted decisions into the Architecture Lock (done);
preserve this package as the decision record (this document); produce a detailed #7
implementation plan; implement **only #7** on a dedicated feature branch; run typecheck,
lint, unit, full E2E, Playwright, isolated build; commit; **stop before merge**. Do not
touch the Board. Do not begin the Version 1.4 wrap-up yet — but once #7 is released, 1.4
moves into formal acceptance / freeze / tag / closeout, not straight into Version 2.0.

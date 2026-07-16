# Transaction Timeline (TX-0) — Architecture Decision Package

> **Status: ✅ RATIFIED (2026-07-16).** Founder ratified the TX-0 discovery and this
> package. Ratified decisions (see §9 for the questions): **Option A — code-only, NO
> ActivityLog index in this slice** (benchmark realistic production usage after release;
> introduce the index later as a dedicated additive optimization only if the benchmark
> demonstrates need); **TX-4 Projection Composition** approved as a standing principle;
> **TX-5 Projection Version** approved as a reservation only (do not implement); **mount
> point** = the Opportunity detail page beside the Closing Center (no separate top-level
> route); **default ordering** = newest-first with an oldest-first toggle; **scope
> exclusions + invariants** approved. Founder added two invariants: **TL-10 Event
> Integrity** and **TL-11 Snapshot Reference** (see §7). The authoritative statement now
> lives in `CLOSING_CENTER_ARCHITECTURE_LOCK.md` (TX-0 section); this package is
> preserved as the decision record. Implementation proceeds on a dedicated feature
> branch and **stops before merge**.
>
> **Slice context:** Closing Center, Version 1.4. The Transaction Dashboard (Slice 5)
> is LIVE and accepted. TX-0 (Transaction Timeline) was reserved during Slice-5
> discovery as the intended next milestone — the completion of the Closing **read
> model**, with *no new operational domain*. Roadmap #7 (Opportunity-list closing
> badges) remains a **separate** follow-up and is out of scope here.
>
> **Design authority:** extends `docs/architecture/CLOSING_CENTER_ARCHITECTURE_LOCK.md`
> and composes with `docs/architecture/TRANSACTION_DASHBOARD_DECISION_PACKAGE.md`
> (ratified). Nothing here weakens the PAID authorization + closing-readiness gate,
> touches the frozen V1.3 underwriting engine, or modifies Slices 1–5.

---

## 1. Purpose — what the Timeline is, and is not

A **read-only, single-opportunity, chronological projection** of what has already
happened on one deal: stage moves, escrow open/deposit/resolve, financing
milestones, assignment lifecycle, checklist completions/waivers, document and
offer-memo generation, and the underwriting decision — rendered as a time-ordered
narrative on the Opportunity, derived at read time from records the system already
owns.

This distinction was ratified in Slice 5 as **TX-1** and is the organizing premise here:

| | **Transaction Dashboard (Slice 5, LIVE)** | **Transaction Timeline (TX-0, this package)** |
|---|---|---|
| Axis | Cross-opportunity, **current state** | Single-opportunity, **history** |
| Question | "Which deals need attention *now*?" | "What has happened on *this* deal, in order?" |
| Shape | One row per in-flight opportunity | One event per row, oldest/newest-first |
| Source | Live domain records (status + deadlines) | Recorded lifecycle events (`ActivityLog`) |

**The Timeline is NOT:** a new domain, a new table, an event bus, a materialized
view, a second source of truth, a workflow engine, a mutation surface, or a
replacement for the existing org-wide `/activity` feed. It is *orchestration of a
read*, not *ownership of state* — the same posture as the Dashboard (TX-3).

---

## 2. Discovery evidence (repository is the source of truth)

All citations verified against the working tree at the time of writing.

### 2.1 `ActivityLog` — the primary timeline substrate

`prisma/schema.prisma:1749` — `model ActivityLog`:

```
id, organizationId, opportunityId?, propertyId?, sellerId?, buyerId?,
actorId?, eventType, eventLabel, eventBody?, createdAt (@default(now()))
relations: organization, opportunity?, property?, seller?, buyer?, actor?
@@index([organizationId])        // <-- the ONLY index
@@map("activity_log")
```

Decisive properties for a timeline:
- **Direct `opportunityId`** — a per-opportunity query is a simple `where`, no join.
- **`createdAt`** — the chronological key.
- **`actorId` → `actor { name }`** — "who did it" resolves in one relation
  (`app/(workspace)/activity/page.tsx:68,130` already does exactly this, rendering
  `row.actor?.name ?? "System"`).
- **`eventLabel` + `eventBody`** — human-readable narration is **already stored**;
  the timeline does not need to re-synthesize prose from raw fields.

### 2.2 Every closing lifecycle event is already recorded here

Each Closing domain service writes `ActivityLog` through a local `audit()` helper
setting `{ organizationId, opportunityId, actorId, eventType, eventLabel, eventBody }`:

- `lib/escrow-service.ts:56` → `escrow.opened`, `escrow.deposited`, `escrow.updated`
- `lib/financing-service.ts:60` → `financing.started`, `financing.updated`
- `lib/assignment-service.ts:63` → `assignment.started`, `assignment.drafted`,
  `assignment.executed`, `assignment.updated`, `assignment.cancelled`
- `lib/closing-service.ts:142` → `closing.item_completed`, `closing.item_waived`,
  `closing.item_na`, `closing.item_reopened`
- `app/(workspace)/opportunities/actions.ts:188,191,266` → `opportunity.stage_changed`
- `app/(workspace)/analyzer/actions.ts:69` → `underwriting.decided`
- `lib/documents/*` → `offer_memo.generated` (`:214`), `assignment_agreement.generated`
  (`:199`), `document.created/updated/deleted`

The org-wide event vocabulary (distinct families) confirms full lifecycle coverage:
`opportunity.*`, `escrow.*`, `financing.*`, `assignment.*`, `closing.*`,
`underwriting.*`, `offer_memo.*`, `assignment_agreement.*`, `document.*`, plus
`note.*`, `task.*`, `buyer_match.*`, `authorization.*`, etc.

> **Caveat — best-effort narration, not a guaranteed ledger.** Every `audit()` call
> ends `.catch(() => {})` (e.g. `lib/escrow-service.ts:57-58`): the operational write
> succeeds even if its `ActivityLog` row fails. `ActivityLog` is therefore an
> **as-recorded narrative**, not an append-only audit ledger. This is the correct
> foundation for a *read-only chronological narrative*, but it means **the Timeline
> must present itself as "what was recorded," never as an authoritative or complete
> ledger.** The authoritative per-domain state stays where it lives (Dashboard reuses
> those helpers). See §4.4.

### 2.3 Immutable snapshots — authoritative detail, reachable via relations

These append-only records carry authoritative, immutable detail and their own
timestamps, but are **not** directly keyed by `opportunityId`:

- **`EscrowEvent`** (`prisma/schema.prisma`, `@@map("escrow_events")`): `type`,
  `amountUsdSnapshot`, `holderNameSnapshot`, `actorId`, `reason`,
  `occurredAt (@default(now()))`; keyed by `escrowRecordId` → `EscrowRecord.opportunityId`
  (`@unique`, 1:1). Indexed `@@index([escrowRecordId])`.
- **`UnderwritingDecision`** (`@@map("underwriting_decisions")`): `sequence`,
  `scenarioVersion`, `createdAt`; keyed by `scenarioId` → scenario → underwriting →
  opportunity. **Frozen V1.3 surface — read-only reference only.**
- **Generated `Document`s** (`origin`, `generationSequence`, `generatedAt`,
  `decisionSequenceSnapshot`): the offer-memo / assignment-agreement artifacts,
  reachable via `Opportunity.documents` / `sourceOpportunityId`.
- **`ClosingChecklistItem`** (`completedAt`, `waivedAt`, `completionEvidenceType`,
  `status`): each transition is *also* narrated to `ActivityLog` by the closing
  service, so the item timestamps are corroborating detail, not the only record.

**Consequence:** every one of these events is *also* narrated into `ActivityLog`
with a direct `opportunityId`. So the Timeline v1 can be built from **`ActivityLog`
alone** (one query, direct key). The immutable snapshots are available for *optional
future enrichment* (e.g. deep-linking an `escrow.deposited` row to its `EscrowEvent`
amount snapshot) but are **not required** and are **not** proposed for v1.

### 2.4 Existing `/activity` feed — the query/ordering/pagination precedent

`app/(workspace)/activity/page.tsx`:
- `:58` `const where: Prisma.ActivityLogWhereInput = { organizationId: user.organizationId }`
- `:60` optional `where.eventType = { startsWith: \`${category}.\` }`
- `:64-76` `count(where)` + `findMany({ where, include: { actor: { select: { name } } },
  orderBy: { createdAt: "desc" }, take: PAGE_SIZE, skip: (page-1)*PAGE_SIZE })`

This is offset pagination (count + take/skip) ordered by `createdAt desc`, org-scoped.
It is the direct precedent; the Timeline is the same query **plus `opportunityId` in the
`where`** and an opportunity-scoped RBAC/ownership check. Other precedents:
`lib/refresh-jobs.ts:30-42` (skip/take, `createdAt desc`).

### 2.5 Opportunity relations (UI mount + data reach)

`model Opportunity`: `stage`, `property`, `underwriting?`, `closingChecklist?`,
`escrow?`, `financing?`, `assignment?`, `documents[]`, `activities ActivityLog[]`.
Detail route exists at `app/(workspace)/opportunities/[id]/page.tsx` — the natural
mount point for a Timeline panel/tab (see §4.6).

### 2.6 The Slice-5 projection module to compose with (`lib/transaction-dashboard.ts`)

Pure, no Prisma, no clock, injected `referenceMs`. Reuses authoritative domain
helpers so the read surface can never disagree with the Closing Center:
`closingReadinessSummary`, `blockingItems` (`lib/closing`), `escrowStatusLabel/Tone`,
`financingStatusLabel/Tone`, `assignmentStatusLabel/Tone`. Exports the in-flight stage
set + `DASHBOARD_STAGE_ORDER`/`stageRank`, deterministic total ordering
(`compareTransactionRows`/`sortTransactionRows`), and a presentation-neutral row shape
explicitly built for reuse by other read surfaces. **This is the composition anchor for
TX-4.**

---

## 3. Persistence determination (the core question)

**Finding: TX-0 requires NO new table, NO event replication, NO new writes, NO new
domain.** All raw timeline data is already persisted in `ActivityLog` (direct
`opportunityId` + `createdAt` + `actor.name` + stored human-readable label/body),
corroborated by immutable snapshots that are already narrated there.

This satisfies the founder's TX-0 reservation verbatim: *existing operational records
→ read-only chronological projection → Transaction Timeline; no duplicate persistence,
no timeline table, no event replication, no new writes.*

**The one open persistence question — a single additive READ index.** `ActivityLog`
today has only `@@index([organizationId])` (§2.1). A per-opportunity, time-ordered
query filters `opportunityId` and sorts `createdAt` with no supporting index. This is
the exact TX-A concern deferred from Slice 5. An index is a **read optimization on
existing data** — it is *not* duplicate persistence, *not* a timeline table, *not*
event replication, and adds *no* write path — but it **is** a migration. So the
honest determination is:

- **Option A — truly code-only (recommended default):** ship the Timeline with **no
  migration**, relying on the existing `organizationId` index plus a bounded query
  (org + opportunity filter, `take` a page). At today's per-opportunity event counts
  (tens, not thousands) this is comfortably fast. **Benchmark-gate** the index exactly
  as TX-A prescribed: measure the real query on production-shaped data; add the index
  **only if** the measurement warrants it.
- **Option B — one additive index migration:** `@@index([organizationId, opportunityId, createdAt])`
  on `ActivityLog`. Purely additive, backward-compatible, zero behavior change, no new
  column/table/write. Taken only if Option A's benchmark shows it is needed.

**Recommendation:** proceed **Option A (code-only)**, with the benchmark recorded, and
the index pre-approved as a fast-follow *iff* the benchmark crosses an agreed
threshold. This keeps TX-0 consistent with the "no speculative index" discipline the
founder set in TX-A while leaving a ratified, low-risk path if data volume demands it.
**This is the primary decision requested in §9.**

---

## 4. Proposed architecture (read-only projection)

Same three-layer shape proven in Slice 5: pure module → thin read-only service →
route/UI. No RBAC *resource* is added beyond the existing closing/opportunity read
authorization; no mutating action exists anywhere in the feature.

### 4.1 TX-4 — Projection Composition (new ratified principle)

> **Every read surface over Closing state consumes the same pure projection modules
> and domain helpers; none rebuilds its own derivation.**

Concretely, the Timeline **reuses** rather than re-derives:
- **Domain labels/tones:** `escrowStatusLabel/Tone`, `financingStatusLabel/Tone`,
  `assignmentStatusLabel/Tone`, closing status/label helpers — so an `escrow.deposited`
  row reads identically to the Dashboard chip.
- **Stage vocabulary/order:** the exported stage ordering from
  `lib/transaction-dashboard.ts` (or a shared `lib/closing-stages.ts` extracted from
  it if a cleaner seam is warranted — a pure, no-behavior-change refactor reviewed on
  its own).
- **Readiness/blocker semantics:** if the Timeline ever annotates "still blocking,"
  it calls `closingReadinessSummary`/`blockingItems`, never a parallel computation.

Governance: Transaction Dashboard, Opportunity-list badges (#7), future reporting, and
the Timeline all consume the same pure modules. This prevents divergent blocker counts,
readiness, overdue calculations, and ordering across surfaces. A new read surface that
needs a shared derivation **extracts a pure helper** the others adopt, rather than
forking logic.

### 4.2 TX-5 — Projection Version (reserved, NOT implemented)

> **Reserved concept.** A *Projection Version* identifies the **rendering, ordering,
> and aggregation semantics** of a read surface — independent of the operational data
> it reads — analogously to how V1.3 lineage/fingerprints identify calculation
> semantics independent of inputs.

Intent (future): each read surface declares a `PROJECTION_VERSION` so a rendered
projection can state *which semantics produced it* (event-type inclusion set, ordering
rule, grouping/aggregation rule, label mapping). Bumping it signals a semantics change
without implying an operational-data change. **Nothing is implemented now.** This
package only reserves the name and the boundary so it can be introduced coherently
(and consistently across all TX-4 surfaces) when a semantics-versioning need actually
arises. Not a v1 deliverable; not a migration; no runtime behavior today.

### 4.3 The pure projection (`lib/transaction-timeline.ts`, proposed)

- **Input:** plain data only (TD-12 immutability posture) — an array of recorded
  events already mapped from Prisma in the service: `{ id, eventType, eventLabel,
  eventBody, actorName, occurredAtMs }`. No Prisma models cross the boundary; no clock
  read; dates as epoch ms.
- **Derivation:** classify each event into a small, closed set of **timeline
  categories** (e.g. Stage, Escrow, Financing, Assignment, Checklist, Documents,
  Underwriting) by `eventType` prefix — reusing the same family prefixes already in the
  data (§2.2) and the same label/tone helpers (TX-4). Produce a presentation-neutral
  `TimelineEntry[]` (category, tone, title, detail, actorName, occurredAtIso).
- **Ordering (see §4.5):** deterministic, total, DB-order-independent.
- **Purity:** never mutates input; returns new arrays — identical contract to Slice 5,
  so #7 and reporting can reuse it.

### 4.4 ActivityLog usage & the "as-recorded" boundary

The Timeline reads `ActivityLog` filtered by `{ organizationId, opportunityId }`,
newest-or-oldest-first (§4.5), joining `actor { name }`. Because the audit path is
best-effort (§2.2), the surface is labeled as a **recorded activity timeline** — an
honest narrative of what was logged — and is explicitly **not** presented as a
complete or authoritative ledger. Authoritative per-domain state remains owned by the
domains (and surfaced by the Dashboard). This keeps TX-0 within TX-2 projection purity.

### 4.5 Timeline ordering (deterministic)

Primary key `occurredAtMs`. Default **newest-first** (matches `/activity` precedent and
"what just happened"); a chronological **oldest-first** view is a pure sort flip.
Deterministic tie-breakers for same-timestamp events: (`occurredAtMs`) → stable event
category order → `eventLabel` → `id`, using plain `<`/`>` (not locale) exactly as
TD-10 established. Same-millisecond `createdAt` collisions are real (batched writes), so
the tie-break chain is required for stable screenshots/pagination.

### 4.6 UI composition

- **Mount:** a read-only **Timeline panel** on the Opportunity detail page
  (`app/(workspace)/opportunities/[id]/page.tsx`) — the deal's own history belongs on
  the deal. (A dedicated route is possible but unnecessary; decision deferred to the
  implementation plan.)
- **Presentation:** one entry per event — category chip (reusing domain tones), title
  (`eventLabel`), optional detail (`eventBody`), actor, timestamp. Grouping by day is a
  pure presentation option. **No inline editing, no actions, no mutation** — entries may
  deep-link *out* to the relevant Closing Center section (TX-3 posture).
- **Empty/degraded states:** an opportunity with no recorded events renders an explicit
  empty state, never a crash (TD-11 posture). A null actor renders "System" (existing
  precedent).
- **Reuse, not fork:** presentation primitives (chips/tones) come from the same
  components the Dashboard/Closing cards use (TX-4).

### 4.7 Pagination

Adopt the proven **offset pagination** (`count` + `take`/`skip`, `PAGE_SIZE`) from
`/activity` (§2.4) — least surprise, consistent with the codebase, and sufficient for
per-opportunity volumes. (Cursor pagination is noted as a future option if a single
opportunity ever accrues thousands of events; not warranted now.) The `count` +
`findMany` pair is the same one-query-pair shape the org feed already runs.

### 4.8 RBAC & isolation

- **Org isolation:** every query is `organizationId`-scoped (non-negotiable, matches
  all read services).
- **Authorization:** gated by the existing opportunity/closing **read** permission,
  fail-closed (`notFound()` when unauthorized), mirroring the Slice-5 `/closing` route.
  **No new RBAC resource** is introduced; the Timeline is a read view of data the user
  can already see on the opportunity.

---

## 5. Testing & verification plan (to execute only after ratification)

- **Unit (pure module) — CRITICAL ≥90% branch:** `lib/transaction-timeline.ts` added
  to `scripts/run-unit-tests.mjs` CRITICAL; tests for category classification (each
  family prefix + unknown fallback), deterministic ordering incl. same-timestamp
  tie-breaks, oldest/newest flip, empty input, never-mutates-input, null-actor → System.
- **E2E (`scripts/e2e-transaction-timeline.mjs`):** seed a single opportunity through a
  representative lifecycle (stage moves, escrow open/deposit, financing, assignment,
  checklist complete/waive, doc generation, underwriting decision), assert every event
  appears in order, org isolation, actor resolution, **NO writes** during read
  (count-before == count-after; updatedAt byte-identical), determinism across two runs.
- **Playwright (`tests/visual/transaction-timeline.spec.ts`):** panel renders ordered
  entries, category chips, empty state, deep-link-out targets, reader-role access,
  unauthenticated redirect, no console errors, keyboard/accessible-name,
  desktop/tablet/mobile screenshots.
- **Full gate:** typecheck, lint, unit, full E2E suite, Playwright, isolated build —
  all green before commit; **schema/migration unchanged** under Option A.
- **Performance benchmark (TX-A):** record the per-opportunity query timing on
  production-shaped data; decide Option A vs B against the agreed threshold.

---

## 6. Scope exclusions (explicit)

TX-0 does **NOT**: add a timeline table · replicate events · add any write/mutation ·
add a new domain or source of truth · modify Slices 1–5 or their records · modify the
Opportunity **list** or implement roadmap #7 (separate follow-up) · touch or read-through
into the frozen V1.3 underwriting **engine** (only reads already-recorded
`underwriting.decided` narration) · weaken/bypass the PAID + readiness gate · introduce
`PROJECTION_VERSION` runtime behavior (TX-5 reserved only) · add an index speculatively
(TX-A benchmark-gated) · introduce email/MJML/GrapesJS · begin D15.

---

## 7. Invariants (proposed — for the lock on ratification)

- **TX-0** Timeline is a read-only, single-opportunity chronological projection of
  already-recorded events; no new persistence/writes/domain.
- **TX-4** Projection Composition — all Closing read surfaces consume the same pure
  projection modules + domain helpers; none forks derivation.
- **TX-5** Projection Version — reserved concept (rendering/ordering/aggregation
  semantics, data-independent); not implemented in TX-0.
- **TL-1** Source = `ActivityLog` filtered by `{organizationId, opportunityId}`; direct
  key, no join for scoping.
- **TL-2** As-recorded boundary — presented as recorded activity, never an
  authoritative/complete ledger (audit path is best-effort).
- **TL-3** Deterministic total ordering (time → category → label → id; plain compares).
- **TL-4** Pure module: plain data in, new arrays out, no clock, no Prisma, never
  mutates input.
- **TL-5** Reuse domain label/tone/stage/readiness helpers (TX-4); no parallel
  derivation.
- **TL-6** Read-only UI: no actions/mutation; entries may deep-link OUT only.
- **TL-7** Org-scoped + fail-closed opportunity-read authorization; no new RBAC
  resource.
- **TL-8** Immutable snapshots (`EscrowEvent`/`UnderwritingDecision`/generated docs) are
  optional future enrichment, not a v1 dependency.
- **TL-9** No migration by default (Option A); any index is additive, benchmark-gated
  (TX-A), behavior-neutral.
- **TL-10** Event Integrity — every rendered timeline entry corresponds to **exactly one
  existing persisted event**. The Timeline may group or visually organize events, but it
  must **never synthesize** an entry with no persisted record behind it. Allowed:
  "Escrow opened" (a real `escrow.opened` row). Not allowed: a derived "Closing nearly
  complete" banner *as a timeline entry* unless that itself is a persisted event. (Aggregate
  status remains the Dashboard's job; the Timeline is strictly historical.)
- **TL-11** Snapshot Reference — when a timeline entry corresponds to an immutable
  snapshot (`EscrowEvent`, `UnderwritingDecision`, a generated Assignment Agreement or
  Offer Memo document), the entry **links back to the authoritative artifact** rather than
  copying its data. Projection, not duplication.

---

## 8. Why this is the right shape

It completes the Closing **read model** (Dashboard = breadth across deals; Timeline =
depth within one deal) using data the system already produces, adds no operational
surface area, and — via TX-4/TX-5 — sets the composition and versioning discipline that
keeps every future read surface (badges #7, reporting) coherent with the Closing Center
rather than drifting into parallel truths. It mirrors the V1.3 philosophy the founder
cited: semantics identified independently of data, one authoritative derivation reused
by many surfaces.

---

## 9. Decisions — RATIFIED (2026-07-16)

1. **Persistence path — Option A (code-only, NO index this slice).** Ship TX-0 with no
   migration; do **not** add an `ActivityLog` index in this slice. After release,
   benchmark realistic production usage; introduce
   `@@index([organizationId, opportunityId, createdAt])` **later**, as a dedicated
   additive optimization, **only if** the benchmark demonstrates need. ("Prove first,
   optimize second.")
2. **TX-4 Projection Composition — approved** as a standing architectural principle.
   Future read surfaces compose the existing pure projection modules; no duplicated
   readiness/blocker/milestone logic. A shared pure stage/label helper may be extracted
   *iff* a clean, behavior-neutral seam is warranted (reviewed on its own).
3. **TX-5 Projection Version — approved as a reservation only.** Do not implement.
4. **Mount point — approved: the Opportunity detail page**, beside the Closing Center.
   No separate top-level route (the user is already inside the transaction; the Timeline
   is the historical complement to the current-state Closing Center).
5. **Default ordering — approved: newest-first with an oldest-first toggle.**
6. **Scope exclusions (§6) and invariants (§7) — approved**, plus two founder additions:
   **TL-10 Event Integrity** and **TL-11 Snapshot Reference**.

**Post-ratification path:** move the accepted TX-0 decisions into the Closing Center
Architecture Lock (done); preserve this package as the decision record (this document);
produce a detailed TX-0 implementation plan; implement **only TX-0** on a dedicated
feature branch; run typecheck, lint, unit, full E2E, Playwright, isolated build; commit;
**stop before merge**. Do not implement roadmap #7. Do not add an `ActivityLog` index.
Do not create a timeline table.

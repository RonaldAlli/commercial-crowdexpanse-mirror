# Slice 5 — Transaction Dashboard · Architecture Decision Package

> **Status: ✅ RATIFIED by the founder 2026-07-16.** The accepted decisions are now authoritative in the [Closing Center Architecture Lock → Slice 5 — Transaction Dashboard](./CLOSING_CENTER_ARCHITECTURE_LOCK.md#slice-5--transaction-dashboard). This document is preserved as the **decision record**. Ratification notes: all TX-0/TX-1/TX-2/TX-3/TX-A cornerstones and TD-A…TD-L / TD-1…TD-9 approved as written, with **TD-L resolved — roadmap #7 (Opportunity-list closing badges) is a SEPARATE follow-up slice** (reuses this projection module but has its own plan/UI-review/Playwright/gate/release; the Opportunity list is NOT modified in Slice 5), and **TX-A confirmed — no `ActivityLog` index and no migration in Slice 5**. Builds on the frozen 1.3 baseline and the four LIVE Closing domains. Roadmap: `VERSION_1_4.md` #6 (Transaction Management) — *"a closing dashboard: all deals in-flight past `UNDER_CONTRACT`, their blockers, dates, and responsible parties."*

## 0. Premise (ratified discovery)

The founder ratified the discovery conclusion: **the Transaction Dashboard is a read-only PROJECTION, not a new operational domain.** Every datum it needs already exists — `Opportunity.stage`; the pure `closingProgress`/`blockingItems`/`closingReadinessSummary` helpers (Slice 1); the `EscrowRecord`/`FinancingRecord`/`AssignmentRecord`/`ClosingChecklist` status + milestone `DateTime` fields (each `opportunityId @unique`, so 1:1 joins are index-backed); the immutable terminal snapshots (`EscrowEvent`, Financing FC-J fields, Assignment execution fields); and `ActivityLog`. **No new business persistence is required.**

## Founder-articulated cornerstones (governing this slice)

- **TX-0 — Transaction Timeline (RESERVED, deferred).** A *single-opportunity chronological* projection over `ActivityLog` + milestone timestamps + immutable snapshots. No Timeline table, no duplicate events, no Timeline writes. **Not** part of Slice 5 — it is its own future slice with its own ratification. (Already reserved in the lock.)
- **TX-1 — Dashboard ≠ Timeline.** Two different projections over the same data:
  - **Transaction Dashboard** = *cross-opportunity, current-state* roll-up (many rows: Deal A → Ready / Escrow Blocked / Assignment Drafted). **This is Slice 5.**
  - **Transaction Timeline** = *single-opportunity, historical sequence* (Offer Accepted → Checklist Created → Escrow Opened → Deposit → Financing Cleared → Assignment Executed). **This is TX-0, deferred.**
  Different UI, different projection, same underlying data.
- **TX-2 — Projection purity.** Every dashboard card is **derived at read time** from `Opportunity` / `ClosingChecklist` / `EscrowRecord` / `FinancingRecord` / `AssignmentRecord` / `ActivityLog`. **Never cached, never persisted, never materialized.** Same deterministic discipline as 1.3 scenario comparison (Calculation Principle 5).
- **TX-3 — No new write path.** The dashboard is **orchestration, not ownership.** It contains **zero** mutating server actions. Every actionable element links *out* to the domain surface (the opportunity's Closing Center accordion), where the existing, already-authorized edit path lives.
- **TX-A — ActivityLog index (deliberate, inside Slice 5).** Do **not** add an index automatically. Benchmark, state expected scale, add only if justified. See §5.

---

## Decisions (TD-A … TD-L)

- **TD-A — Scope.** A read-only, **cross-opportunity** operational view of every deal **in-flight past `UNDER_CONTRACT`** — stages `UNDER_CONTRACT`, `BUYER_MATCHED`, `CLOSING` (proposal: `PAID` excluded as *closed*, offered as an optional "recently closed" filter, not the default). One **row per Opportunity** surfacing: deal identity (title · property), stage, **Closing readiness** (`N/M required` + Ready/Not-Ready), **Escrow** status, **Financing** status, **Assignment** status, the **next/overdue key date**, and the **responsible party** — each linking into that opportunity's Closing Center.
- **TD-B — Ownership / placement.** A **new dedicated read-only route** (proposed `/closing`, label "Closing" / "Transactions"). It **owns no record** — a projection surface only. Deliberately distinct from the existing `/dashboard` (acquisitions command center — entity counts + underwriting snapshot) and `/activity` (org-wide audit feed); neither is transaction-focused, so this is additive, not a rebuild.
- **TD-C — Projection composition (TX-2).** One **new PURE** module — proposed `lib/transaction-dashboard.ts` — that, given already-fetched domain records for an opportunity, returns a per-row view-model. It **reuses the existing single-source-of-truth helpers** (`closingReadinessSummary`, `escrowStatusLabel/Tone`, `financingStatusLabel/Tone`, `assignmentStatusLabel/Tone`) — never a second readiness or status calculation. Pure, unit-testable, no Prisma/clock inside the compute (dates passed in).
- **TD-D — Milestone aggregation (TX-2).** "Dates" are **derived at read time** by scanning the existing milestone `DateTime` fields (escrow open/due/deposited/contingency; the 8 financing milestone dates + funded; assignment resolved) and checklist `dueDate`s to compute a per-transaction **"next upcoming date"** and an **"overdue"** flag. A pure function over existing fields — nothing stored.
- **TD-E — Immutable snapshot usage.** For terminal/closed states, the projection reads the immutable snapshots (`EscrowEvent`, Financing FC-J fields, Assignment execution fields) **for display only** — never recomputing or mutating them; they remain the historical truth captured by their own slices.
- **TD-F — ActivityLog usage (scoped).** The **dashboard is current-state**, so it reads domain-record *status*, not the event log. `ActivityLog` is the **backbone of the Timeline (TX-0)**, not the dashboard. Proposal: the dashboard shows **no** per-row event history (that is TX-0); an optional "last updated" column, if wanted, is the *only* thing that would touch `ActivityLog` per row — and it is exactly what motivates the TX-A index question, so it is **opt-in and defaulted OFF** for Slice 5.
- **TD-G — RBAC.** **Reuse `CLOSING` read** (ADMIN + ACQUISITIONS + DISPOSITIONS + ANALYST all read; the read tier already exists). No new resource. Org-scoped. Read-only ⇒ no write permission is ever consulted (reinforces TX-3).
- **TD-H — UI composition.** A responsive **table/list of transaction rows**: per-domain status **badges** (reusing the existing label/tone helpers + `Badge`), a readiness indicator (reusing the accordion header's summary), a next-date / overdue chip, responsible party, and a link into the opportunity's Closing Center. **Filters:** by stage, by readiness (Ready / Not-Ready), and by blocked domain. Same a11y discipline as the accordion slice; extend the **existing Playwright visual harness** (per the Visual Testing standard) rather than adding tooling.
- **TD-I — No new write path (TX-3).** Every actionable element is a **link out** to the opportunity detail / Closing Center. **Zero** server actions that mutate escrow / financing / assignment / checklist state originate on the dashboard.
- **TD-J — No new persistence.** No model, table, column, or enum for the dashboard (a projection needs none). The **only** schema question in scope is the TX-A `ActivityLog` index — a *separate, benchmarked* decision defaulted to **not added** (§5).
- **TD-K — Underwriting boundary.** The dashboard **never reads into or writes** the underwriting engine (`lib/analysis.ts`, scenarios, findings, decisions, offer-memo). Consistent with CC-1 / EC-9 / FC-1 / AS-13. It is human operational orchestration.
- **TD-L — Relationship to roadmap #7 (list badges).** #7 (closing progress badges on the Opportunity list/board) is a **sibling** projection that can **reuse the same `lib/transaction-dashboard.ts` per-row view-model**. Proposal: keep Slice 5 scoped to the dedicated dashboard (#6); optionally fold #7 in as a thin reuse once the projection exists, or keep it a separate follow-up — **founder's call**.

## Invariants (TD-1 … TD-9)

- **TD-1** Read-only: the dashboard performs **no** writes; no mutating server action exists on it (TX-3).
- **TD-2** Projection purity: every card is recomputed from source records at read time — never cached, persisted, or materialized (TX-2).
- **TD-3** No new model / table / column / enum for the dashboard; a projection needs none (the TX-A index is a separate, deliberate decision).
- **TD-4** Dashboard ≠ Timeline: Slice 5 ships only the cross-opportunity **dashboard**; the single-opportunity **Timeline** is TX-0, deferred to its own ratified slice (TX-1).
- **TD-5** Single source of truth: reuses the existing pure readiness/status helpers — never a second readiness or status computation.
- **TD-6** Underwriting untouched: never reads/writes the deterministic engine; `lib/analysis.ts` and the 1.3 locks are inert to it.
- **TD-7** Org-scoped + `CLOSING`-read RBAC; cross-tenant access impossible.
- **TD-8** Orchestration not ownership: every edit affordance links out to the owning domain surface (TX-3).
- **TD-9** Deterministic display: given the same underlying records, the rendered dashboard is identical (no hidden state, no time-of-day drift beyond the explicit "overdue vs now" comparison, which is derived, not stored).

## 5. Performance / index analysis (TX-A)

**The core dashboard query needs no new index at current or reasonably-projected scale:**
- Candidate rows: `Opportunity WHERE organizationId = ? AND stage IN (UNDER_CONTRACT, BUYER_MATCHED, CLOSING)` — served by the existing `@@index([organizationId])` with `stage` as a cheap residual filter (in-flight deals are a small subset of a single org's opportunities).
- Per-row domain reads: `ClosingChecklist` / `EscrowRecord` / `FinancingRecord` / `AssignmentRecord` are each **`opportunityId @unique`** ⇒ **index-backed 1:1 joins**; checklist items filter by `checklistId`. No table scan.
- Production is effectively clean-slate (≈0 in-flight deals today), so there is **no measured pressure**.

**Recommendation (deliberate, per TX-A):**
- **Do NOT add the `ActivityLog` index for Slice 5.** It is only motivated by per-opportunity **event** reads — which belong to the **Timeline (TX-0)**, not the current-state dashboard (TD-F defaults the "last updated" column OFF). Adding it now would be speculative.
- If TX-0 (or an opt-in "last updated" column) is later approved, benchmark a per-opportunity event query and, only if justified, add an **additive, non-destructive** `@@index([organizationId, opportunityId, createdAt])` on `activity_log` — as its own ratified change.
- A composite `Opportunity @@index([organizationId, stage])` is a second *possible* future optimization; likewise **benchmark-gated, not assumed**.
- **Net for Slice 5: zero schema change.**

## 6. Scope exclusions (this slice)

- The **Transaction Timeline (TX-0)** — the single-opportunity chronological view — deferred to its own ratified slice.
- **Any new persistence** — no Timeline table, cached roll-ups, or materialized views (TX-2/TD-3).
- The **`ActivityLog` index** — deferred to a benchmarked TX-A decision (default: not added; §5).
- **Editing domain state from the dashboard** — every mutation stays on the owning domain surface (TX-3/TD-I).
- **Date-triggered reminders / notification fan-out** — still deferred (no scheduler).
- **Underwriting / analytics** — untouched (TD-K).
- **Roadmap #7 list badges** — a sibling reuse, in or out at the founder's discretion (TD-L), not assumed here.

## Proposed affected modules (on ratification — for reference, not yet built)

Pure `lib/transaction-dashboard.ts` (per-row view-model + milestone aggregation, unit-tested) · a read-only route `app/(workspace)/closing/page.tsx` (server component: one org-scoped in-flight query + 1:1 domain reads → projection) · `components/transaction-row.tsx` (+ filters), reusing existing `Badge` + status/readiness helpers · nav entry · unit tests + extended Playwright visual coverage · **no** migration, service, action, RBAC resource, or enum. On ratification, the accepted TD-/TX- decisions fold into `CLOSING_CENTER_ARCHITECTURE_LOCK.md` (§18).

---

**STOP — awaiting ratification.** No code, schema, route, or test will be written until the founder ratifies (with any modifications) this package.

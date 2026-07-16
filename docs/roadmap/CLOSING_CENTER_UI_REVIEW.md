# Closing Center — UI Composition Review (pre–Slice 4)

**Date:** 2026-07-16 · **Status:** Review only — no architecture change, no production change, no implementation. Presents presentation-layer options for a decision before Assignments (Slice 4).

**Scope note:** This concerns *only* how the Opportunity detail page composes its closing sub-domains on screen. The domain architecture (first-class records, pure gates, RBAC, ActivityLog audit, the FC-0/EC boundaries) is sound and is explicitly **not** under review here.

---

## 1. Current state (facts)

`app/(workspace)/opportunities/[id]/page.tsx` renders a two-column grid (`lg:grid-cols-3`):

- **Main column (`lg:col-span-2`)** — a vertical `space-y-6` stack of standalone `<article className="card">` blocks, in order:
  1. **Stage / terms / summary** (deal header: stage-move control, source/priority/target-close/contract-value/assignment-fee, summary)
  2. **Closing Checklist** (readiness badge, blocked-PAID explanation panel, per-category item groups)
  3. **Escrow** (lifecycle, earnest money, holder, dates, terminal history)
  4. **Financing** (FC-0 read-only underwriting-debt reference, lender, milestones, documents, lifecycle, terminal snapshot)
- **Sidebar (`lg:col-span-1`)** — Links (property/seller), Buyer Matches, Activity feed.

Each closing card is **independently self-contained**: it receives its own view-model + capability flags as props, renders its own empty-state, and gates its own controls. There is no shared closing container today — the cards simply sit adjacent in the stack.

## 2. The emerging problem

The page was designed when "closing" was one card. It is now **three** (soon **five**: + Assignments, + Transaction). Consequences as slices accrue:

- **Scroll length** — the deal header is pushed ever further from the closing work; a user managing Financing scrolls past Checklist + Escrow every time.
- **No visual grouping** — "what closing state is this deal in?" is answered by four separate badges scattered down a column, with no single closing-readiness surface.
- **Undifferentiated peers** — the Closing Checklist (the *gate*) renders as a sibling of Escrow/Financing (the *processes*), so the thing that actually blocks PAID looks like just another card.
- **Cognitive load** — every role sees every closing sub-domain expanded at full height, even ones not relevant to their task.

None of this is a defect. It is the predictable cost of stacking a growing domain in a flat list. Addressing it **now**, before Slice 4 adds a fifth card, is cheaper than after.

## 3. Options

Each option is presentation-only. Because every card is already a pluggable, prop-driven unit, **all four are achievable without touching any service, action, model, gate, or RBAC.** The only code that moves is the container in `page.tsx` (and, for C/D, a small amount of layout scaffolding).

### Option A — Status quo (stacked cards)
Keep the flat vertical stack; let Assignments/Transaction append as more cards.

```
[ Stage / terms / summary ]
[ Closing Checklist ▸ … ]
[ Escrow ▸ … ]
[ Financing ▸ … ]
[ Assignments ▸ … ]   ← Slice 4
[ Transaction ▸ … ]   ← Slice 6
```
- **Pro:** zero work; no regression risk; cards stay maximally simple.
- **Con:** the scroll/grouping/differentiation problems above compound with every slice. Not recommended past four cards.

### Option B — Tabbed Closing Center
Wrap the closing sub-domains in one "Closing Center" card with a tab/segmented control. The deal header and a **persistent readiness strip** stay above the tabs.

```
[ Stage / terms / summary ]
┌ Closing Center ───────── ● 3/5 required · Not ready ┐
│ [Due Diligence] [Escrow] [Financing] [Assign] [Txn] │
│ ─────────────────────────────────────────────────── │
│  (active tab body only)                              │
└──────────────────────────────────────────────────────┘
```
- **Pro:** constant page height regardless of slice count; one readiness header; a natural home for Slice 4/6 (add a tab); focuses the user on one sub-domain at a time.
- **Con:** hides non-active sub-domains (a closer scanning all states must click); tab state is client-side (each card is already a client component, so this is minor); needs a small shared tab shell.

### Option C — Collapsible accordion sections
One "Closing Center" card; each sub-domain is a collapsible section whose **header shows its status badge** even when collapsed. Checklist (the gate) pinned open at top.

```
[ Stage / terms / summary ]
┌ Closing Center ───────── ● 3/5 required · Not ready ┐
│ ▾ Due Diligence      3/5 required                    │
│    (expanded body)                                   │
│ ▸ Escrow             Deposited                        │
│ ▸ Financing          Clear to close                  │
│ ▸ Assignments        —                     ← Slice 4 │
│ ▸ Transaction        —                     ← Slice 6 │
└──────────────────────────────────────────────────────┘
```
- **Pro:** every sub-domain's *status* is visible at a glance (badges in headers) while its *detail* is collapsible; scales cleanly; no information hidden behind a click, only detail. Best "operational dashboard" feel.
- **Con:** slightly more layout logic than tabs; default expand/collapse policy needs a rule (suggest: Checklist open, others collapsed unless started).

### Option D — Dedicated closing sub-route
Move closing sub-domains to `/opportunities/[id]/closing` with its own layout (tabs or accordion inside), leaving the detail page as the deal overview.

```
/opportunities/[id]           → overview (header, terms, matches, activity)
/opportunities/[id]/closing   → Closing Center (its own tabbed/accordion layout)
```
- **Pro:** cleanest separation; the Closing Center gets a full canvas; overview page stays short.
- **Con:** biggest change; splits closing context across a navigation boundary; a closer loses the at-a-glance deal terms while working closing; more routing/loader work. Likely premature at five cards.

## 4. Recommendation

**Adopt Option C (accordion) — or Option B (tabs) if a lighter touch is preferred — as a thin container introduced *before* Slice 4**, so Assignments lands *into* the structured layout rather than as a sixth flat card that must be re-homed later.

Rationale:
- The operational reality of a closing is "many parallel workstreams, each with a status" — an accordion with status-bearing headers matches that mental model better than tabs (which imply one-at-a-time) or a flat stack (which implies equal, ungrouped peers).
- It **elevates the Checklist/gate** to the top of a named container, visually distinct from the process sub-domains it governs.
- It gives Slice 4/6 a **zero-architecture insertion point**: a new section, not a page redesign.
- It is reversible and low-risk: the container is pure layout over unchanged, already-isolated cards.

Whichever is chosen, keep two things fixed: (1) a **persistent closing-readiness header** on the container (reusing the existing `closingProgress`/`blockingItems` outputs — no new derivation), and (2) each sub-domain card unchanged internally (the container only wraps).

**Sequencing:** if approved, this container is a small, separately-gated UI slice run *before* Assignments (its own verification: typecheck/lint/build; no migration, no service change). Assignments then plugs in as one new section.

## 5. Reserved concept — Closing Timeline (not implemented)

Reserving, per direction — **concept only, no build, no schema today.**

Every closing record already emits milestones into surfaces that exist:
- **ActivityLog** carries typed events per sub-domain (`closing.*`, `escrow.*`, `financing.*`) — org- and opportunity-scoped, actor- and timestamp-stamped.
- Each record additionally carries **structured milestone timestamps** (e.g. Escrow `openedAt`/`depositedAt`/`resolvedAt`; Financing `applicationSubmittedDate`/`commitmentReceivedDate`/`conditionsSatisfiedDate`/`fundedDate`; Checklist item `completedAt`/`waivedAt`).

The emergent capability: a **single chronological "Closing Timeline"** that merges these already-recorded milestones into one audit stream on the Opportunity — a *read-only projection*, exactly like roadmap item #7 (list-level closing progress). It introduces **no new write path and no new source of truth** — it reads what the operational records already durably emit.

Explicitly deferred: no timeline model, no event bus, no new emission code. When built, it is a consumer/projection slice, not an architecture change. Noting it now so future sub-domains keep emitting clean, typed, timestamped milestones (they already do) and the projection stays trivial.

---

**Bottom line:** the architecture needs nothing. The presentation should gain a **Closing Center container (recommended: accordion) before Slice 4**, and the **Closing Timeline** should be reserved as a future read-only projection. Both are presentation/consumer concerns layered over the sound, unchanged domain.

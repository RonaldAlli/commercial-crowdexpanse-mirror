# Closing Center Architecture Lock

Design authority for **Version 1.4 — Closing Center**: the checklist-gated workflow
that carries a deal the last mile `UNDER_CONTRACT → BUYER_MATCHED → CLOSING → PAID`.
Ratified by the founder on 2026-07-15. This lock governs a **new domain** and does not
reopen, and must never modify, the frozen Version 1.3 baseline (`v1.3.0` / `release/1.3`).

Closing is **human, operational workflow** — the deliberate opposite of the
deterministic underwriting engine. It reuses the existing platforms (Documents, Tasks,
ActivityLog, the pipeline) rather than reinventing them, and it gates the irreversible
`PAID` milestone behind a satisfied closing checklist.

> **Delivery status:** **Slice 1 (Closing Foundation + Due Diligence + the PAID gate) is LIVE in production** (2026-07-15; prod **23 migrations**, serving `q0k2nXlweILTSGL6K8rS7`; `main` @ `8cfb343`). All decisions/invariants below were implemented as ratified, including the pre-release refinement that a blocked PAID move explains which required items remain (pure `blockingItems`/`closingBlockMessage`). Later slices (Escrow, Financing, Assignments, dashboard, list-level progress) remain deferred. **Version 1.4 is not complete.**

## 1. Scope

The first slice — **Closing Foundation + Due Diligence** — establishes the domain model
(template → instantiated checklist → items), the **Due Diligence** category, the
`CLOSING` RBAC resource, and the **`PAID` gate**. Later slices add Escrow, Financing,
Assignment-agreement generation, the closing dashboard, and date-triggered reminders,
each separately gated.

## 2. Locked decisions

| Key | Decision |
|---|---|
| **CC-A** | **Ownership model.** A first-class `ClosingChecklist` (1:1 with an `Opportunity`) composed of typed `ClosingChecklistItem`s (a `category`: `DUE_DILIGENCE`/`ESCROW`/`FINANCING`/`ASSIGNMENT`/`LEGAL`/`OTHER`). **Due Diligence items are NOT Tasks** — Tasks represent *work*; checklist items represent *required business state*. A Task or Document may **satisfy** an item (see `completionEvidenceType`) but is never the item itself. |
| **CC-B** | **Lifecycle.** Item status `PENDING` → `COMPLETE`, plus `WAIVED` and `NOT_APPLICABLE`. Fields: `required`, `owner`, `dueDate`, `completedBy`/`completedAt`, `waivedBy`/`waivedAt`/`waiverReason`. Closing records are **operational and mutable** (unlike the immutable underwriting surfaces). **Every state change is audited** via `ActivityLog`. |
| **CC-C** | **The gate (deterministic boundary).** A **pure** predicate `isClosingReady(checklist): boolean` — no DB writes, no notifications, no side effects, no underwriting interaction. The stage-move action composes `canMoveStage()` **AND** `isClosingReady()`; it **never replaces** existing stage authorization. "Satisfied" = every **required** item is `COMPLETE` or `WAIVED` (`NOT_APPLICABLE` is excluded from the gate). |
| **CC-D** | **RBAC.** A new `CLOSING` resource. **Read** = ADMIN + ACQUISITIONS + DISPOSITIONS + ANALYST (all four). **Write** = ADMIN + ACQUISITIONS + DISPOSITIONS. **Waiving a required item = ADMIN only** (a distinct check, like `canMergeOwners`). Future workflow-approval permissions remain separate. |
| **CC-E** | **Reuse, don't reinvent.** Closing reuses **Documents** (artifacts), **Tasks** (work), and **ActivityLog** (audit). No duplicate document or task systems. |
| **CC-F** | **Generated closing documents.** Every future generated closing document (assignment agreement, etc.) **inherits the Offer-Memo generated-document framework** ([Offer-Memo Lock](./OFFER_MEMO_ARCHITECTURE_LOCK.md): Documents-owned, immutable canonical snapshot + provenance + SHA-256, deterministic template) — **one** generated-document framework, many types, no duplicated rendering infrastructure. Deferred to a later slice. |
| **CC-G** | **Template architecture.** Checklist items are **never hardcoded**. A versioned `ClosingChecklistTemplate` (with `ClosingChecklistTemplateItem`s) is **instantiated** into a concrete `ClosingChecklist` by **snapshotting** (copying) its items. The instantiated checklist is thereafter **independent** of the template — the same one-way snapshot discipline as the 1.3 ScenarioSeed. (A seeded default template is *data*, not hardcoding.) |

Each `ClosingChecklistItem` (and template item) carries a **`completionEvidenceType`**:
`NONE` · `DOCUMENT` · `TASK` · `MANUAL` — declaring how the item is satisfied (e.g.
environmental report → `DOCUMENT`, call the utility → `TASK`, attorney approval →
`MANUAL`), so evidence expectations are data, not hardcoded logic.

## 3. Locked invariants

- **CC-1** — Closing is human workflow. It **never** reads, writes, or participates in
  the deterministic underwriting engine; the 1.3 locks, model/calc/ruleset lineage, and
  fingerprints are untouched.
- **CC-2** — An Opportunity **cannot reach `PAID`** unless its closing checklist is
  satisfied — enforced **server-side** in the stage-move action, **composed with** (never
  replacing) the role-based gate.
- **CC-3** — The gate predicate is **pure**, deterministic, unit-tested, and free of side
  effects.
- **CC-4** — Closing artifacts belong to **exactly one** Opportunity, are org-scoped, and
  are cascade-owned.
- **CC-5** — **Waiving a required item is explicit, reasoned, audited, and RBAC-gated
  (ADMIN)** — never silent.
- **CC-6** — Closing **reuses** Documents, Tasks, and ActivityLog; it does not reinvent
  them.
- **CC-7** — Generated closing documents follow the Offer-Memo generated-document
  discipline (deferred, reserved).
- **CC-8** — Stage-gating **extends** the pipeline additively; the frozen 1.3 baseline and
  the pipeline's role-based movement rules are not modified, only composed with.
- **CC-9** — **Closing templates are versioned.**
- **CC-10** — **Instantiated checklists are immutable with respect to template
  evolution** — a template update affects only newly-created checklists (snapshot on
  instantiate); it never rewrites an active deal.

## 4. Model (slice 1)

```
ClosingChecklistTemplate (org-scoped, versioned, one active per org)
  └─ ClosingChecklistTemplateItem (category, label, required, completionEvidenceType, position)
        │  instantiate = one-way SNAPSHOT/copy (CC-G/CC-10)
        ▼
ClosingChecklist (1:1 Opportunity; records sourceTemplateId + templateVersion)
  └─ ClosingChecklistItem (category, label, required, completionEvidenceType, position,
        status, owner, dueDate, completedBy/At, waivedBy/At, waiverReason,
        evidenceDocumentId?, evidenceTaskId?)
```

- **Instantiation** (`ensureClosingChecklist`): the first time an Opportunity needs a
  checklist, copy the org's active template's items into concrete items (status `PENDING`)
  and stamp `sourceTemplateId` + `templateVersion`. Idempotent — a second call returns the
  existing checklist. A default Due-Diligence template is seeded per org on first use.
- **The gate**: `moveOpportunityStage` → for a move to `PAID`, `ensureClosingChecklist`
  then require `isClosingReady`. The pure predicate reads only checklist item state.

## 5. Boundaries & security

- **Determinism boundary:** the gate predicate is pure/testable, but closing is **human
  workflow outside the deterministic engine** — it never touches `lib/analysis.ts`, the
  underwriting service, or any calc surface, and never becomes a calc input (CC-1).
- **Security:** every closing read/write is org-scoped and RBAC-checked server-side; the
  `PAID` gate is enforced server-side (never UI-only); waivers and state changes are
  audited; no cross-tenant leakage.
- **Migration:** additive only (new tables + enums). Production is a clean slate
  (0 opportunities/tasks/documents), so instantiation and the gate have no legacy data to
  reconcile.

## 6. Affected modules

- **New** `docs/architecture/CLOSING_CENTER_ARCHITECTURE_LOCK.md` (this file).
- **New** additive migration: closing tables + enums.
- **New** pure `lib/closing.ts` (`isClosingReady` + status helpers; unit-tested).
- **New** closing service (instantiation-with-snapshot, item operations, default-template seed).
- **`lib/permissions.ts`** — new `CLOSING` resource + an ADMIN-only waive check.
- **`app/(workspace)/opportunities/actions.ts`** — extend `moveOpportunityStage` to compose the gate (additive).
- Opportunity detail UI — a closing-checklist card (Due Diligence category + item controls).
- Reuse Documents/Tasks/ActivityLog (no new document or task system).

## 7. Scope exclusions (this slice)

Escrow tracking · financing tracking · **assignment-agreement generation** (a later slice
under CC-F) · the closing dashboard (#6) · **date-triggered reminders / scheduler** (no
infrastructure exists today; reminders currently derive from ActivityLog) · object-storage
migration · a full template-administration UI (slice 1 seeds a default template and
snapshots from it). Automated buyer/seller communication and AI are 2.0.

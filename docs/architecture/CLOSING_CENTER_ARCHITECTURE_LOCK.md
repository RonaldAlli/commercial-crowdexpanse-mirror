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

---

# Slice 2 — Escrow

Ratified by the founder on 2026-07-15. Escrow is **Closing Center Slice 2** — the second
category of the last-mile workflow. It lives inside this lock (not a separate one) because
`ESCROW` was already a reserved `ChecklistItemCategory` (CC-A) and escrow is Closing-domain
work. Escrow is a **financial process with a money lifecycle**, distinct from a checklist
item (which expresses required *business state*): a checklist item cannot carry an amount,
a deposited→released/refunded/forfeited outcome, or proof-of-deposit — so escrow is a
**first-class record**, never a checklist item.

## 8. Escrow — locked decisions (EC-A…EC-J)

| Key | Decision |
|---|---|
| **EC-A** | **Ownership.** A first-class **`EscrowRecord`** (1:1 with an `Opportunity`, `opportunityId @unique`), org-scoped and cascade-owned — mirroring `ClosingChecklist`. **Never** a checklist item. The `ESCROW` checklist category remains available and independent. |
| **EC-B** | **Lifecycle.** `NOT_OPENED → OPENED → DEPOSITED →` one terminal of `RELEASED` / `REFUNDED` / `FORFEITED`. Every transition records **actor + timestamp (+ reason where applicable)** and is **audited**. Transitions are validated by a pure guard (`isValidEscrowTransition`). |
| **EC-C** | **Money.** `earnestAmountUsd Int` — whole USD, consistent with the operational system (`contractValueUsd`/`assignmentFeeUsd`). `Decimal` is reserved exclusively for underwriting. Single-currency. |
| **EC-D** | **Holder.** Free-text `escrowHolderName` / `escrowHolderContact`. **No `Party`/company model** is introduced in this slice. |
| **EC-E** | **Dates.** `openedDate`, `earnestDueDate`, `depositedDate`, `contingencyDeadline` (`DateTime?`) — stored and surfaced. **Reminders are NOT implemented** (no scheduler infrastructure; same deferral as slice 1). |
| **EC-F** | **Documents.** Proof of deposit is a scalar `proofOfDepositDocumentId` (no FK, like `evidenceDocumentId`), reusing Documents. No duplicate file management. |
| **EC-G** | **RBAC.** Ordinary escrow reads/edits (open, amount, dates, holder, link proof, mark `DEPOSITED`) = **`CLOSING`** (write ADMIN/ACQUISITIONS/DISPOSITIONS, read +ANALYST). **Terminal money resolutions (`RELEASED`/`REFUNDED`/`FORFEITED`) = ADMIN only** — a distinct `canResolveEscrow` check (like `canWaiveClosingItem`). No new RBAC resource. |
| **EC-H** | **PAID gate — unchanged.** The gate stays `canMoveStage()` **AND** `isClosingReady()`. Escrow is **NOT** hardcoded into it. If an org wants escrow to gate `PAID`, it adds a **required `ESCROW` checklist item** — policy stays in configuration, never embedded in business logic. The existing gate is composed-with, never weakened or bypassed. |
| **EC-I** | **Escrow snapshot (append-only).** Every **terminal** transition captures an **immutable snapshot** — `amount`, `holder`, `proofDocumentId`, `actor`, `timestamp` (+ `reason`) — into an append-only **`EscrowEvent`** row, so later edits to the record can never rewrite a historical financial event. Mirrors the append-only philosophy of the 1.3 `UnderwritingDecision`. Once terminal, the `EscrowRecord` is **frozen** (the service rejects further mutation). |
| **EC-J** | **Checklist synchronization (optional, explicit, never automatic).** When an `ESCROW` checklist item exists, once escrow reaches `DEPOSITED` the UI **may offer** a "mark this checklist item complete" action that invokes the existing `completeChecklistItem`. It is a human, one-click affordance — escrow status **never** auto-completes a checklist item. No new coupling in the data model. |

## 9. Escrow — locked invariants (EC-1…EC-11)

- **EC-1** — Escrow is human workflow; it never reads, writes, or participates in the deterministic underwriting engine (extends CC-1).
- **EC-2** — Exactly one `EscrowRecord` per `Opportunity`; org-scoped; cascade-owned.
- **EC-3** — Money is `Int` USD; no `Decimal`, no cents, no multi-currency.
- **EC-4** — Terminal resolutions are explicit, reasoned, **ADMIN-only**, and audited — never silent.
- **EC-5** — Every escrow state change writes an `ActivityLog` event (reuse, don't reinvent).
- **EC-6** — The `PAID` gate is composed-with, never weakened or bypassed; escrow never silently gates `PAID`.
- **EC-7** — Escrow reuses Documents (proof) and ActivityLog (audit); no duplicate document/notification systems.
- **EC-8** — Escrow status transitions are validated by a pure, unit-tested guard; illegal transitions are rejected.
- **EC-9** — Escrow records never participate in underwriting **calculations**.
- **EC-10** — Escrow state changes never modify Scenario, Financing, Findings, Recommendations, Decisions, or Offer-Memo artifacts.
- **EC-11** — **Terminal escrow events are immutable historical facts** — the `EscrowEvent` snapshot is append-only (never updated or deleted), and a terminal `EscrowRecord` is frozen against further edits.

## 10. Escrow — model (slice 2)

```
Opportunity
  └─ EscrowRecord (1:1, @unique opportunityId) — MUTABLE operational state until terminal
       status, earnestAmountUsd, escrowHolderName/Contact,
       openedDate/earnestDueDate/depositedDate/contingencyDeadline,
       proofOfDepositDocumentId, openedBy/At, depositedBy/At, resolvedBy/At, resolutionReason
        │  a terminal transition writes ↓ (and freezes the record)
        ▼
  EscrowEvent (append-only, IMMUTABLE) — the historical financial fact
       type (RELEASED|REFUNDED|FORFEITED), amountUsdSnapshot, holderNameSnapshot,
       proofDocumentIdSnapshot, actorId, occurredAt, reason
```

- **Boundaries/security:** every escrow read/write is org-scoped + RBAC-checked server-side; terminal resolution is ADMIN-only; all changes audited; cross-tenant access impossible. Escrow never touches `lib/analysis.ts` or any underwriting/offer-memo surface (EC-1/EC-9/EC-10).
- **Migration:** additive only (2 enums + 2 tables, 0 destructive); prod is a clean slate (0 opportunities) so there is no legacy data to reconcile.
- **Affected modules:** additive migration · pure `lib/escrow.ts` · `lib/escrow-service.ts` · `lib/permissions.ts` (+`canResolveEscrow`, reuse `CLOSING`) · escrow server actions · Opportunity detail escrow card (+ EC-J affordance) · unit + `scripts/e2e-escrow.mjs`.
- **Scope exclusions (this slice):** date-triggered reminders / scheduler · multi-currency · a first-class escrow-holder/title-company `Party` entity · automatic escrow↔checklist coupling · escrow as a hardcoded `PAID` gate · Financing/Assignments/dashboard (later slices) · any underwriting interaction.

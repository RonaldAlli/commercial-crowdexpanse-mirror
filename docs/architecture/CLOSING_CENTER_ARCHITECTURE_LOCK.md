# Closing Center Architecture Lock

Design authority for **Version 1.4 — Closing Center**: the checklist-gated workflow
that carries a deal the last mile `UNDER_CONTRACT → BUYER_MATCHED → CLOSING → PAID`.
Ratified by the founder on 2026-07-15. This lock governs a **new domain** and does not
reopen, and must never modify, the frozen Version 1.3 baseline (`v1.3.0` / `release/1.3`).

Closing is **human, operational workflow** — the deliberate opposite of the
deterministic underwriting engine. It reuses the existing platforms (Documents, Tasks,
ActivityLog, the pipeline) rather than reinventing them, and it gates the irreversible
`PAID` milestone behind a satisfied closing checklist.

> **Delivery status:** **Slices 1, 2, 3 & 4 are LIVE in production.** **Slice 1** (Closing Foundation + Due Diligence + the PAID gate) — 2026-07-15; all CC decisions/invariants implemented as ratified, including the refinement that a blocked PAID move explains which required items remain. **Slice 2 — Escrow** (§8–10 below, EC-A…EC-J / EC-1…EC-11) — 2026-07-16; prod **24 migrations**, serving `hJJCViPhweeyHioi_UMkP`, `main` @ `53847f4`. **Slice 3 — Financing** (§11–14 below, FC-0…FC-J / FC-1…FC-15) — 2026-07-16; prod **25 migrations**, serving `YJdWgq0rNRz7tPNraoOhD`, `main` @ `a29067a`; all FC decisions/invariants implemented as ratified, including FC-15 (the underwriting reference is an ephemeral read-only view) and FC-J's lighter-than-Escrow snapshot-in-record (no separate ledger, FC-I). **Slice 4 — Assignments** (§15–17 below, AS-A…AS-N / AS-1…AS-15) — 2026-07-16; prod **26 migrations**, serving `T6JdJGzrYR-a6lWtEhnmS`, `main` @ `f887adc`; all AS decisions/invariants implemented as ratified, including the **revised AS-J** (Assignments do NOT seed the default template — Closing policy stays configurable, consistent with Escrow/Financing) and the CC-F reuse of the Offer-Memo generated-document framework (Documents-owned, immutable, per-Opportunity `generationSequence`; offer-memo path untouched, AS-8). Later slices (Transaction Dashboard, list-level progress) remain deferred. **Version 1.4 is not complete.**

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

---

# Slice 3 — Financing

Ratified by the founder on 2026-07-16. Financing is **Closing Center Slice 3** — operational
tracking of the buyer's / assignee's financing status and contingencies (their ability to
close). It is the deliberate opposite of the V1.3 **underwriting** financing stack
(`Scenario → FinancingCase → FinancingCaseResult`, deterministic): that engine *computes*
debt (loan sizing, DSCR, LTV/LTC, amortization); Closing Financing *tracks a lender's real
process*. A repository inventory confirmed **no operational financing model/fields exist**
today (only the deterministic underwriting stack + the deprecated `DealAnalysis`), so this is
a genuinely new mechanism with nothing to migrate.

## 11. Financing — the reference boundary (FC-0, load-bearing)

**FC-0 — Financing Reference Boundary.** Closing Financing **may reference** underwriting
outputs **read-only**, through the existing narrow one-way seam (`getActiveScenarioResult`-
style, read at render time — the same discipline as the offer memo). It **never owns, copies,
caches, or mutates** loan amount · DSCR · LTV/LTC · leverage · amortization · underwriting
assumptions. Those remain **exclusively owned by Version 1.3**. Closing Financing owns
**operational milestones only**: lender · application submitted · appraisal ordered/complete ·
commitment received · conditions received/satisfied · closing package received · funding
status.

## 12. Financing — locked decisions (FC-A…FC-J)

| Key | Decision |
|---|---|
| **FC-A** | **Ownership.** A first-class **`FinancingRecord`** (1:1 with an `Opportunity`, `opportunityId @unique`), org-scoped, cascade-owned — mirroring `EscrowRecord`. **Not** a checklist item; **not** the underwriting `FinancingCase`. |
| **FC-B** | **Lifecycle.** `NOT_STARTED → APPLIED → COMMITTED → CLEARED → FUNDED`, with terminal off-ramps `DENIED` / `WITHDRAWN` reachable from the active non-terminal states. Each milestone is recorded independently (dates on the record); who/when for each transition is in `ActivityLog`. Validated by a pure `isValidFinancingTransition` guard. |
| **FC-C** | **Money — none.** Financing tracks *status*, not *amounts*. **No monetary fields** in this slice; all financing economics stay underwriting-owned (FC-0). A lender's actual commitment amount, if ever needed, is introduced later as an explicitly operational field — never borrowed from underwriting. |
| **FC-D** | **Lender.** Free-text `lenderName` / `lenderContact`. **No `Party` model** in this slice. |
| **FC-E** | **Documents.** Reuse Documents. **Inventory decision:** FC-J concretely needs exactly two documents — **commitment letter + appraisal** — so this slice uses **scalar `commitmentLetterDocumentId` / `appraisalDocumentId`** (no FK, like `evidenceDocumentId`). *If* the owned-document set grows (application · conditions · final approval become first-class needs), replace the scalars with a generic **`FinancingDocument`** link table (type enum + scalar document id) — a planned refactor, deferred by the rule of three. No duplicate file storage. |
| **FC-G** | **RBAC.** Ordinary financing work (apply, advance, set lender, set milestone dates, link documents) = **`CLOSING`** (write ADMIN/ACQUISITIONS/DISPOSITIONS, read +ANALYST). **Terminal resolution (`FUNDED`/`DENIED`/`WITHDRAWN`) = ADMIN only** — a distinct `canResolveFinancing` check (like `canResolveEscrow`). No new RBAC resource. |
| **FC-H** | **PAID gate — unchanged.** The gate stays `canMoveStage()` **AND** `isClosingReady()`. Financing is **NOT** hardcoded into it (never `isClosingReady() AND financingStatus == FUNDED`). An org makes financing blocking by adding a **required `FINANCING` checklist item** — policy in configuration. Composed-with, never weakened. |
| **FC-I** | **No event ledger.** Unlike Escrow (which holds custody of money), Financing tracks an external lender's process, so there is **no separate append-only `FinancingEvent` table**. The independently-recorded milestones already preserve the history. |
| **FC-J** | **Commitment snapshot (on the record, before freeze).** When status becomes a terminal outcome (`FUNDED` / `DENIED` / `WITHDRAWN`), the resolve operation captures — **inside the `FinancingRecord` itself, before freezing** — a snapshot of `lenderName`, the commitment document id, the appraisal document id, plus actor + timestamp + reason. After a terminal transition the record is **frozen** (the service rejects further mutation), so those values are durable historical facts. *(WITHDRAWN is included alongside the founder's named FUNDED/DENIED for consistency — it too freezes.)* |

## 13. Financing — locked invariants (FC-1…FC-15)

- **FC-1** — Financing is human operational workflow; it never reads, writes, or participates in the underwriting engine's computation.
- **FC-2** — Exactly one `FinancingRecord` per `Opportunity`; org-scoped; cascade-owned.
- **FC-3** — *(FC-0)* Financing references underwriting output **read-only** via the narrow seam; it never owns, copies, caches, or mutates loan amount / DSCR / LTV / LTC / leverage / amortization / underwriting assumptions.
- **FC-4** — Financing owns operational milestones only (lender, application, appraisal, commitment, conditions, closing package, funding) — no financing economics.
- **FC-5** — No monetary or financial-calculation fields in this slice.
- **FC-6** — Terminal states are explicit, reasoned, actor+timestamped, freeze the record, and are ADMIN-only.
- **FC-7** — Every state change writes an `ActivityLog` event.
- **FC-8** — The `PAID` gate is composed-with, never weakened; financing gates `PAID` only via a required `FINANCING` checklist item.
- **FC-9** — Reuse Documents; scalar ids, no FK; no duplicate document system.
- **FC-10** — Status transitions are validated by a pure, unit-tested guard; illegal transitions are rejected.
- **FC-11** — Financing never modifies Scenario / FinancingCase / Findings / Recommendation / Decision / Offer-Memo / Escrow artifacts.
- **FC-12** — A `FinancingRecord` never changes the underwriting `FinancingCase`.
- **FC-13** — A `FinancingRecord` may reference the active `FinancingCase` but never persists underwriting-derived calculations.
- **FC-14** — Funding status never triggers underwriting recalculation.
- **FC-15** — *Underwriting reference freshness.* The Financing panel treats the underwriting reference as an **ephemeral view**: it is always read through the `getActiveScenarioResult` seam at render time and never persisted or cached inside `FinancingRecord`. When there is no active underwriting scenario, the UI displays "No active underwriting available." explicitly rather than storing or rendering placeholder values. This keeps the FC-0 boundary perfectly intact.

## 14. Financing — model (slice 3)

```
Opportunity
  └─ FinancingRecord (1:1, @unique opportunityId) — operational status + milestones
       status (NOT_STARTED→APPLIED→COMMITTED→CLEARED→FUNDED | DENIED | WITHDRAWN),
       lenderName/Contact,
       applicationSubmittedDate, appraisalOrderedDate, appraisalCompletedDate,
       commitmentReceivedDate, conditionsReceivedDate, conditionsSatisfiedDate,
       closingPackageReceivedDate, fundedDate,
       commitmentLetterDocumentId?, appraisalDocumentId?,
       — FC-J terminal snapshot (captured before freeze) —
       resolvedById?, resolvedAt?, resolutionReason?,
       resolutionLenderNameSnapshot?, resolutionCommitmentDocumentIdSnapshot?,
       resolutionAppraisalDocumentIdSnapshot?

  ┄┄ read-only reference (FC-0) ┄┄▶ underwriting active FinancingCase / result
     (via getActiveScenarioResult — displayed for context, never persisted here)
```

- **Boundaries/security:** every financing read/write is org-scoped + RBAC-checked server-side; terminal resolution is ADMIN-only; all changes audited; cross-tenant access impossible. Financing never touches `lib/analysis.ts`, the underwriting service's compute path, or any underwriting/offer-memo/escrow surface (FC-1/FC-11/FC-12/FC-14).
- **Migration:** additive only (1 enum + 1 table, 0 destructive); prod is a clean slate so there is no legacy data to reconcile.
- **Affected modules:** additive migration · pure `lib/financing.ts` · `lib/financing-service.ts` · `lib/permissions.ts` (+`canResolveFinancing`, reuse `CLOSING`) · financing server actions · Opportunity detail financing card (+ a read-only underwriting-debt reference panel, FC-0) · unit + `scripts/e2e-financing.mjs`.
- **Scope exclusions (this slice):** monetary/amount fields · a `Party`/lender entity · multi-lender / multiple-application tracking · a generic `FinancingDocument` table (until the doc set grows) · a `FinancingEvent` ledger · date-triggered reminders / scheduler · any write into or coupling with the underwriting engine · Assignments/dashboard (later slices).

---

# Slice 4 — Assignments

> **Delivery status:** **LIVE in production 2026-07-16** (AS-A…AS-N, AS-1…AS-15; `main` @ `f887adc`, prod 26 migrations, serving `T6JdJGzrYR-a6lWtEhnmS`). The core wholesale transaction: assignment-agreement generation, assignor/assignee parties, the assignment fee, and execution. First Closing Center slice that BRIDGES two frameworks — the operational Closing workflow (a new first-class record) and the v1.3 generated-document infrastructure (CC-F: the agreement inherits the Offer-Memo framework). Human workflow, strictly OUTSIDE the underwriting engine. AS-J was **revised before release** (Assignments do not seed the default template — see AS-J below).

## 15. Assignments — ratified decisions (AS-A…AS-N)

- **AS-A** *Ownership.* A first-class `AssignmentRecord`, 1:1 with `Opportunity` (org-scoped, cascade), NOT a checklist item and NOT part of the underwriting engine. Mirrors `EscrowRecord`/`FinancingRecord` (idempotent `ensureAssignment`, the six-file domain pattern).
- **AS-B** *Lifecycle (lean).* `NOT_STARTED → DRAFTED → EXECUTED`, with a `CANCELLED` off-ramp. NO `SENT`/`SIGNED`/e-sign/DocuSign states until a real electronic-signature integration exists. `DRAFTED` is reached by generating the agreement; `EXECUTED`/`CANCELLED` are terminal.
- **AS-C** *Parties (hybrid).* Optional **scalar references** to existing rows — `assignorSellerId` (defaults from `Opportunity.sellerId`), `assigneeBuyerId` (a confirmed `BuyerMatch` buyer) — **no FK** (house idiom), PLUS free-text fallback (`assignorName`/`assignorContact`/`assigneeName`/`assigneeContact`) for off-system parties. No `Party` domain (AS-11).
- **AS-D** *Assignment fee.* The fee's single source of truth stays `Opportunity.assignmentFeeUsd` — NOT duplicated as a live field on the record. It is **snapshotted only upon execution** (`executedFeeUsdSnapshot`), preserving operational history + auditability + single source of truth.
- **AS-E** *Generated agreement (CC-F, Option 3).* The agreement inherits the Offer-Memo generated-document framework (immutable `GENERATED` Document + canonical snapshot + SHA-256 + append-only `generationSequence` + provenance). New `DocumentType.ASSIGNMENT_AGREEMENT`; new pure renderer `lib/documents/assignment-agreement.ts`; new service on the identical recipe. The Document model is anchored on the Opportunity, not a scenario: add a nullable `Document.sourceOpportunityId` + a new `@@unique([sourceOpportunityId, documentType, generationSequence])`. Offer-memo rows carry `sourceOpportunityId = null`, so their unique key, `sourceScenario*` fields, and behavior are **untouched** (AS-8). The Document model is NOT generalized to a polymorphic source yet.
- **AS-F** *PAID gate.* Unchanged and composed exactly as today (`canMoveStage AND isClosingReady`). Assignments gates PAID **only** via a required `ASSIGNMENT` checklist item **when an org has configured one** — never an `if assignment.executed` branch, and never by auto-completing the item on execution. Flow is Checklist → Policy → Gate.
- **AS-G** *RBAC.* Ordinary work (parties, generate/regenerate the draft) = `CLOSING` write (reuse). Terminal execute/cancel = new ADMIN-only `canExecuteAssignment(role)` (mirrors `canResolveEscrow`/`canResolveFinancing`). Agreement generation additionally requires `DOCUMENT` `CREATE` (dual-check, exactly like offer-memo).
- **AS-H** *Terminal snapshot (no ledger).* On EXECUTED (and CANCELLED) capture `resolvedById`/`resolvedAt`/`resolutionReason` and, for EXECUTED, the immutable snapshot (fee, contract value, party names, generated-agreement doc id) INSIDE the record, then freeze it — Financing FC-J/FC-I pattern, NO `AssignmentEvent` table. The generated agreement Document already provides immutable evidence.
- **AS-I** *Underwriting boundary (strong).* The agreement template must NEVER read Scenario / FinancingCase / ScenarioResult / Findings / Recommendation / Decision / Offer-Memo. Assignments belong entirely to operational Closing. No `lib/analysis.ts` touch, no underwriting seam.
- **AS-J** *Default checklist item (REVISED — founder decision, pre-release Slice 4).* Assignments do **NOT** seed the default closing template. The default stays **Due Diligence only**, keeping Closing policy configurable and consistent with Escrow and Financing — a domain never auto-mutates the checklist, and orgs that never assign contracts must not waive an item on every deal. The `ASSIGNMENT` category exists; an org that runs assignment deals **adds** a required `ASSIGNMENT` item itself, and executing an assignment never auto-completes it. The PAID gate is unchanged: `canMoveStage AND isClosingReady` over whatever items exist. *(Superseded the original AS-J, which seeded one required item by default.)*
- **AS-L** *Generated-agreement freshness.* Draft agreements are regenerated from CURRENT operational data until execution. Once `EXECUTED`, generation is DISABLED and the executed document is the immutable, legally-operative artifact — removing ambiguity about which version governs.
- **AS-M** *Agreement version display.* Multiple pre-execution drafts are shown as `Draft 1 / 2 / 3` via the existing generated-document `generationSequence` (never overwritten). After `EXECUTED`, the executed agreement is highlighted; prior drafts are retained as history.
- **AS-N** *Opportunity summary (future UI).* A small Assignment status (`Drafted` / `Executed` / `Cancelled`) surfaces on the Opportunity page header — a status indicator, not new architecture.

## 16. Assignments — locked invariants (AS-1…AS-15)

- **AS-1** Human operational workflow; never reads/writes the underwriting engine or the 1.3 locks/lineage/fingerprints.
- **AS-2** Exactly one `AssignmentRecord` per `Opportunity`; org-scoped; cascade-owned.
- **AS-3** The assignment fee's single source of truth is `Opportunity.assignmentFeeUsd`; the record holds only an execution snapshot, never a divergent live copy.
- **AS-4** Terminal states (EXECUTED / CANCELLED) are explicit, reasoned, actor+timestamped, freeze the record, and are ADMIN-only.
- **AS-5** Every state change writes an `ActivityLog` event.
- **AS-6** The `PAID` gate is composed-with, never weakened; Assignments gates `PAID` only via a required `ASSIGNMENT` checklist item.
- **AS-7** The generated agreement inherits the Offer-Memo framework (immutable `GENERATED` Document, snapshot + SHA-256 + append-only sequence + provenance).
- **AS-8** The shared `Document` model is extended ADDITIVELY only; the frozen v1.3 offer-memo generation path (its unique key, `sourceScenario*` fields, and behavior) is untouched.
- **AS-9** The status-transition guard + execution-snapshot builder are pure and unit-tested.
- **AS-10** The agreement references only operational data — never underwriting outputs.
- **AS-11** Parties reference existing Buyer/Seller by scalar id (no FK) or free-text; no `Party` entity is introduced.
- **AS-12** Draft agreements may be regenerated; executed agreements become immutable historical artifacts (generation disabled once EXECUTED).
- **AS-13** Assignment execution never modifies underwriting outputs.
- **AS-14** Assignment generation reads only operational Opportunity, property, party, and financial-summary data defined by the Assignment domain.
- **AS-15** Generated Assignment agreements follow the same deterministic document-generation guarantees as the Offer Memo (deterministic render, file-first, SHA-256, append-only) while remaining independently versioned.

## 17. Assignments — model (slice 4)

```
Opportunity ──1:1── AssignmentRecord
   │  (assignmentFeeUsd, contractValueUsd — fee SoT stays here, AS-D)
   │
   └── AssignmentRecord {
         status  NOT_STARTED → DRAFTED → EXECUTED | CANCELLED  (AS-B)
         — parties (AS-C, scalar-id no FK + free-text) —
         assignorSellerId?, assignorName?, assignorContact?,
         assigneeBuyerId?,  assigneeName?,  assigneeContact?,
         — terminal resolution (AS-H, set on EXECUTED/CANCELLED, then frozen) —
         resolvedById?, resolvedAt?, resolutionReason?,
         — execution snapshot (AS-D/AS-H, EXECUTED only) —
         executedFeeUsdSnapshot?, executedContractValueUsdSnapshot?,
         executedAssignorNameSnapshot?, executedAssigneeNameSnapshot?,
         executedAgreementDocumentIdSnapshot?
       }

   generated agreement (CC-F / AS-E) ─▶ Document {
     documentType: ASSIGNMENT_AGREEMENT, origin: GENERATED,
     sourceOpportunityId (NEW anchor), generationSequence (append-only, AS-M),
     contentSnapshot + contentSha256 (deterministic, AS-15) }
     @@unique([sourceOpportunityId, documentType, generationSequence])  ← offer-memo untouched (AS-8)
```

- **Boundaries/security:** every assignment read/write is org-scoped + RBAC-checked server-side; execute/cancel is ADMIN-only; agreement generation is dual-checked (`CLOSING` write + `DOCUMENT` create); all changes audited; cross-tenant access impossible. Assignments never touch `lib/analysis.ts` or any underwriting/offer-memo surface (AS-1/AS-10/AS-13).
- **Migration:** additive only (1 enum + 1 table + `DocumentType.ASSIGNMENT_AGREEMENT` + `Document.sourceOpportunityId` + one new unique key, 0 destructive); the fee column already exists.
- **Affected modules:** additive migration · pure `lib/assignment.ts` + `lib/documents/assignment-agreement.ts` · `lib/documents/assignment-agreement-service.ts` (CC-F recipe) · `lib/assignment-service.ts` · `lib/permissions.ts` (+`canExecuteAssignment`, reuse `CLOSING`) · `lib/closing.ts` (default template unchanged — AS-J revised, no seeded `ASSIGNMENT` item) · assignment server actions · Opportunity detail assignment card (accordion section) + AS-N header summary · unit + `scripts/e2e-assignment.mjs` + Playwright visual coverage.
- **Scope exclusions (this slice):** electronic signature / DocuSign / send-for-signature · a `Party` entity · polymorphic `Document.source` generalization · multi-assignee tracking · date-triggered reminders · any write into or coupling with the underwriting engine · Transaction Dashboard (Slice 5).

---

# Reserved concept — TX-0: Transaction Timeline (NOT ratified, NOT scheduled)

> **Status: RESERVED (founder request, 2026-07-16).** A conceptual placeholder only — no architecture, no schema, no implementation. Recorded so the future **Transaction Dashboard (Slice 5)** lands onto an intended backbone rather than an ad-hoc one. Requires its own ratification before any work begins.

- **TX-0 (Transaction Timeline).** With four operational Closing domains now emitting structured, timestamped, org-scoped events (Due Diligence · Escrow · Financing · Assignment) plus stage transitions, a **per-transaction (per-Opportunity) chronological timeline** becomes expressible as a **pure read-only PROJECTION** — assembled at read time from data that **already exists**: `ActivityLog` (every domain transition + `opportunity.stage_changed`, each carrying actor + `createdAt`), the milestone `DateTime`s on the domain records (escrow open/due/deposited/contingency, the 8 financing milestone dates + funded, assignment resolved), and the **immutable terminal snapshots** (`EscrowEvent`, the Financing FC-J fields, the Assignment execution fields). It introduces **NO new writes and NO duplicate storage** — it never persists a second copy of an event; it reads and orders what the domains already record (the same Principle-5 discipline as 1.3 scenario comparison and roadmap #7). This timeline is intended as the conceptual **backbone of the Transaction Dashboard**: the dashboard is the cross-transaction roll-up, TX-0 is the single-transaction chronological drill-down.
- **Explicitly deferred to TX-0's own decision package:** whether an additive `ActivityLog` index (e.g. `@@index([organizationId, opportunityId, createdAt])`) is warranted for per-transaction/timeline query performance (additive, non-destructive, no new business data — but a schema touch, so a deliberate decision) · any unified event view-model · date-triggered reminders · notification fan-out. None of these are assumed; all await ratification.

---

# Slice 5 — Transaction Dashboard

> **Delivery status:** **RATIFIED 2026-07-16** (founder). Decision record: [Transaction Dashboard Decision Package](./TRANSACTION_DASHBOARD_DECISION_PACKAGE.md) (marked ratified, linking here). A **read-only, cross-opportunity, current-state PROJECTION** of every deal in-flight past `UNDER_CONTRACT` — their readiness, blockers, per-domain status, next/overdue milestone, and responsible party — with each row linking out to that Opportunity's Closing Center. It is **not** a new operational domain, a transaction record, a timeline, a workflow engine, or a materialized/cached reporting model. NOT YET IMPLEMENTED at ratification.

**Ratified cornerstones (founder-articulated):**
- **TX-0** — the **Transaction Timeline** (single-opportunity chronological history over `ActivityLog` + milestones + snapshots) remains **reserved and deferred** to its own slice; **not** in Slice 5.
- **TX-1** — **Dashboard ≠ Timeline.** Slice 5 delivers the **cross-opportunity current-state dashboard** (many rows). The **single-opportunity chronological Timeline** is TX-0. Different UI, different projection, same underlying data.
- **TX-2** — **Projection purity.** Every dashboard value is **derived at read time** from `Opportunity` / `ClosingChecklist` / `EscrowRecord` / `FinancingRecord` / `AssignmentRecord` (+ existing responsible-user info); **never cached, persisted, or materialized** (Calculation Principle 5 discipline).
- **TX-3** — **No new write path.** The dashboard is **orchestration, not ownership** — zero mutating actions; every affordance links out to the owning domain surface (the Closing Center accordion) where the already-authorized edit path lives.
- **TX-A** — **No `ActivityLog` index in Slice 5.** The current-state dashboard runs no per-opportunity event-history query; the existing `organizationId` index + the `opportunityId @unique` keys on the four Closing records suffice. The proposed `@@index([organizationId, opportunityId, createdAt])` stays deferred to TX-0 or another genuinely chronological feature — **no migration for speculative performance.**

**Decisions TD-A…TD-L** and **invariants TD-1…TD-9** are ratified as written in the [decision package](./TRANSACTION_DASHBOARD_DECISION_PACKAGE.md), with **TD-L resolved: roadmap #7 (Opportunity-list closing badges) is a SEPARATE follow-up slice** — it must reuse the same pure projection module but has its own implementation plan, UI review, Playwright coverage, verification gate, and release; **the Opportunity list is NOT modified in Slice 5.**

**Recorded explicitly (Slice 5 introduces NONE of these):**
- No new persistence · **no migration** · no dashboard table · no cached readiness · no duplicated milestone dates · no duplicated blockers · no duplicated status fields · no `ActivityLog` replication (and no `ActivityLog` dependency for the core dashboard).
- No transaction timeline (TX-0) · no Opportunity-list badge changes (roadmap #7) · no mutating actions (TX-3) · no underwriting interaction (`lib/analysis.ts` untouched) · no duplicated Closing state · no new source of truth.

**In-flight inclusion (ratified stage semantics — no invented stages):** the pipeline is `LEAD … LOI_SENT → UNDER_CONTRACT → BUYER_MATCHED → CLOSING → PAID` (13 stages, no cancelled/dead/terminal-non-closing stage exists). **In-flight past `UNDER_CONTRACT` = { `UNDER_CONTRACT`, `BUYER_MATCHED`, `CLOSING` }** (closing is active but not done). `PAID` = closed → **excluded from the default view** (available only via an explicit optional "recently closed" filter). Stages before `UNDER_CONTRACT` never appear.

**Affected modules (on implementation):** pure `lib/transaction-dashboard.ts` (inclusion predicate + deterministic next-milestone selection with an **injected reference date** + per-row projection reusing `closingReadinessSummary` / `escrow`·`financing`·`assignment` status helpers — presentation-neutral, reusable by roadmap #7) · read-only route `app/(workspace)/closing/page.tsx` · `components/transaction-row.tsx` (+ filters) · nav entry · unit tests (CRITICAL ≥90% branch) + `scripts/e2e-transaction-dashboard.mjs` + extended Playwright visual coverage. **No** migration/service/mutating-action/RBAC-resource/enum. Reuses `CLOSING` read; org-scoped, fail-closed.

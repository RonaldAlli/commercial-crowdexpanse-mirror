# Version 1.4 — Closing Center

> **Theme:** Carry underwritten, matched deals through due diligence to a closed assignment.
> **Status:** 🟡 In progress. Depends on Opportunities pipeline (done), Buyer Matching (done), Documents (present), Underwriting (1.3). Architecture ratified — see [`CLOSING_CENTER_ARCHITECTURE_LOCK.md`](../architecture/CLOSING_CENTER_ARCHITECTURE_LOCK.md).

## Delivery status
- **Slice 1 — Closing Foundation + Due Diligence + PAID gate:** ✅ built, awaiting founder review on branch `feat/closing-foundation-dd` (not merged/released). Delivers the domain model (template → snapshot → checklist → items), the `DUE_DILIGENCE` category, the `CLOSING` RBAC resource, the pure `isClosingReady` PAID gate composed with `canMoveStage`, and a blocked-gate explanation that lists the outstanding required items.
- **Slices 2–n:** Escrow → Financing → Assignments → Transaction dashboard, each separately gated and reviewed.

## Goal
Everything after "under contract" in one place: the last mile from `UNDER_CONTRACT` → `BUYER_MATCHED` → `CLOSING` → `PAID` becomes a managed, checklist-driven process instead of ad-hoc.

## Scope

### 1. Due Diligence
DD checklist per opportunity (inspection, title, financials, legal); item status + owner + due date; ties into Tasks and Documents (`DocumentType.DUE_DILIGENCE`).

### 2. Escrow
Track escrow open/status, earnest money, key dates, and contingency deadlines with reminders (Notifications).

### 3. Financing
Track the buyer's financing status and contingencies (for assignment deals, the assignee's ability to close).

### 4. Assignments
The core transaction: assignment agreement generation, assignment fee (`Opportunity.assignmentFeeUsd`), assignor/assignee parties, and execution. (Mirrors the DealFlow "Agreement Generator" priority.)

### 5. Closing Checklist
A gating checklist that must be satisfied to move an opportunity to `PAID`; blocks premature stage advance.

### 6. Transaction Management
A closing dashboard: all deals in-flight past `UNDER_CONTRACT`, their blockers, dates, and responsible parties.

### 7. Closing visibility on lists (founder refinement)
Surface closing progress **on the Opportunity list/board** — e.g. a `Closing 3 / 7` badge and a `Ready to Close` / `Not Ready` state — so closing status is visible without opening each opportunity. Reuses the pure `closingProgress` / `blockingItems` helpers already shipped in slice 1; deferred past slice 1 (a read-only projection over existing checklist state, no new model). The per-opportunity **explanation of a blocked PAID move** (which required items remain) shipped with slice 1; this item generalizes that visibility to the list.

## Architecture notes
- New child entities (DD items, escrow record, closing checklist) hang off `Opportunity`, org-scoped.
- Reuse Documents for artifacts, Tasks for work items, Notifications for date reminders — don't reinvent them.
- Stage transitions gated by checklist completion (extend the existing stage-move server action).

## Dependencies
- 1.3 Underwriting (offer/LOI artifacts feed the contract).
- Documents (contract/LOI/DD storage), Notifications (deadline reminders), Tasks (DD work).

## Definition of Done (1.4)
Global DoD **plus**: an opportunity cannot reach `PAID` without a satisfied closing checklist; every closing artifact is stored and org-scoped; key-date reminders fire.

## Out of scope
Automated buyer/seller communication and AI (2.0).

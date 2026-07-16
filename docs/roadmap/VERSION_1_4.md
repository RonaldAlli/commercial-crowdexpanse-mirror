# Version 1.4 — Closing Center

> **Theme:** Carry underwritten, matched deals through due diligence to a closed assignment.
> **Status:** 🟡 In progress. Depends on Opportunities pipeline (done), Buyer Matching (done), Documents (present), Underwriting (1.3). Architecture ratified — see [`CLOSING_CENTER_ARCHITECTURE_LOCK.md`](../architecture/CLOSING_CENTER_ARCHITECTURE_LOCK.md).

## Delivery status
- **Slice 1 — Closing Foundation + Due Diligence + PAID gate:** ✅ **LIVE in production** (released 2026-07-15; prod 22→**23 migrations**, serving `q0k2nXlweILTSGL6K8rS7`; merged to `main` at `8cfb343`, dual-pushed gitea+github). Delivers the domain model (versioned template → one-way snapshot → checklist → items), the `DUE_DILIGENCE` category, the `CLOSING` RBAC resource with an **ADMIN-only, reasoned, audited waiver** for required items, the server-authoritative pure `isClosingReady` PAID gate composed with `canMoveStage`, and a blocked-gate explanation that lists the outstanding required items. Behavior re-proven on the guarded `_test` DB (52 assertions); prod schema drift empty; V1.3 underwriting/offer-memo/documents/opportunity surfaces verified intact.
- **Slice 2 — Escrow:** ✅ **LIVE in production** (released 2026-07-16; prod 23→**24 migrations**, serving `hJJCViPhweeyHioi_UMkP`; merged to `main` at `53847f4`, dual-pushed). A first-class `EscrowRecord` (1:1 Opportunity) with the `NOT_OPENED→OPENED→DEPOSITED→{RELEASED|REFUNDED|FORFEITED}` lifecycle; whole-USD `earnestAmountUsd`; free-text holder; proof-of-deposit Document link; **immutable append-only `EscrowEvent`** snapshot on terminal transitions with the record frozen after (EC-I/EC-11); `CLOSING` RBAC + **ADMIN-only** reasoned resolution (EC-G); the **PAID gate is unchanged** — escrow gates PAID only via a required `ESCROW` checklist item (EC-H); optional/explicit checklist-sync (EC-J). Human workflow outside the underwriting engine (EC-1/EC-9/EC-10). Behavior re-proven on `_test` (33 assertions); prod drift empty; V1.3 + Slice 1 verified intact. Lock: [Closing Center Architecture Lock §8–10](../architecture/CLOSING_CENTER_ARCHITECTURE_LOCK.md) (EC-A…EC-J, EC-1…EC-11).
- **Slice 3 — Financing:** ✅ **LIVE in production** (released 2026-07-16; prod 24→**25 migrations**, serving `YJdWgq0rNRz7tPNraoOhD`; merged to `main` at `a29067a`, dual-pushed). A first-class `FinancingRecord` (1:1 Opportunity) tracking the lender's process — `NOT_STARTED→APPLIED→COMMITTED→CLEARED→FUNDED` with `DENIED`/`WITHDRAWN` off-ramps — as human operational workflow outside the underwriting engine. Milestone timestamps + free-text lender; commitment/appraisal Document links (scalar ids, FC-E); **no money fields** (FC-5). Terminal resolution captures an **immutable FC-J snapshot inside the record** (lender + commitment/appraisal doc + actor + reason) and freezes it — **no separate event ledger** (FC-I, verified live: 0 `financing_events` tables). `CLOSING` RBAC + **ADMIN-only** reasoned resolution (FC-G); the **PAID gate is unchanged** — financing gates PAID only via a required `FINANCING` checklist item (FC-H). The **FC-0/FC-15 reference boundary** holds: the panel shows the active scenario's underwritten debt **read-only** through the `getActiveScenarioResult` seam, never persisting/caching it, and displays "No active underwriting available." when there is none. Behavior re-proven on `_test` (44 assertions incl. FC-0: the full lifecycle writes no underwriting row); prod drift empty; V1.3 + Slices 1 & 2 verified intact. Lock: [Closing Center Architecture Lock §11–14](../architecture/CLOSING_CENTER_ARCHITECTURE_LOCK.md) (FC-0…FC-J, FC-1…FC-15).
- **UI preparation slice — Closing Center accordion:** ✅ **LIVE in production** (released 2026-07-16; serving `N4WIQvz0k7RSXD_iurA9u`; merged to `main` at `fe077f1`, dual-pushed; **code-only — no migration, prod stays at 25**). A **presentation-only** refactor (not a new domain capability): the Opportunity detail page groups Due Diligence / Escrow / Financing into one labelled **Closing Center** container — a persistent readiness header (rendering the authoritative `closingReadinessSummary`, a pure composition of `closingProgress`/`blockingItems`/`closingBlockMessage` — no second calculation) over accessible accordion sections (real `<button>` triggers, `aria-expanded`/`aria-controls`, labelled `role="region"` panels, keyboard-operable, status as text not color alone; Checklist defaults open). Each existing domain card is **unchanged** and receives the same props. **No schema/service/RBAC/lifecycle/PAID-gate change.** Verified in a real browser via a new **test-only Playwright (Chromium) harness** (`tests/visual/`): **24/24 pass** across desktop 1440×1000 / tablet 900×1100 / mobile 390×844; keyboard/a11y, role-gating, no-mutation-on-toggle, console/hydration, and long-value overflow all clean; **no defects**. Ten screenshots captured as review evidence (git-ignored under `tests/visual/.artifacts/screenshots/`: `desktop-checklist-open`, `desktop-escrow-open`, `desktop-financing-open`, `admin-terminal-controls`, `no-active-underwriting`, `nonadmin-no-terminal-controls`, `tablet-closing-summary`, `mobile-collapsed-long-blocker`, `mobile-financing-long-lender`, `mobile-escrow-long-holder`; verified 2026-07-16 with Playwright 1.61.1 / Chromium 149.0.7827.55 (`chromium-1228`) — the evidence existed at review time but is intentionally not part of repository history). Accordion commit `dd5b316` + harness/review commit `fe077f1`. See [Closing Center UI Review](./CLOSING_CENTER_UI_REVIEW.md) + [Testing Roadmap](./TESTING_ROADMAP.md).
- **Slices 4–n:** Assignments → Transaction dashboard → list-level closing-progress (#7), each separately gated and reviewed. **Version 1.4 is NOT complete** — Slices 1, 2 & 3 (domain capabilities) plus the accordion UI-preparation slice only.

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

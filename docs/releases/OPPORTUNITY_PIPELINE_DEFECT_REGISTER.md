# Opportunity Pipeline — Defect Register

> **Status: PENDING FOUNDER REVIEW.** A **functional/workflow audit** of the 13-stage Opportunity
> pipeline (not a documentation or architecture audit). Every finding is **evidence-based** — traced
> in code and, where marked *runtime-confirmed*, reproduced against the real domain code in an
> isolated test DB (`scripts/audit/verify-pipeline-ownership.mjs`). Two concrete defects are **fixed
> with regression tests**; the structural findings are **runtime-confirmed and left as design/policy
> decisions** (not auto-fixed). Branch `stabilize/opportunity-pipeline` (from `main` `006ceba`); no
> production change; the deployment observation window is undisturbed.

**Method:** worktree isolation, own test DB, SELECT-only against prod. Gate after fixes: `tsc 0` ·
unit **62 files / 93%** · E2E **42/42** · isolated build OK · V1.3 underwriting kernel byte-unchanged.

---

## Reference — the stage model this audit revealed
The `stage` field is a **free-standing label, never derived from or synchronized with** the domain
objects that own each fact. Classifying stages (per Founder direction) makes the findings precise:

| Class | Stages | Truth owner | Transition posture |
|---|---|---|---|
| **Workflow** | LEAD, SELLER_CONTACTED, INTERESTED_SELLER, FINANCIALS_REQUESTED, UNDERWRITING, OFFER_READY | operational (some none) | may warrant lightweight "truth exists" checks |
| **State** | T12_RECEIVED, RENT_ROLL_RECEIVED, LOI_SENT, UNDER_CONTRACT, BUYER_MATCHED, PAID | external facts / domain records | must stay freely settable (deals import mid-lifecycle) |
| **Hybrid** | CLOSING | Checklist + Escrow + Financing + Assignment | workflow label over multi-object truth |

This is *why* the transition matrix looks "too permissive": permissiveness is **correct** for State
stages and **under-specified** for Workflow stages — a stage↔truth question, not an adjacency one.

---

## A. Confirmed defects — FIXED (with regression tests)

### OPP-1 · PAID gate fails *open* on an empty/all-optional checklist · **MEDIUM** · ✅ FIXED
- **Reproduction:** `isClosingReady([])` returned **`true`** (`[].every()` is vacuously true). Safe
  *today* only because the default template has 4 required items — but templates are org-editable, so
  an active template with zero required items would **silently open PAID** on the absence of rules.
- **Root cause:** the gate predicate trusted `.every()` over a possibly-empty required set.
- **Affected:** `lib/closing.ts` (`isClosingReady`, `closingBlockMessage`).
- **Fix:** fail **closed** when there are no required items; `closingBlockMessage` surfaces a
  "configuration issue" instead of a false-ready null. Happy path (≥1 required) unchanged.
- **Regression tests:** `tests/unit/closing/closing-gate-hardening.test.ts` (empty + all-optional ⇒
  not ready; message asserts misconfig) + 3 existing tests in `closing.test.ts` and 1 in
  `transaction-dashboard.test.ts` **corrected** (they had encoded the fail-open behavior; the UI never
  passes `[]` — it null-guards with a "Checklist not started" badge, so no UI impact).
- **Frozen note:** this edits `lib/closing.ts`, previously byte-identical to `v1.4.0`. The historical
  `v1.4.0` tag and `release/1.4` branch stay immutable; `main`'s gate now differs — an intentional
  forward correction of a confirmed defect.

### OPP-4 · Invalid stage move is a silent no-op · **LOW** · ✅ FIXED
- **Reproduction:** `moveOpportunityStage` with an unknown stage string returned `undefined` — no
  feedback.
- **Root cause:** `if (!VALID_STAGES.has(nextStage)) return;`.
- **Affected:** `app/(workspace)/opportunities/actions.ts`.
- **Fix:** returns `{ error: "Invalid pipeline stage." }` (consistent with the sibling edit action).
- **Regression test:** guard assertion in `closing-gate-hardening.test.ts`. *(A full server-action E2E
  of the error return is deferred — the action requires an authenticated session the script harness
  doesn't provide; noted, not silently skipped.)*

---

## B. Confirmed inconsistencies — RUNTIME-REPRODUCED · NOT fixed (design decisions)

### OWN-2 · Pipeline stage vs Diligence = dual, unsynchronized source of truth · **MEDIUM/HIGH**
- **Runtime-confirmed:** stage set to `T12_RECEIVED` while the `t12` diligence item is `NOT_REQUESTED`;
  and `t12`+`rent_roll` diligence marked `RECEIVED` while stage stays `LEAD`. **No sync either way.**
- **Root cause:** stages `FINANCIALS_REQUESTED / T12_RECEIVED / RENT_ROLL_RECEIVED` name the same facts
  that `OpportunityDiligenceItem` owns; `moveOpportunityStage` touches no truth object.
- **Decision needed:** (a) derive those stages from diligence, (b) validate on transition, (c) retire
  the diligence-named stages in favor of the diligence truth, or (d) accept as State stages + document.
  *Highest user-trust impact — the system can display contradictory state.*

### OWN-3 · PAID validates the due-diligence checklist only — not funding/escrow/assignment · **MEDIUM**
- **Runtime-confirmed:** PAID gate goes **ready** after completing the 4 due-diligence items with
  **zero** `FinancingRecord` / `EscrowRecord` / `AssignmentRecord`; the default template is
  `DUE_DILIGENCE`-only.
- **Root cause:** gate = `isClosingReady(checklist.items)`; domains are decoupled by V1.4 design (AS-J:
  domains never auto-seed the checklist).
- **Decision needed (business):** define **"PAID = successful completion of the org's configured
  closing policy,"** and let the **closing template/policy** encode which artifacts are required per
  deal type (cash / seller-finance / subject-to / double-close / assignment). No hard-coded rule.
  *The OPP-1 fix supports this — an org that adds a required Financing/Escrow/Assignment item now has
  it enforced by the same gate.*

---

## C. Structural / policy findings (design decisions — no code change proposed yet)

- **OWN-1 · stage↔truth decoupling · HIGH (governing decision).** Adopt: *"stage is an operational
  workflow label that must be consistent with authoritative domain truth **where that truth exists**"*
  + the Workflow/State/Hybrid classification above. This governs OWN-2/OWN-4 and correctly retires my
  earlier "OPP-2 adjacency" framing (**withdrawn** — imported/mid-lifecycle deals make adjacency wrong).
- **OWN-4 · stages with no backing artifact · MEDIUM.** `INTERESTED_SELLER`, `LOI_SENT`,
  `UNDER_CONTRACT` record facts no object owns (LOI generation deferred; no executed-contract object;
  `contractValueUsd` optional). Resolve via the OWN-1 classification (State stages may be intentionally
  artifact-light; but `UNDER_CONTRACT` arguably should reference an executed contract Document).
- **OPP-3 · ADMIN stage moves are unguarded · POLICY REVIEW.** Verified: every move **is** audited
  (`opportunity.stage_changed` ActivityLog written). **Gap:** no user warning on a backward/skip move,
  and a backward move does not reverse downstream side effects (checklist/escrow/financing/assignment
  persist). Admins may break consistency by design — decision is whether to add a UI confirmation.

---

## Summary
| ID | Finding | Severity | State |
|---|---|---|---|
| OPP-1 | PAID gate fail-open (empty/all-optional checklist) | MEDIUM | ✅ Fixed + regression |
| OPP-4 | Invalid stage silent no-op | LOW | ✅ Fixed + regression |
| OWN-2 | stage ⇄ diligence dual truth | MEDIUM/HIGH | Runtime-confirmed · design decision |
| OWN-3 | PAID ignores funding/escrow/assignment | MEDIUM | Runtime-confirmed · policy decision |
| OWN-1 | stage↔truth decoupling (governing) | HIGH | Design decision |
| OWN-4 | stages with no backing artifact | MEDIUM | Design decision |
| OPP-3 | ADMIN moves unguarded (audited, unwarned) | Low | Policy review |

**Next** (awaiting Founder decisions on OWN-1/OWN-2/OWN-3): only after the stage-semantics and
PAID-policy decisions are made should any stage↔truth synchronization or template-policy code be
written. The two fixed defects (OPP-1, OPP-4) are self-contained and independent of those decisions.

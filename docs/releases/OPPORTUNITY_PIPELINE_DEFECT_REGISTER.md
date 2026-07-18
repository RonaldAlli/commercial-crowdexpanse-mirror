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

## Governing model (Founder-defined) — stages are PROJECTIONS, not truth
**Pipeline stages are operational projections over authoritative business facts.** A stage never
*owns* truth — it *visualizes* it. Every fact flows through three layers:

1. **Business event** — what actually happened (e.g., "contract executed").
2. **Authoritative truth** — the object that owns it (`Document`, `BuyerMatch`, `Scenario`,
   `OpportunityDiligenceItem`, `ClosingChecklist`, …).
3. **Pipeline label** — the stage that *displays* it (`UNDER_CONTRACT`, …).

Under this model the structural findings largely dissolve: **OWN-2** (T12_RECEIVED vs the diligence
item) disappears once the stage merely *reflects* the `OpportunityDiligenceItem` that owns the fact;
**OWN-4** becomes a product choice — a stage either projects a real artifact or must not *imply* one
exists. Keeping every stage a **read-only projection** is what prevents the pipeline from becoming a
second source of truth. (This supersedes my earlier Workflow/State/Hybrid framing, which is now just a
secondary lens.)

### Opportunity Semantic Contract (decision-input — observable facts from code; **rulings are the Founder's**)
Per stage: business event · truth owner (today) · proving artifact (today) · **decision needed**. A
worksheet for your rulings — **not** an architecture lock, and no synchronization code until it's ruled.

| Stage | Business event | Truth owner (today) | Proving artifact (today) | Decision needed |
|---|---|---|---|---|
| LEAD | Lead captured | `Opportunity` | Opportunity + Property | baseline — none |
| SELLER_CONTACTED | Seller contacted | `ContactTouch` / `Seller.outreachStatus` | ContactTouch | project from outreach truth? |
| INTERESTED_SELLER | Seller interested | *(none — soft)* | none | define a truth owner, or accept a soft label? |
| FINANCIALS_REQUESTED | Financials requested | `OpportunityDiligenceItem` | diligence item | project from diligence? |
| T12_RECEIVED | T‑12 received | `diligenceItem(t12)` | diligence item | project from diligence (resolves OWN-2) |
| RENT_ROLL_RECEIVED | Rent roll received | `diligenceItem(rent_roll)` | diligence item | project from diligence (resolves OWN-2) |
| UNDERWRITING | Underwriting underway | `UnderwritingScenario` / `Decision` | Scenario | activity or state? |
| OFFER_READY | Offer prepared | `UnderwritingDecision` + Offer‑Memo `Document` | Offer‑Memo doc | require approved decision + memo? |
| LOI_SENT | LOI sent | `Document(LOI)` *(gen deferred)* | none | create the LOI artifact, or accept the label? |
| UNDER_CONTRACT | Contract executed | executed‑contract `Document` *(none formal)* + `contractValueUsd?` | none formal | **require an executed‑contract artifact? (OWN-4)** |
| BUYER_MATCHED | Buyer matched | `BuyerMatch` | BuyerMatch | must a `BuyerMatch` exist? |
| CLOSING | Closing underway | Checklist + Escrow + Financing + Assignment | ClosingChecklist | (hybrid — already well-owned) |
| PAID | Deal closed / funded | Checklist COMPLETE **(+ funding/escrow/assignment?)** | ClosingChecklist | **what proves PAID, per acquisition model? (OWN-3)** |

*All stage consumers today — board/list, dashboard, timeline, badges — are already read-only
projections; the governing model asks that they stay that way.*

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

## B. Architecture Decisions Required — runtime-reproduced (OWN-2, OWN-3)
*Real, evidence-based — but decisions/undefined semantics, not defects. Resolve via the governing model + Semantic Contract above.*

### OWN-2 · Pipeline stage vs Diligence = dual, unsynchronized source of truth · **MEDIUM/HIGH**
- **Runtime-confirmed:** stage set to `T12_RECEIVED` while the `t12` diligence item is `NOT_REQUESTED`;
  and `t12`+`rent_roll` diligence marked `RECEIVED` while stage stays `LEAD`. **No sync either way.**
- **Root cause:** stages `FINANCIALS_REQUESTED / T12_RECEIVED / RENT_ROLL_RECEIVED` name the same facts
  that `OpportunityDiligenceItem` owns; `moveOpportunityStage` touches no truth object.
- **Decision needed:** (a) derive those stages from diligence, (b) validate on transition, (c) retire
  the diligence-named stages in favor of the diligence truth, or (d) accept as State stages + document.
  *Highest user-trust impact — the system can display contradictory state.*

### OWN-3 · PAID validates the due-diligence checklist only — **OBSERVATION, not a defect** · design decision
- **Runtime-confirmed behavior (explicitly not labeled wrong):** PAID goes **ready** on the 4
  due-diligence items with **zero** `FinancingRecord` / `EscrowRecord` / `AssignmentRecord`; the
  default template is `DUE_DILIGENCE`-only. This is *by V1.4 design* (AS-J: domains never auto-seed
  the checklist) — it is documented here as an observation, not a bug.
- **Why it's a decision, not a defect:** whether PAID must require Financing/Escrow/Assignment depends
  on the **business model** — cash purchase, assignment, seller-finance, subject-to, and double-close
  do not all require the same artifacts. Treating today's behavior as "wrong" would itself be an error.
- **Proposed framing (yours to ratify):** **"PAID = successful completion of the org's *configured
  closing policy*,"** with the closing template/policy encoding required artifacts per deal type. No
  hard-coded rule. *The OPP-1 fix already makes any such added required item enforceable by the same
  gate — so this needs a policy decision, not new gate logic.*

---

## C. Architecture Decisions Required — governing & undefined (OWN-1, OWN-4) · plus policy question (OPP-3)

- **OWN-1 · No formal contract for stage semantics · HIGH (governing decision).** The deeper issue
  beneath "stage is a free label" is that **the platform has never formally defined what each stage
  *means*** — so it cannot answer: *Is `UNDERWRITING` an activity or a state? Is `UNDER_CONTRACT` a
  workflow milestone or evidence that an executed contract exists? Is `BUYER_MATCHED` merely
  informational or must a `BuyerMatch` object exist?* Proposed contract: *"stage is an operational
  workflow label that must be consistent with authoritative domain truth **where that truth exists**"*
  + the Workflow/State/Hybrid classification above. This governs OWN-2/OWN-3/OWN-4 and retires my
  earlier "OPP-2 adjacency" framing (**withdrawn** — imported/mid-lifecycle deals make adjacency wrong).
  **Do NOT implement stage↔truth synchronization until this semantics contract is ruled — synchronizing
  before the semantics are defined would encode the wrong rules.**
- **OWN-4 · stages with no backing artifact · MEDIUM.** `INTERESTED_SELLER`, `LOI_SENT`,
  `UNDER_CONTRACT` record facts no object owns (LOI generation deferred; no executed-contract object;
  `contractValueUsd` optional). Resolve via the OWN-1 classification (State stages may be intentionally
  artifact-light; but `UNDER_CONTRACT` arguably should reference an executed contract Document).
- **OPP-3 · ADMIN stage moves are unguarded · POLICY REVIEW.** Verified: every move **is** audited
  (`opportunity.stage_changed` ActivityLog written). **Gap:** no user warning on a backward/skip move,
  and a backward move does not reverse downstream side effects (checklist/escrow/financing/assignment
  persist). Admins may break consistency by design — decision is whether to add a UI confirmation.

---

## Summary — three decision buckets
**A · Confirmed code defects (fix now):** OPP-1, OPP-4 — ✅ fixed + regression-tested, Founder-accepted.
**B · Architecture Decisions Required (some *undefined*, not merely inconsistent — your ruling):** OWN-1
(the governing projection model above), OWN-2, OWN-3, OWN-4 — real, evidence-based; **no code until the
Opportunity Semantic Contract is ruled.**
**C · Policy questions:** admin-warning on disruptive jumps (OPP-3); whether specific stages should
validate backing-truth existence; what PAID means across acquisition strategies.

| ID | Finding | Bucket | State |
|---|---|---|---|
| OPP-1 | PAID gate fail-open (empty/all-optional checklist) | A | ✅ Fixed + regression |
| OPP-4 | Invalid stage silent no-op | A | ✅ Fixed + regression |
| OWN-1 | No formal stage-semantics contract (governing) | B | Design decision |
| OWN-2 | stage ⇄ diligence dual truth | B | Runtime-confirmed · design decision |
| OWN-3 | PAID scope = due-diligence only | B | **Observation, not a defect** · business-policy decision |
| OWN-4 | stages with no backing artifact | B | Design decision |
| OPP-3 | ADMIN moves unguarded (audited, unwarned) | C | Policy question |

**Sequencing (per Founder direction) — the next work is the *Opportunity Semantic Contract*, not code.**
For **every stage**, rule: (1) what business event occurred · (2) what object owns the truth · (3) what
artifact proves it · (4) what projection displays it · (5) what consumers rely on it. The matrix above
is its decision-input draft (observable facts filled; rulings are yours). **Only after those rulings**
implement any stage↔truth synchronization, validation, or template-policy code — synchronizing first
would encode the wrong rules. The two fixed defects (OPP-1, OPP-4) are self-contained and independent
of all of the above.

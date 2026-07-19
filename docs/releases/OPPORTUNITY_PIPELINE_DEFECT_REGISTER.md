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

### Opportunity Semantic Contract — **RATIFIED (Founder rulings, 2026-07-19)**
Authority per stage + selection mode. **Selection mode** = how the stage relates to its truth:
*auto* (system sets it), *validated* (allowed only if the truth exists, **else a controlled
attestation/override**), *manual* (audited human judgment). **Imported/mid-lifecycle deals** advance
via a **controlled attestation** — reason + actor + timestamp, recorded in `ActivityLog` — never by
disconnecting the stage from truth. **Truth reversal** (authoritative object later removed/reversed):
the stage does **not** auto-revert (disruptive); the system **surfaces the inconsistency** for review
and an ADMIN may correct it.

| Stage | Business event | Authority (truth owner) | Proving artifact | Selection mode |
|---|---|---|---|---|
| LEAD | Opportunity created | `Opportunity` | Opportunity record | **auto** (on create) |
| SELLER_CONTACTED | Seller contacted | ≥1 `ContactTouch` | ContactTouch | **validated** (+attest for imports) |
| INTERESTED_SELLER | Seller interested | Manual CRM judgment | `ActivityLog` (audited) | **manual (audited)** |
| FINANCIALS_REQUESTED | Financials requested | diligence request state | `OpportunityDiligenceItem` (REQUESTED+) | **validated** |
| T12_RECEIVED | T‑12 received | `diligenceItem(t12)` | t12 item = RECEIVED/REVIEWED | **validated** |
| RENT_ROLL_RECEIVED | Rent roll received | `diligenceItem(rent_roll)` | rent_roll = RECEIVED/REVIEWED | **validated** |
| UNDERWRITING | Underwriting underway | `Underwriting`/active `Scenario` exists | UnderwritingScenario | **validated** |
| OFFER_READY | Offer ready | decided `Scenario` + offer artifact | `UnderwritingDecision` + Offer‑Memo `Document` | **validated** |
| LOI_SENT | LOI sent | sent LOI doc / external‑send event | `Document(LOI)` or send event | **validated** (+attest) |
| UNDER_CONTRACT | Contract executed | executed‑contract artifact / imported attestation | contract `Document` | **validated** (import‑attest) |
| BUYER_MATCHED | Buyer matched | active `BuyerMatch` | BuyerMatch | **validated** |
| CLOSING | Closing started | closing checklist/workflow started | `ClosingChecklist` | **auto/validated** |
| PAID | Deal closed / funded | **org‑configured closing policy satisfied** | `ClosingChecklist` policy (OWN‑3) | **validated** (PAID gate) |

**Governing rule (ratified):** *Opportunity stages are operational projections over authoritative
business facts. They do not independently own those facts.* All stage consumers (board/list,
dashboard, timeline, badges) stay read-only projections.

### Implementation — Slice 1 (highest-impact first: the diligence-named stages) · acceptance-first
**Scope:** `T12_RECEIVED`, `RENT_ROLL_RECEIVED`, `FINANCIALS_REQUESTED` (resolves OWN‑2). Model =
**validated-on-selection with ActivityLog attestation** (composes with — never replaces — the role
gate `canMoveStage` and the PAID gate):
- A `STAGE_TRUTH_REQUIREMENTS` map: `T12_RECEIVED → diligenceItem(t12) ∈ {RECEIVED,REVIEWED}`;
  `RENT_ROLL_RECEIVED → diligenceItem(rent_roll) ∈ {RECEIVED,REVIEWED}`; `FINANCIALS_REQUESTED →
  any diligence item REQUESTED+`.
- In `moveOpportunityStage(target)`: if the requirement is satisfied → proceed normally. If not →
  require `formData.attestationReason`; **with** a reason → proceed **and** write an
  `opportunity.stage_attested` ActivityLog (reason + which truth was missing + actor + timestamp);
  **without** → return `{ error: "<stage> requires <t12 diligence received> — or an attestation reason for an imported/mid-lifecycle deal." }`.
- **No schema change** — attestation lives in `ActivityLog`. **Imports** (`import-dealautomator…`) set
  stage via Prisma directly and are out of this UI/action path; they carry their own provenance.
- **Acceptance/regression (integration):** (a) target=T12_RECEIVED, t12 not received, no reason → error, stage unchanged;
  (b) same + reason → allowed + attestation logged; (c) t12 RECEIVED → allowed normally, no attestation;
  (d) role gate + PAID gate still enforced. Gate: tsc/unit/e2e/build green; frozen refs unmoved.

**Sub-decisions for your confirmation before I code:**
1. **Override UX = attestation reason (recommended)** vs hard block. Recommend attestation (matches your ruling).
2. **Attestation storage = ActivityLog only, no migration (recommended)** vs a dedicated field/model.
3. **Slice 1 = the 3 diligence stages** (then UNDERWRITING/BUYER_MATCHED/UNDER_CONTRACT in later slices).

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

**Status (2026-07-19):** the **Opportunity Semantic Contract is RATIFIED** (authority + selection mode
per stage; governing rule; attestation model for imports; truth-reversal behavior). OPP-1 + OPP-4 are
**merged to `main`** (not yet deployed). **Next work = implement the highest-impact contradiction
first — Slice 1, the diligence-named stages** (validated-on-selection + ActivityLog attestation, spec
above), on your confirmation of the 3 sub-decisions. Later slices: UNDERWRITING → BUYER_MATCHED →
UNDER_CONTRACT → OFFER_READY/LOI_SENT → PAID-policy (OWN-3). No synchronization code is written until
you confirm Slice 1's model.

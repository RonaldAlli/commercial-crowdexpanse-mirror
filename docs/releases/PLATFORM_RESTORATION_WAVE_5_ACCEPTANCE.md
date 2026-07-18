# Platform Restoration — Wave 5 Acceptance (CRM Integration & Quality)

> **Status: ✅ COMPLETE (2026-07-18) — PENDING FOUNDER REVIEW.** Acceptance-first: the objective
> exit criteria (§3) were defined before any work and are now satisfied; the gate (§4) is green;
> evidence in §5. One **documented risk** surfaced (D-CRM-PRIMARY-CONCURRENCY) and was handled per
> §6 — documented, **not** migrated. Tested **existing** behavior only; no new lifecycle/rule
> invented. **No merge, no deploy; Automation paused (D19 untouched).**
>
> Companion: [Restoration Plan](./PLATFORM_ROADMAP_RESTORATION_PLAN.md) ·
> [Defect Register](./PLATFORM_STABILIZATION_DEFECT_REGISTER.md) ·
> [Progress Matrix](../PLATFORM_RESTORATION_PROGRESS.md).

---

## 1. Purpose & scope

Shift from *proving the architecture is intact* (Waves 1–4) to **improving CRM quality** — close the
remaining **D-CRM-TEST** gap for the off-roadmap CRM features (Owner Contacts, Seller/Contact
Outreach, Opportunity Diligence) with a proper **unit → integration → E2E** test structure, while
**preserving** the frozen Underwriting/Closing boundaries. **Test/documentation work only** — no new
CRM capability, no schema/migration unless a confirmed defect requires one (separately reviewed).

## 2. Test-layering structure (Founder-directed)

- **Unit** → individual services and **pure logic** (fast, no DB).
- **Integration** → **domain boundaries** (CRM↔Closing, CRM↔Underwriting; single-primary invariant),
  DB-backed with throwaway orgs.
- **E2E** → **complete user workflows**, org-scoped, throwaway orgs.

The Wave 1 `e2e-crm-isolation.mjs` boundary assertions migrate toward this layering (keep E2E focused
on workflows; move pure-logic/boundary assertions to unit/integration where appropriate).

## 3. Exit criteria (objective — all must be ✅ to accept)

### 3.1 Remaining D-CRM-TEST items to close
- [ ] Owner Contacts — CRUD/lifecycle + org-isolation + single-primary invariant covered.
- [ ] Seller/Contact Outreach — status/lifecycle + org-isolation + "no communication send" covered.
- [ ] Opportunity Diligence — pure logic + lifecycle + boundary covered.

### 3.2 Required unit coverage (pure logic, no DB) — currently **0**, target **full**
- [ ] `lib/opportunity-diligence.ts` — `PRECONTRACT_DILIGENCE_TEMPLATE`, `diligenceStatusLabel`,
      `diligenceStatusTone`, `isPostContractStage`, `diligenceFocusForStage`, **`summarizeDiligence`**
      (incl. the `readyForUnderwriting` rule) — unit-tested, deterministic.
- [ ] `lib/contact-options.ts` — `outreachStatusLabel`, `outreachStatusTone`, `contactMethodLabel`,
      `touchTypeLabel` — unit-tested (exhaustive over each enum, no unhandled case).
- [ ] Any pure helper extracted from a CRM action during the wave is unit-tested at extraction.

### 3.3 Required integration coverage (DB-backed, throwaway orgs)
- [ ] **Single-primary invariant** — setting a contact primary unsets the owner's other primaries;
      an owner never ends with >1 primary (mirrors `owners/actions.ts` logic).
- [ ] **Delete does not orphan** — deleting an owner/contact leaves no dangling references.
- [ ] **CRM↔Closing boundary** — completing all diligence creates **no** ClosingChecklist item and
      leaves the composed PAID gate `ready:false` (extends Wave 1; asserted as an integration test).
- [ ] **CRM↔Underwriting boundary** — no CRM/diligence/ATM path writes `ScenarioResult`,
      `UnderwritingDecision`, or any underwriting model; ATM persists nothing.

### 3.4 Required E2E coverage (user workflows)
- [ ] Owner-contact create → list → set primary → update → delete, org-scoped end to end.
- [ ] Outreach status transition workflow (valid transitions succeed; org-scoped).
- [ ] Diligence request → receive → review workflow, org-scoped.
- [ ] Every workflow proves **cross-org access fails closed**.

### 3.5 Organization-isolation requirements
- [ ] Every CRM **mutation** (create/update/delete/status) is org-scoped and regression-locked by a
      test that fails if the `organizationId` filter is removed.
- [ ] `scripts/audit/crm-integrity.mjs` remains **clean** (test DB + prod read-only).

### 3.6 Boundary-regression requirements (must remain true)
- [ ] Frozen V1.3 Underwriting + V1.4 Closing modules **byte-unchanged vs `v1.4.0`** (re-verified).
- [ ] Composed PAID gate un-bypassable by CRM; no new source-of-truth introduced (SoT matrix holds).
- [ ] No CRM module imports/mutates a frozen underwriting/closing module.

### 3.7 Documentation updates
- [ ] Off-Roadmap Assessment + Defect Register updated (D-CRM-TEST → closed).
- [ ] Progress Matrix + this acceptance record's §5 results filled with evidence.
- [ ] Source-of-Truth Matrix confirmed still accurate.

## 4. Required validation gate (all green)

`prisma validate` · `prisma migrate status` (test DB @ 30) · `tsc --noEmit` · **complete unit suite**
(incl. new CRM unit tests; coverage gate holds) · **full E2E suite** (incl. new CRM integration/E2E)
· isolated production build · secret scan · dependency audit (`xlsx` absent) · ownership guard ·
**frozen-ref + frozen-module unchanged** · `crm-integrity.mjs` clean (test + prod read-only).

## 5. Results / evidence

**Existing-behavior source of truth (documented before testing):**
- **Outreach status is free-form** — `contacts/actions.ts` `parseEnumValue` accepts any valid
  `ContactOutreachStatus` (fallback `NEW`); **no enforced state machine**. Tested as such.
- **Diligence status is free-form** — `diligence-actions.ts` `parseStatus` accepts any valid
  `OpportunityDiligenceStatus`; setting a status writes cascade **timestamps** (requested/received/
  reviewed) as a side-effect; **no enforced sequential transition**. Tested as such (timestamp
  cascade left in the action, not refactored — no behavior change).
- **Single-primary invariant = one primary per `Owner`** — `owners/actions.ts` transaction
  (`updateMany where {organizationId, ownerId}` → set target). **No schema `@@unique`.**

**Unit tests added (13 cases, pure logic):**
- `tests/unit/crm/contact-options.test.ts` — exhaustive `outreachStatusLabel/Tone`,
  `contactMethodLabel(null + each)`, `touchTypeLabel`.
- `tests/unit/crm/opportunity-diligence.test.ts` — labels/tones, `isPostContractStage`,
  `diligenceFocusForStage` (defers to Closing Center), and the `summarizeDiligence` /
  `readyForUnderwriting` rule (`missing===0 && ≥3 core received/reviewed`).

**Integration / boundary tests added (`scripts/e2e-crm-integration.mjs`, 9 assertions):**
- Single-primary invariant (sequential) — switching primary leaves exactly one; old one unset.
- **Concurrency probe** — two concurrent make-primary ops; observed **1 primary** this run (not
  reproduced), but no schema guarantee → **D-CRM-PRIMARY-CONCURRENCY** documented; a sequential
  op always restores exactly one.
- Diligence status free-form (REVIEWED settable directly); outreach status free-form.
- **CRM↔Underwriting boundary** — CRM/diligence work creates **0** Underwriting/ScenarioResult/
  UnderwritingDecision rows.
- Delete-no-orphan — Owner delete cascades its contacts.

**E2E layer note:** DB-backed workflow coverage lives in `e2e-crm-integration.mjs` +
`e2e-crm-isolation.mjs` (the repo's E2E harness is script-based over the test DB — the accepted
pattern; browser-E2E via Playwright is a separate infra track, out of scope). CRM↔Closing boundary
E2E is in `e2e-crm-isolation.mjs` (Wave 1) — completing all diligence leaves the PAID gate not ready.

**Gate:** `tsc 0` · unit **60 files / 93.0%** (was 58) · **E2E 41 scripts** (was 40) · isolated
build OK · `crm-integrity.mjs` clean (test + **prod** read-only) · frozen V1.3/V1.4 modules
**byte-unchanged vs `v1.4.0`** · `xlsx` absent · ownership guard passes.

**Behavior classification (per Founder direction):** all work is **testing existing intended
behavior** — no confirmed defect required a fix, and **no new behavior/lifecycle/rule was added**.
The one finding (concurrency) is a **documented risk**, deferred to a separate migration decision.

## 5b. Criteria status (§3)
- §3.1 D-CRM-TEST items — ✅ Owner Contacts / Outreach / Diligence covered.
- §3.2 unit coverage (diligence + contact-options pure logic) — ✅ (was 0).
- §3.3 integration (single-primary, delete-no-orphan, CRM↔Closing [Wave 1], CRM↔Underwriting) — ✅.
- §3.4 E2E workflows — ✅ via DB-backed scripts (browser-E2E out of scope, noted).
- §3.5 org-isolation regression locks + audit clean — ✅.
- §3.6 boundary-regression (frozen unchanged; PAID un-bypassable; no new SoT) — ✅.
- §3.7 docs updated (defect register, off-roadmap, this record, progress matrix) — ✅.
- §4 validation gate — ✅ green.
- §6 stop conditions — one risk surfaced (concurrency); **documented, not migrated** (correct handling).

## 6. Stop conditions (halt Wave 5 for Founder review)

Stop immediately, **document and isolate**, and do **not** self-correct if any of these is discovered:
- A **real architectural conflict** (a CRM path that can write/approve underwriting, complete/waive a
  Closing item, move stage, compose/bypass the PAID gate, or become an alternate source of truth).
- A **cross-organization** exposure a test reveals.
- A defect that would require a **schema/migration** change (needs a separate reviewed migration).
- Any regression in the frozen V1.3/V1.4 modules.
In these cases Wave 5 pauses; the fix is scoped, documented in the register, and separately authorized.

## 7. Non-goals / prohibitions

No new CRM features/imports/formats · no AI · no email/SMS · no document/task automation · no
Automation work · **no D19 fix** · no schema/migration unless a confirmed defect requires it
(separately reviewed) · no change to frozen V1.3/V1.4 code · **no merge, no deploy** · no marking
Wave 5 accepted without Founder approval.

---

*Status: acceptance criteria defined (acceptance-first). Awaiting Founder authorization to execute
Wave 5 against §3–§4. Nothing built yet; production untouched; Automation paused.*

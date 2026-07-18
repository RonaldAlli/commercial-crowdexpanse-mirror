# Off-Roadmap Feature Assessment

> **Status: PENDING FOUNDER REVIEW.** Per-feature assessment of the five CRM features added outside
> the accepted roadmap (migrations 28–30 + import/ATM tooling), verified by direct code inspection +
> read-only production queries (2026-07-18). Companion to the [Source-of-Truth
> Matrix](../architecture/PLATFORM_SOURCE_OF_TRUTH_MATRIX.md) and `CRM_OPERATIONS_BOUNDARY.md`.

**Overall verdict:** all five are **architecturally compatible, additive, org-scoped, and cleanly
isolated** from the frozen underwriting/closing domains; production data is clean. The one systemic
gap is **missing tests** for three of them (Owner Contacts, Outreach, Diligence).

Classification key: *roadmap-aligned* · *off-roadmap but compatible* · *improperly integrated* ·
*duplicated capability* · *conflicting source of truth* · *obsolete*.

---

## 1. Owner Contacts — **off-roadmap but compatible**
- **Purpose:** operational contact records (`OwnerContact`) + interactions (`ContactTouch`) attached to a canonical `Owner`; the outreach/CRM layer.
- **Org-scoping:** ✅ `OwnerContact.organizationId` NOT NULL, cascade org relation; `owners/actions.ts` + `contacts/actions.ts` authorize (`OWNER`/`SELLER`/`BUYER`) and scope by org (18–32 org refs / 7–12 authorize calls). Prod: 6,897 rows, **0 no-org, 0 orphan, 0 cross-org**.
- **Source-of-truth:** ✅ references Owner; never redefines Owner/Seller identity.
- **Primary-contact rule:** ✅ prod has **0 owners with >1 primary** (rule holds in practice; not DB-constrained — worth a test).
- **Gap:** ❌ no accepted-suite tests (D-CRM-TEST). **Severity: Medium (quality).**
- **Recommendation:** keep; add unit + E2E (org-isolation, CRUD, single-primary invariant).

## 2. Seller / Contact Outreach — **off-roadmap but compatible**
- **Purpose:** operational outreach fields (`outreachStatus`, `preferredContactMethod`, `nextFollowUpAt`, `assignedUserId`, do-not-* / bad-* flags) on `Seller`/`Buyer` (migr 29) and on `OwnerContact` (migr 28).
- **Org-scoping:** ✅ enum-constrained statuses; assignee FK `SET NULL`; prod: 0 assignee-orphan, 0 cross-org assignee.
- **Duplication check:** ✅ does **not** duplicate Opportunity stage, Task, or ActivityLog; **performs no communication** (no email/SMS send — nodemailer used only by the invitation outbox).
- **Flag (docs):** outreach state lives on two grains (per-contact vs per-lead) — document authoritative owner (D-CRM-OUTREACH-OWNERSHIP). **Severity: Low/Medium.**
- **Recommendation:** keep; document the grain; add tests; ensure future *sends* route through approved Communications/Automation, never a CRM action.

## 3. Opportunity Diligence — **off-roadmap but compatible (boundary-critical, verified clean)**
- **Purpose:** pre-contract document-gathering tracker (`OpportunityDiligenceItem`): T-12/rent-roll/offering-memo/etc. with a status lifecycle + a `readyForUnderwriting` advisory summary.
- **CRITICAL boundary (verified in `lib/opportunity-diligence.ts`):** references `OpportunityStage.PAID` **read-only** for stage awareness; guidance explicitly defers to the Closing Center for post-contract execution. It does **NOT**: replace `ClosingChecklist`, affect Closing readiness, complete/waive Closing items, alter the PAID gate, or own Escrow/Financing/Assignment/Underwriting state.
- **Org-scoping:** ✅ `organizationId` NOT NULL; `diligence-actions.ts` authorizes (`OPPORTUNITY`). Prod: 24 rows, **0 no-org, 0 cross-org**.
- **Gap:** ❌ no tests (D-CRM-TEST). **Severity: Medium.**
- **Recommendation:** keep; add tests that **lock** the diligence↔Closing boundary (assert it cannot touch checklist/PAID).

## 4. DealAutomator Lead Import — **off-roadmap but compatible (remediated)**
- **Purpose:** ADMIN-only ingestion of lead exports → creates/reuses Owner/Property/Opportunity/Note within the actor's org.
- **Security (ADR-0006, already remediated & deployed):** ✅ **CSV/TSV/TXT/JSON only — `xlsx` removed** (`npm ls xlsx` empty); pre-parse size + row/column/cell limits; org-scoped, fail-closed job metadata (no cross-org listing, no absolute-path leakage); actor↔org membership verified; `spawn` array-args (no shell injection); path-traversal guarded; ADMIN-only; detached runner.
- **Tests:** ✅ 20 unit tests (`tests/unit/crm/lead-import-*`).
- **Residual:** the 2 historical prod job files lack `organizationId` → correctly **fail closed** (not listed) under the remediated reader.
- **Recommendation:** keep as-is; do **not** broaden accepted formats or upload access without a new ADR.

## 5. ATM Wholesale Calculator — **off-roadmap; advisory-only (the founder's special-attention item)**
- **Purpose:** a standalone wholesale/ATM calculator surfaced from the analyzer index.
- **CRITICAL (verified):** ✅ **no import of `lib/analysis.ts`** or any underwriting module; **no schema model**; **0 persistence writes** — it reads Opportunities/Properties as *inputs* and produces an **advisory, ephemeral** result that is never saved. It is therefore **NOT a competing analysis engine or source of truth**.
- **Note (cosmetic, D-DOC-5):** it lives under the `/analyzer` (underwriting) route group despite being a CRM tool — a labeling mismatch, not an integration defect.
- **Recommendation:** keep; document that its output is advisory/non-authoritative; optionally relocate the route under a CRM group later (separately reviewed). If persistence is ever desired, it must **not** enter the Underwriting source of truth.

---

## 2. Integration decisions (for the CRM bounded domain)

Ratify the CRM domain (per `CRM_OPERATIONS_BOUNDARY.md`) covering contacts, seller operations,
outreach, follow-ups, sourcing, imports, and pre-contract diligence, with these standing rules
(all currently satisfied):
- CRM may **supply sourced data** to Underwriting but cannot write results, approve underwriting,
  replace scenario assumptions without explicit user action, or make ATM calculations authoritative.
- CRM diligence may **inform** Closing but cannot complete checklist items, waive blockers, control
  PAID, or mutate terminal state.
- Future Automation may **observe** CRM projections (no automation work is authorized now).
- CRM logs **business events only**; any actual outreach *send* is owned by future approved
  Communications/Automation, never a CRM action.

**No feature requires reversal or re-architecture.** The corrective actions are additive tests +
documentation, sequenced in the [Restoration Plan](./PLATFORM_ROADMAP_RESTORATION_PLAN.md).

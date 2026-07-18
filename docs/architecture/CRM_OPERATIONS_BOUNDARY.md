# CRM Operations — Architecture Boundary

> **Status: PENDING FOUNDER RATIFICATION.** Defines the ownership and boundaries of the CRM
> feature set captured on `stabilize/crm-production-reconciliation`, so it extends the platform
> through existing seams and **never becomes a competing source of truth**. Companion to the
> [CRM Reconciliation Acceptance](../releases/CRM_PRODUCTION_RECONCILIATION_ACCEPTANCE.md).

---

## 0. Principle

The CRM layer is **sourcing-side operational tooling**: it helps acquire and qualify sellers and
manage contact/diligence workflow *before* a deal is under contract. It **reads** existing
projections and **adds its own additive records**; it does **not** own underwriting, closing,
pipeline stage, or any frozen domain's truth.

---

## 1. Owner Contacts

- **Owns:** contact records for an `Owner` (`OwnerContact`) and contact interactions
  (`ContactTouch`) — name, method, role, disposition. Org-scoped.
- **Does not own:** the canonical `Owner` identity (v1.2 Owner domain) or `Seller` truth. A
  contact **references** an owner/seller; it never redefines them.
- **Seam:** contacts attach to the existing Owner/Seller entities via additive FKs.

## 2. Seller Outreach & Operations

- **Owns:** operational outreach state **on the `Seller` row** — `outreachStatus`,
  `preferredContactMethod`, `nextFollowUpAt`, `assignedUserId`, and do-not-contact / bad-contact
  flags (all additive columns).
- **Authoritative owner of each field:** the `Seller` record. These are **operational CRM
  fields**, distinct from pipeline stage.
- **Must not duplicate:** `Opportunity` pipeline stage/truth, `Task` scheduling, `ActivityLog`
  history, or `BuyerMatch`. Follow-up dates are a CRM convenience field, **not** a replacement
  for Tasks; if richer scheduling is needed later, it should route through the Task domain.

## 3. Opportunity vs. Seller ownership

- **Seller** = the sourcing/relationship entity (outreach lives here).
- **Opportunity** = the deal/pipeline entity (stage, underwriting, closing live here).
- CRM outreach is a **Seller** concern; diligence is an **Opportunity** concern. Neither moves
  pipeline stage — stage transitions remain governed by `canMoveStage` and the pipeline rules.

## 4. Opportunity Diligence vs. the V1.4 Closing Checklist — the load-bearing boundary

- **CRM Diligence (`OpportunityDiligenceItem`)** = a **pre-contract document-gathering tracker**
  (T-12, rent roll, offering memo, tax/utility/insurance, estoppels) with a status lifecycle
  (`NOT_REQUESTED → REQUESTED → RECEIVED → REVIEWED`, plus `MISSING` / `NOT_APPLICABLE`) and a
  `readyForUnderwriting` summary. It answers *"do we have the financials to underwrite?"*
- **V1.4 Closing Checklist** = the **post-contract, checklist-gated** workflow that composes the
  **PAID gate**. It answers *"is this deal ready to close?"*
- **Proven separation (code):** `lib/opportunity-diligence.ts` references `OpportunityStage.PAID`
  **read-only** for stage awareness and, for post-contract stages, its guidance explicitly states
  *"Pre-contract diligence is done. Contract execution now lives in the Closing Center below."*
  The diligence feature **does not**: replace `ClosingChecklist`; bypass Closing readiness; alter
  or compose the PAID gate; auto-complete or waive Closing checklist items; or duplicate terminal
  Closing (Escrow/Financing/Assignment) workflows.
- **Ratified boundary:** diligence is **pre-contract sourcing**; the Closing Center is
  **post-contract execution**. `readyForUnderwriting` is a CRM advisory signal and is **never** an
  input to the PAID gate or to underwriting calculations.

## 5. ActivityLog usage

- CRM writes should use `ActivityLog` **only** for business-visible events, via existing
  conventions, and must **never overwrite** history. (Automation's two-ledger rules are
  unaffected; CRM is human-actor `USER` attribution.) *Review follow-up:* confirm CRM server
  actions log through the standard helper rather than ad-hoc writes.

## 6. Task usage

- Follow-up scheduling is a lightweight CRM field today. It **must not** grow into a parallel
  task engine — richer reminders/scheduling route through the existing `Task` domain (and, later,
  the Automation reminder phase), not a CRM-owned scheduler.

## 7. Automation boundary

- CRM is **human-driven**. It is **not** automation and introduces **no** background process,
  scheduler, or executor. The paused Phase 2.0.1 Automation domain remains byte-unchanged and
  inert; CRM does not read or write automation tables.

## 8. Future communication boundary

- The lead-import feature ingests contact data but sends **no** communications. Any future
  outreach send (email/SMS) must go through an explicit, policy-gated, audited channel (the
  Automation communication phase / AU-11) — **never** directly from a CRM action.

## 9. Import provenance & source-of-truth rules

- The DealAutomator importer creates/reuses `Owner`/`Property`/`Opportunity`/`Note`/external-id
  records **within the actor's organization** (membership verified). Imported data is **sourced,
  not authoritative** beyond what the domains already own; the importer must **fail closed** on
  org mismatch and must **never** create cross-organization links. Import job metadata must be
  org-scoped (current gap noted in the acceptance package §7).

---

## 10. Standing rules (verbatim)

CRM must **never**: own or redefine `Owner`/`Seller`/`Opportunity`/underwriting/closing truth ·
move pipeline stage · compose or bypass the PAID gate · replace the Closing checklist ·
auto-complete/waive Closing items · feed underwriting calculations · perform cross-organization
reads/writes · send external communications · introduce a background/automation process.

*Status: PENDING FOUNDER RATIFICATION.*

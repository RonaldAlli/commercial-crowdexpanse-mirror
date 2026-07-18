# Platform Source-of-Truth Matrix

> **Status: PENDING FOUNDER REVIEW.** The single authoritative owner for every major platform
> concept, its allowed readers/writers, and any conflicting implementation. Verified by direct code
> inspection + read-only production queries (2026-07-18). **Result: no duplicate/competing source of
> truth was found;** two items are flagged for *documentation* clarity only.

---

## 1. Matrix

| Concept | Authoritative domain / model | Allowed readers | Allowed writers | Conflicting implementation? |
|---|---|---|---|---|
| **Tenant boundary** | `Organization` | all | org admin | none |
| **User identity / session** | `User` + `lib/auth.ts` | all (scoped) | auth/team services | none |
| **RBAC policy** | `lib/permissions.ts` (`MATRIX`) enforced by `lib/authorize.ts` | server actions | — (pure policy) | none — exhaustive `Record<Resource,Capability>`; CRM additions additive |
| **Owner identity (canonical)** | `Owner` (+ identity/merge intelligence) | CRM, Import, UI | owner services (`lib/owners.ts`, intelligence) | none — CRM contacts *reference* owners, never redefine |
| **Property identity (canonical)** | `Property` / `PropertyIdentity` (derived) | UI, Import | property/identity services | none |
| **Seller (sourcing entity)** | `Seller` | CRM/UI | seller services | none |
| **Opportunity stage (pipeline)** | `Opportunity.stage` | CRM/Closing/UI | **`opportunities/actions.ts` transition only** (`canMoveStage` + gate) | none — CRM/diligence never write stage |
| **Underwriting result** | `ScenarioResult` (from `lib/analysis.ts` kernel) | Closing (read-only), UI, Offer Memo | deterministic analyzer only (`analyzer/actions.ts`) | **none** — ATM-Wholesale is advisory, persists nothing, no `analysis.ts` import |
| **Underwriting decision** | `UnderwritingDecision` (append-only) | UI, Offer Memo | `UNDERWRITING_APPROVAL` RBAC via analyzer action | none — never a calc input |
| **Closing readiness / blockers** | `lib/closing.ts` projection over `ClosingChecklistItem` | Dashboard/Timeline/badges/UI (read-only), Automation (future read-only) | Closing state (checklist items) | none — TX-6 single projection; no duplicate readiness calc |
| **PAID eligibility** | **composed gate** `isClosingReady()` ∘ `canMoveStage()` in `opportunities/actions.ts` | UI | Closing workflow only | none — not bypassed; CRM diligence cannot affect it |
| **Escrow / Financing / Assignment terminal state** | `EscrowRecord`+`EscrowEvent` / `FinancingRecord` / `AssignmentRecord` (immutable snapshots) | Dashboard/UI | their closing services (ADMIN-gated resolution) | none |
| **Owner contact info (operational)** | `OwnerContact` | CRM/UI | `owners/actions.ts`, `contacts/actions.ts` (org-scoped) | none — additive to Owner |
| **Contact interaction log** | `ContactTouch` | CRM/UI | contacts service | none |
| **Outreach state** | *per-contact:* `OwnerContact.*` · *per-lead:* `Seller`/`Buyer.*` | CRM/UI, future Automation (read) | CRM services | **flag (docs):** two surfaces, different grains — see §2 |
| **Pre-contract diligence** | `OpportunityDiligenceItem` (CRM) | CRM UI | `opportunities/diligence-actions.ts` | none — **distinct from** the V1.4 `ClosingChecklist` (post-contract) |
| **Import job + provenance** | `LeadImportJobRecord` (fs, org-scoped) + imported-row provenance on domain records | CRM/UI (org-scoped) | import service (ADMIN, actor↔org verified) | none — reconciled (ADR-0006) |
| **Wholesale calc** | *ephemeral* (`lib/atm-wholesale-calculator.ts`) | analyzer UI | — (no persistence) | **none** — advisory only; NOT authoritative |
| **Business activity history** | `ActivityLog` | platform | approved append paths (`actorType` USER/AUTOMATION) | none — automation link is one-way; never overwritten |
| **Automation execution** | `AutomationExecution` (immutable) | health/audit | executor only (currently inactive) | none — 0 rows; executor never started |
| **Generated documents** | `Document` (+ DocumentOrigin, snapshot, SHA) | UI/download | offer-memo / assignment-agreement services | none |

---

## 2. Flagged for documentation (not conflicts)

1. **Outreach state grain (D-CRM-OUTREACH-OWNERSHIP).** Outreach fields live on **`OwnerContact`**
   (per-contact) *and* on `Seller`/`Buyer` (per-lead). These are **different grains of different
   entities**, so there is **no data conflict** (prod: 0 cross-org, 0 anomalies). The authoritative
   owner should be **documented**: per-contact outreach = the contact's own state; per-lead outreach
   = the seller/buyer's overall state. Recommendation: state this in `CRM_OPERATIONS_BOUNDARY.md`.
2. **Diligence vs Closing checklist.** `OpportunityDiligenceItem` (CRM, pre-contract document
   gathering) is deliberately **separate** from `ClosingChecklist` (V1.4, post-contract PAID-gating).
   Verified in code: diligence references `PAID` read-only and defers to the Closing Center; it does
   not complete/waive Closing items or affect readiness. Already locked in `CRM_OPERATIONS_BOUNDARY.md`.

---

## 3. Verdict

**No duplicate or competing source of truth exists.** Every concept has one authoritative owner;
the two "advisory/parallel" surfaces (ATM Wholesale, per-contact vs per-lead outreach) are
non-authoritative or different-grain, with production data confirming zero conflict. The only action
is the documentation clarification in §2.

# Roadmap → Code Traceability

> **Status: PENDING FOUNDER REVIEW.** Maps every accepted roadmap milestone to its implementing
> code (models / migrations / services / routes / tests) and its verified current status.
> Evidence is first-hand (direct code inspection + read-only prod queries + the isolated test gate),
> corroborated by the discovery agents. Companion to [Canonical
> Roadmap](../roadmap/CANONICAL_PLATFORM_ROADMAP.md).

**Verification anchors (this session, worktree `ba1bd7c`):** frozen modules diffed vs `v1.4.0`;
isolated gate `tsc 0 · unit 58 files/93.0% · E2E 39/39`; prod DB 30 migrations, integrity clean.

---

## 1. Milestone → implementation

| Milestone | Models | Migrations | Key services / routes | Tests | Status |
|---|---|---|---|---|---|
| **1.0/1.1 Foundation + Ops** | Organization, User, Seller, Buyer, Property, Opportunity, BuyerMatch, Invitation, OrganizationSettings, EmailMessage | 1–4 | auth/authorize/permissions, email outbox, `/login`,`/opportunities`,`/sellers`,`/buyers`,`/matches` | `permissions/can`, `list-params`, `task-sort`, e2e-* | **Frozen** |
| **1.2 Owner Intelligence** | Owner, OwnerAlias, OwnerExternalIdentifier, OwnerMatchDecision, OwnerMergeRecord, Observation, IntelligenceSignal, RefreshJob | 5–10 | `lib/intelligence/owner-*`, `/owners/{candidates,merges}` | `intelligence/owner-*` unit + e2e | **Accepted/deployed** |
| **1.2 Property Identity** | Property, PropertyIdentity, PropertyExternalIdentifier, PropertyMatchDecision, PropertyResolution | 11–13 | `lib/intelligence/property-*`, `/properties/{candidates,[id]/identity}` | `intelligence/property-*` unit + e2e | **Accepted/deployed** |
| **1.3 Underwriting** | Underwriting, UnderwritingScenario, UnderwritingAssumption, ScenarioResult, ScenarioLineItem, FinancingCase, FinancingAssumption, FinancingCaseResult, CashFlowYear, EquityCashFlowYear, SensitivityAnalysis, SensitivityCell, ScenarioFinding, ScenarioRecommendation, UnderwritingDecision | 14–21 | **`lib/analysis.ts` (kernel)**, `lib/underwriting/*`, `/analyzer/*`, `analyzer/actions.ts` | `underwriting/*` (11 CRITICAL modules ≥90%) + e2e | **FROZEN — byte-unchanged vs `v1.4.0`** |
| **1.3 Offer Memo** | Document (+ DocumentOrigin, generated snapshot/SHA) | 22 | `lib/documents/offer-memo*` | `documents/offer-memo` unit + e2e | **FROZEN** |
| **1.4 Closing (checklist + PAID gate)** | ClosingChecklistTemplate/Item, ClosingChecklist/Item | 23 | **`lib/closing.ts` (`isClosingReady`)**, `closing-service`, PAID gate in `opportunities/actions.ts`, `/closing` | `closing` unit + e2e-closing | **FROZEN — gate composed, intact** |
| **1.4 Escrow** | EscrowRecord, EscrowEvent | 24 | `lib/escrow*.ts` | `escrow` unit + e2e | **FROZEN** |
| **1.4 Financing** | FinancingRecord | 25 | `lib/financing*.ts` (one-way read of underwriting output only) | `financing` unit + e2e | **FROZEN** |
| **1.4 Assignment** | AssignmentRecord | 26 | `lib/assignment*.ts`, `lib/documents/assignment-agreement*` | `assignment` unit + e2e | **FROZEN** |
| **1.4 Read model (Dashboard/Timeline/Badges)** | — (projections) | code-only | `lib/transaction-dashboard.ts` (+ `projectClosingBadges`), `lib/transaction-timeline.ts`, `/dashboard`,`/activity`,`/opportunities` list | `transaction-dashboard`, `transaction-timeline` unit + e2e | **FROZEN — TX-6 reuse intact, no duplication** |
| **2.0.1 Automation Foundation** | AutomationJob, AutomationExecution | 27 | `lib/automation/*`, `/api/automation/health`, inert `crowdexpanse-automation` PM2 app | `automation/{lifecycle,policy,idempotency,health}` unit + `e2e-automation` (98) | **Accepted · in prod · executor NEVER started (D19)** |
| **CRM Owner Contacts** *(off-roadmap)* | OwnerContact | 28 | `contact-options.ts`, `/contacts`, `/owners/[id]/contacts`, `owners/actions.ts` | — *(no accepted-suite tests; gap)* | **Deployed/accepted; test gap** |
| **CRM Contact/Seller Outreach** *(off-roadmap)* | ContactTouch (+ outreach cols on Owner/Seller/Buyer) | 29 | `/contacts/actions.ts`, `sellers/[id]` | — *(gap)* | **Deployed/accepted; test gap** |
| **CRM Opportunity Diligence** *(off-roadmap)* | OpportunityDiligenceItem | 30 | `lib/opportunity-diligence*.ts`, `opportunities/diligence-actions.ts` | — *(gap)* | **Deployed/accepted; test gap** |
| **CRM Lead Import** *(off-roadmap)* | *(reuses Owner/Property/Opportunity/Note)* | — | `lib/lead-import-jobs*.ts`, `/settings/imports`, importer scripts | **`tests/unit/crm/lead-import-*` (20 tests)** | **Deployed/accepted; remediated (CSV-only, org-scoped)** |
| **CRM ATM Wholesale** *(off-roadmap)* | **none (no model)** | — | `lib/atm-wholesale-calculator.ts`, `/analyzer/atm-wholesale` | `tests/unit/analysis/atm-wholesale-calculator` | **Advisory-only; persists nothing** |

---

## 2. Coverage observations

- **On-roadmap coverage is strong:** the V1.3/V1.4 CRITICAL modules are unit-gated ≥90% branch and
  exercised by the E2E suite (39 scripts). Baseline gate green this session.
- **Off-roadmap test gap (see D-CRM-TEST in the register):** Owner Contacts, Outreach, and Diligence
  have **no tests in the accepted suite** (only Lead-Import and ATM-Wholesale do). This is the main
  *quality* gap for the off-roadmap layer — behavior is live and data-clean, but under-tested.
- **Route/roadmap mismatch (cosmetic, D-DOC):** `/analyzer/atm-wholesale` lives under the underwriting
  analyzer route group but is a CRM wholesale tool, not commercial underwriting.
- **Legacy retained (D15):** `DealAnalysis` model still present (deferred removal).

---

## 3. Traceability verdict

Every accepted milestone maps to present, intact code; the frozen 1.3/1.4 surface is byte-verified;
the off-roadmap CRM layer is present, additive, data-clean, and (except Lead-Import/ATM) **under-tested**.
No milestone is missing or regressed. The actionable traceability items are the **off-roadmap test gap**
and the **documentation drift** — carried into the [Defect
Register](./PLATFORM_STABILIZATION_DEFECT_REGISTER.md) and [Restoration
Plan](./PLATFORM_ROADMAP_RESTORATION_PLAN.md).

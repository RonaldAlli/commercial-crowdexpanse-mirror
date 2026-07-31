# Revenue Workspace — Backend Capability Audit

> **Governed program: CRE Revenue Workspace — APPROVED TO PLAN, Phase 1.** Read-only audit of current
> `main 4465582`. **No schemas proposed, no APIs designed, no calculations implemented.** The one question:
> *how much of a Revenue Workspace can be built today using existing authority?* Recommendation at the end.
> Context: [[crowdexpanse-cre-workspace]], [[engineering-bi-rule-1]], [[dealflow-product-framing]].

## Method

Audited the authority source of truth (`prisma/schema.prisma`, ~70 models) plus `lib/` services, pipeline
facts, and `app/(workspace)` UI. Financial vocabulary was swept across schema and code (revenue, fee, commission,
invoice, payment, disbursement, settlement, proceeds, HUD, partner, investor, forecast, etc.). Citations are
`file:line` against the audit baseline.

---

## 1. Proven Existing Authority (implemented and reusable)

### 1.1 Realized revenue — the one authoritative definition (assignment fee)
- **`lib/business-intelligence/queries.ts:13`** states the rule verbatim: *"REALIZED REVENUE =
  SUM(AssignmentRecord.executedFeeUsdSnapshot) WHERE status = EXECUTED — never the mutable
  Opportunity.assignmentFeeUsd."* (BI Rule 1.)
- Exposed services: `revenueByChannel`, `assignmentRevenueByCampaign`, `revenueByAcquisitionEvent`,
  `closedWonConversionByChannel`, `buyerCoverageByChannel` (`lib/business-intelligence/queries.ts:48–95`,
  types in `types.ts`). Org-scoped, deterministic, attribution-dimensioned.
- **Authoritative realized-revenue fact:** `AssignmentRecord.executedFeeUsdSnapshot` +
  `executedContractValueUsdSnapshot`, immutable at execution (`prisma/schema.prisma` AssignmentRecord ~2071).

### 1.2 Per-deal assignment economics (contract + expected)
- `Opportunity.contractValueUsd`, `Opportunity.assignmentFeeUsd` — the **single source of truth for the
  assignment fee** (AS-3). Mutable, pre-close/expected figures. Already surfaced on the Opportunity Workspace
  (`components/workspace-ui/opportunity/OpportunityWorkspace.tsx:67–68`) and the Closing Console.

### 1.3 Assignment settlement snapshot + lifecycle
- `AssignmentRecord` (status, assignor/assignee, `executedFeeUsdSnapshot`, `executedContractValueUsdSnapshot`)
  via `lib/assignment-service.ts` / `lib/assignment.ts` — an immutable execution snapshot of the realized fee.

### 1.4 Revenue/closing lifecycle events (pipeline facts)
- Authoritative fact types: `CONTRACT_EXECUTED`, `ASSIGNMENT_EXECUTED`, `FINANCING` (COMMITTED/CLEARED/FUNDED),
  `SETTLEMENT_COMPLETED`, `TRANSACTION_CLOSED` (`lib/pipeline-facts/registry.ts:68–81`). `TRANSACTION_CLOSED`
  drives the **PAID** pipeline stage (`lib/pipeline-projection/spine.ts:16`), under an authorization policy
  (`lib/pipeline-authorization/policy.ts`). This gives an authoritative "where is each deal in its revenue
  lifecycle" without new backend.

### 1.5 Funds-disbursement ontology (typed evidence fact)
- `FUNDS_DISBURSED` fact with a validated payload: `purpose ∈ {SellerProceeds, AssignmentFee, Commission,
  Refund, EarnestMoneyReturn}` (`lib/pipeline-facts/registry.ts:38–44,77`). A *shared funds ontology* exists as
  evidence-class facts (consumed by `lib/pipeline-predicates/predicates/rs-1.ts`).

### 1.6 Projected deal economics (underwriting, analysis-time)
- `FinancingCaseResult.netSaleProceedsUsd / equityMultiple / leveredIrrPct / totalProfitUsd`
  (`prisma/schema.prisma:1552–1556`), `ScenarioLineItem.spreadUsd` (`:1438`), `CashFlowYear`/
  `EquityCashFlowYear` distributions. **Projected**, frozen in LOCKED scenarios; surfaced in `/analyzer` and
  Guided Underwriting. Reusable as clearly-labeled *expected* economics — not realized revenue.

### 1.7 Existing revenue UI
- **`/insights` "Source performance"** (`app/(workspace)/insights/page.tsx`) — realized revenue by channel,
  assignment revenue by campaign, revenue by acquisition event, closed-won conversion, buyer coverage.
  **Classification: authoritative + reusable.** (Acquisition-source oriented, not a deal-level revenue surface.)
- Command Center and Opportunity Workspace surface some economics (contract value / assignment fee).
  **Classification: reusable** (read-only façades over the same authority).
- **No `/revenue` route exists.** No duplicate or deprecated revenue screens found.

---

## 2. Partial Authority (exists but incomplete)

- **Funds disbursement** — the `FUNDS_DISBURSED` fact + purpose ontology exist (§1.5), but **no service
  aggregates disbursed funds into realized totals per purpose** (only the assignment-fee purpose is aggregated
  into revenue, §1.1). SellerProceeds / Commission / Refund disbursements are recordable as evidence but not
  summed or reported.
- **Settlement completion** — `SETTLEMENT_COMPLETED` is a factClass-D state marker with **no typed settlement
  amounts** (`registry.ts:75`); it records *that* settlement occurred, not net-proceeds/closing-statement values.
- **Purchase price / closing costs** — present only as **analysis inputs** on `DealAnalysis`
  (`prisma/schema.prisma:1260,1262`), i.e. underwriting-time, not realized settlement facts.
- **Escrow / earnest** — `EscrowRecord.earnestAmountUsd` + deposit tracking (~1960); **earnest money only**, no
  full escrow disbursement ledger.
- **Financing amount** — `FinancingRecord` carries `lenderName`/status only; the loan amount lives in the
  underwriting `FinancingCase` capital assumptions (projected), not a realized funded-amount fact.

---

## 3. Missing Authority (does not currently exist)

- **No revenue model** — no `Revenue`, `RevenueEvent`, `RevenueStatus`, or expected-vs-received revenue entity.
- **No fee types beyond assignment fee** — `referralFee`, `consultingFee`, `acquisitionFee`,
  `assetManagementFee`, `equityParticipation`, `commissionUsd`, `ownerDraw`, `partnerSplit` all return **0**
  across schema + `lib/`. "Commission" exists only as a `FUNDS_DISBURSED` purpose label (no amount/recipient).
  "Wholesale spread" exists only as a **projected** scenario line item.
- **No accounting** — no invoices, payments (as a model), realized distributions, reimbursements, owner draws,
  partner splits, accounting exports, or reconciliation.
- **No settlement statements** — no HUD/CD, closing statements, stored net proceeds, or seller-proceeds amounts
  (only *projected* net sale proceeds in underwriting; SellerProceeds only as a funds-purpose label).
- **No partner authority** — no `Partner`, `Investor`, `Broker`, `Referral`, `JointVenture`, or bird-dog models
  (all **0**). Lenders exist only as a `lenderName` string.
- **No forecasting** — no projected-revenue, expected-payment-date, pipeline-value, or revenue-by-stage service
  (`forecast|expectedRevenue|pipelineValue|projectedRevenue|revenueByStage` = **NONE** in `lib/`/`app/`).
  `Opportunity.targetCloseDate` exists but no expected-payment-date and no pipeline roll-up.

---

## 4. Recommended Operator Workspace (audit-based, reuse-first)

A read-only Revenue Workspace can be built **today** over proven authority, anchored on the one thing the
platform treats as real revenue — the **executed assignment fee**:

1. **Realized Revenue (executive answer, first)** — total realized revenue + by acquisition source, reusing the
   BI layer (§1.1) and the `/insights` presentation. This is fully authoritative today.
2. **Per-deal revenue economics** — contract value, assignment fee (expected), executed-fee snapshot (realized),
   reusing `Opportunity` + `AssignmentRecord` (§1.2–1.3). Clearly separate *expected* (mutable) from *realized*
   (executed snapshot) — mirrors BI Rule 1.
3. **Revenue lifecycle position** — per deal, from the pipeline facts (CONTRACT_EXECUTED → ASSIGNMENT_EXECUTED →
   SETTLEMENT_COMPLETED → TRANSACTION_CLOSED/PAID), reusing §1.4. Answers "where is this deal's revenue?"
4. **Expected (projected) economics** — from LOCKED underwriting scenarios (spread, net proceeds), reusing §1.6,
   labeled *projected/advisory* (Information Quality contract), never conflated with realized.
5. **Funds-disbursement evidence** — surface `FUNDS_DISBURSED` facts where present (§1.5), read-only, honestly
   incomplete where no aggregation exists.

**Out of scope today** (would require new business + backend decisions, not this workspace): multi-fee revenue
(referral/commission/consulting/acquisition/asset-mgmt/equity), invoices/payments/accounting/reconciliation,
settlement statements / realized net proceeds, partner splits/distributions, and a revenue **forecast** /
pipeline-value roll-up. Each is a *Missing Authority* item, not a UI gap.

This honors the platform framing that the assignment fee is the primary realized wholesale revenue
([[dealflow-product-framing]]), and BI Rule 1 that metrics derive from authoritative facts.

---

## Recommendation

**PARTIALLY READY.**

A genuinely useful, honest Revenue Workspace is buildable today over **proven** authority — realized assignment
revenue (BI layer), per-deal assignment economics, the revenue lifecycle facts, and projected underwriting
economics — with **no new backend**. However, the broader "revenue" surface in the charter (multiple fee types,
accounting, settlement statements/net proceeds, partner splits, and forecasting) rests on **Missing Authority**
and cannot be shown truthfully without targeted backend additions.

**Suggested shape of the next decision:** scope Milestone 1 of the Revenue Workspace to the assignment-fee-centric
realized revenue that IS authoritative (Recommended Workspace items 1–3, with 4–5 as clearly-labeled
projected/evidence), and treat each additional revenue concept (fee type, accounting, settlement, partner,
forecast) as its own governed business-then-backend decision. That keeps the workspace a truthful façade over
existing authority, consistent with every prior CRE workspace.

**Stop point:** audit complete; recommendation = **PARTIALLY READY**. Awaiting review. No implementation, no
merge, no deployment.

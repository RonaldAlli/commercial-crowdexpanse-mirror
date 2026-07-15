# Version 1.3 — Commercial Underwriting

> **Theme:** Deepen the Deal Analyzer into full financial modeling.
> **Status:** 🟢 In progress — architecture locked ([Underwriting Architecture Lock](../architecture/UNDERWRITING_ARCHITECTURE_LOCK.md)); **Commit 3a (Underwriting Model Formalization) is LIVE**.

## Architecture & progress
The deterministic architecture is locked in the [Underwriting Architecture Lock](../architecture/UNDERWRITING_ARCHITECTURE_LOCK.md) (decisions U-A…U-L, invariants UW-1…UW-9): underwriting is a **read-only consumer** of Version 1.2, not a second source of truth.

- **Commit 3a — Underwriting Model Formalization — ✅ LIVE (2026-07-15).** Establishes ownership + determinism **without deepening the math**: the canonical `Underwriting → Scenario → Assumption → ScenarioResult` model, model lineage (`UNDERWRITING_MODEL_VERSION`/`CALCULATION_LIBRARY_VERSION`/`RULESET_VERSION`), a deterministic `scenarioVersion` fingerprint, the one-way ScenarioSeed snapshot (a Scenario never changes because the Property changes), a rebuildable/content-idempotent `ScenarioResult` (1:1 with a Scenario), the `DRAFT → LOCKED → SUPERSEDED` lifecycle, an `UNDERWRITING` RBAC resource, and a **behavior-preserving** analyzer repoint. `lib/analysis.ts` is unchanged. `DealAnalysis` is retained deprecated with an idempotent backfill ([D15](./TECHNICAL_DEBT.md)). Additive migration (prod 13→14).

- **Commit 3b — Deepen the deterministic financial engine — 🟢 in progress.** Deepens the math only (never ownership/lifecycle/governance/V1.2), as a sequence of deterministic sub-slices, each a **pure sibling** to `lib/analysis.ts` held to the [Calculation Principles](../architecture/UNDERWRITING_CALCULATION_PRINCIPLES.md): **3b-i debt sizing** → **3b-ii income/expense schedules** → **3b-iii financing cases + cash flow** → 3b-iv exit + waterfall → 3b-v sensitivity → 3b-vi findings/risks + suggested recommendation.
  - **3b-i — Deterministic Debt Sizing — ✅ LIVE (2026-07-15).** Pure `lib/underwriting/debt-sizing.ts`: sizes the loan by the binding of LTV (%·estimated value), LTC (%·all-in cost), and DSCR (invert the amortizing payment for NOI/minDSCR); `sizedLoan` = min of the applicable constraints; every constraint optional → degrades to null (3a behavior preserved). +3 assumptions (`TARGET_LTV_PCT`/`TARGET_LTC_PCT`/`MIN_DSCR`, not kernel inputs); +5 `ScenarioResult` fields; lineage bumped **v1→v2** (model 2 / calc 2 / rules 1). Invariants **DS-1** (each constraint independently reproducible) + **DS-2** (binding selection fully explainable). Additive migration (prod 14→15). The sized loan is a *suggestion* — never auto-applied as the modeled loan.
  - **3b-ii — Income & Expense Schedules — ✅ LIVE (2026-07-15).** Pure `lib/underwriting/schedule.ts`: optional per-scenario line items (`ScenarioLineItem`, kind INCOME|EXPENSE) roll up **independently** to the effective gross income and operating expenses that feed the **unchanged** kernel. A present schedule overrides the corresponding scalar assumption **per kind**; an absent (or explicitly cleared) schedule falls back to the scalar (3a behavior preserved). +1 model + 2 `ScenarioResult` effective-total fields; lineage bumped **v2→v3** (model 3 / calc 3 / rules 1). Fingerprint includes canonically-sorted line items and **excludes** `position` — reordering is presentation, so it never flips `scenarioVersion`; kind/category/amount/source do. Invariants **IS-1** (income & expense independently reproducible) + **IS-2** (schedule presence explicit, never inferred from a zero total) + **IS-3** (line order is presentation only). Additive migration (prod 15→16, serving `tJ-qMo34RYbpjWcFuqe1m`).
  - **3b-iii — Financing Cases + Multi-Year Cash Flow — ✅ LIVE (2026-07-15).** First-class **FinancingCase** capital structures under a Scenario (`Scenario` operating → `FinancingCase` capital → `CashFlow` per-case): pure `lib/underwriting/cash-flow.ts` projects a financing-independent NOI trajectory (income/expense grow independently) that every case reuses; pure `lib/underwriting/financing.ts` layers each case's debt (via the **unchanged** kernel + debt-sizing) into levered cash flow before tax + DSCR. **Sanctioned reshape** (prod held 0 scenarios/results): the 6 capital assumptions relocated off the Scenario onto `FinancingAssumption`, and the 8 financing-dependent columns dropped from `ScenarioResult` onto `FinancingCaseResult` — `ScenarioResult` is now operating-only. +new `FinancingCase`/`FinancingAssumption`/`FinancingCaseResult`/`CashFlowYear` + projection assumptions (`INCOME_GROWTH_PCT`/`EXPENSE_GROWTH_PCT`/`HOLD_YEARS`); lineage bumped **v3→v4** (model 4 / calc 4 / rules 1); per-case `financingCaseVersion` fingerprint. Invariants **CF-1** (operating/capital ownership separate) + **CF-2** (cash flow → case, NOI → Scenario) + **CF-3** (each case independently reproducible) + **CF-4** (a case never mutates the Scenario) + **CF-5** (one NOI trajectory reused by all cases). Operating cash flow only — no exit value, sale, refinance, waterfall, IRR, or equity multiple. Additive + reshape migration (prod 16→17, serving `SXEu-bihv8NuvgEJeCFTO`).

## Goal
Give analysts a trustworthy, auditable underwriting model that turns property + market data into a go/no-go and an offer. Build on the existing Analyzer, not a rewrite.

## Already shipped (foundation)
`DealAnalysis` model + `lib/analysis.ts` (pure, unit-testable) compute:
- **NOI** (gross income − operating expenses)
- **Cap rate**
- **DSCR** (from a fully-amortizing debt payment)
- **Debt yield**
- **Price per unit**

## Scope (this release deepens the model)

### 1. NOI
Line-item income & expense modeling (not just totals): rent roll roll-up, vacancy/credit loss, expense categories, T12 vs. pro-forma.

### 2. Cap Rate
Entry vs. exit cap, stabilized vs. in-place; benchmark against 1.2 Market Intelligence.

### 3. Debt
Multiple debt scenarios: LTV/LTC sizing, interest-only periods, rate stress, refinance assumptions.

### 4. Cash Flow
Multi-year pro-forma cash flow with rent growth, expense inflation, capex reserves.

### 5. Sensitivity
Sensitivity tables (cap rate × rate, rent growth × vacancy) and break-even analysis.

### 6. Risk
Risk scoring: DSCR/debt-yield thresholds, occupancy risk, market risk from 1.2 signals; surfaced as flags on the Opportunity.

### 7. Financial Models
Saved, versioned model scenarios per opportunity; compare scenarios; export an offer memo (feeds `DocumentType.OFFER_MEMO` / LOI).

## Architecture notes
- Keep the math **pure** in `lib/analysis.ts` (and new sibling modules) — no Prisma in the math — so every formula is unit-tested (see [Testing Roadmap](./TESTING_ROADMAP.md)).
- Model scenarios are versioned rows, org-scoped, tied to `Opportunity`.
- Underwriting consumes 1.2 intelligence as inputs/defaults where available; degrades gracefully without it.

## Dependencies
- 1.2 Property/Market Intelligence (better inputs; not strictly blocking — model accepts manual inputs).
- Documents module (rent roll / T12 ingestion).

## Definition of Done (1.3)
Global DoD **plus**: every formula has unit tests with worked examples; scenarios are versioned and comparable; an offer memo can be generated from a model.

## Out of scope
Closing/escrow (1.4), AI-assisted underwriting narratives (2.0).

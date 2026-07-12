# Version 1.3 — Commercial Underwriting

> **Theme:** Deepen the Deal Analyzer into full financial modeling.
> **Status:** 🟡 Foundation exists — `lib/analysis.ts` + `DealAnalysis` already compute core metrics.

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

# Release Note — Version 1.3 · Commercial Underwriting

**Released:** 2026-07-15 · **Tag:** `v1.3.0` · **Build:** `OuE0HfLIzVy6LsKqzp3ct` · **Migrations:** 22
**Full sign-off:** [V1.3 Production Acceptance Record](./V1_3_ACCEPTANCE.md).

## Business outcome
The Analyzer is now a full, auditable underwriting engine: an acquisitions team can turn property + assumption inputs into a versioned financial model — NOI, financing, multi-year cash flow, exit returns, sensitivity, risk findings, a suggested recommendation, a recorded human decision — and **generate an offer memo directly from a locked model**.

## Shipped architecture
A deterministic, one-way calculation stack of **pure sibling modules** around the **unchanged** `lib/analysis.ts` kernel: `Scenario (operating) → FinancingCase (capital) → CashFlowYear → Exit → Equity Cash Flows → Return Metrics → Sensitivity → Findings/Recommendation`, then a **terminal human decision** layer, a **read-only comparison**, and a **Documents-owned offer memo**. Every derived surface is a content-idempotent, rebuildable function of one Scenario's frozen assumptions + model lineage. Design authorities: [Underwriting Architecture Lock](../architecture/UNDERWRITING_ARCHITECTURE_LOCK.md) (UW/DS/IS/CF/EX/SE/FR/AP), [Calculation Principles](../architecture/UNDERWRITING_CALCULATION_PRINCIPLES.md) (11), [Offer-Memo Architecture Lock](../architecture/OFFER_MEMO_ARCHITECTURE_LOCK.md) (OM-1…OM-12).

## Major capabilities
Ownership model + scenario versioning (3a) · debt sizing (3b-i) · income/expense schedules (3b-ii) · financing cases + multi-year cash flow (3b-iii) · exit valuation + basic waterfall + levered IRR/equity multiple (3b-iv) · sensitivity matrices (3b-v) · findings/risks + suggested recommendation (3b-vi) · decided recommendation + `UNDERWRITING_APPROVAL` (3d) · scenario comparison (3e) · **offer-memo generation** (deterministic self-contained HTML).

## Security & RBAC
Org-scoped throughout; server-side role enforcement. `UNDERWRITING` governs authoring; the **separate** `UNDERWRITING_APPROVAL` governs deciding (separation of duties). Offer-memo generation requires **both** `UNDERWRITING` read and `DOCUMENT` write. Human decisions and generated memos are append-only and immutable; generated memos carry an immutable snapshot + SHA-256 and are HTML-escaped, self-contained (no external references).

## Database migrations
Prod 13→**22** across the version. The final migration `20260715220000_add_offer_memo_generation` (21→22) is **additive**: a `DocumentOrigin` enum + nullable generation-provenance columns on `documents` + one unique index; 0 destructive statements; verified against 0 production Document/Scenario rows.

## Verification
Typecheck · lint · unit (all CRITICAL ≥90% branch, overall 92.3%) · full E2E (31 scripts; underwriting 166 assertions incl. determinism, immutability, org-isolation, and a live sequence-conflict proving failure-safe cleanup) · isolated build · migration fidelity empty · restore-verified backup · local + external health · build-ID flip.

## Deferred (not in 1.3)
LOI generation · native PDF output · refinance/tax modeling · preferred/promote waterfalls · market-signal risks · AI narrative · email/e-signature · workflow automation · multi-step approval · Version 1.4 Closing Center.

## Rollback
Restore the pre-migration restore-verified backup **`20260715-214525Z`**, or roll code back to **`7071330`** — the migration is additive and every new `documents` column is nullable/defaulted, so prior production code runs unchanged against the 22-migration schema. See [Acceptance §10](./V1_3_ACCEPTANCE.md#10-rollback-reference).

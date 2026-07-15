# Volume 10 — Executive Dashboard

> The single source of truth for "what state is each module in." Update this table whenever a module's status changes (part of the [Definition of Done](./ENGINEERING_MASTER_PLAN.md#definition-of-done)).
> **Last reviewed:** 2026-07-15. Percentages are engineering-judgment estimates of scope-complete against that module's roadmap.

## Legend
✅ Complete · 🟢 Good (usable, minor gaps) · 🟡 Partial · 🔴 Planned

## Module status

| Module | Status | Target Version | % Complete |
|---|---|---|---|
| Authentication & Sessions | ✅ Complete | 1.0 | 100% |
| Organization / Multi-Tenancy | ✅ Complete | 1.0 | 100% |
| Seller Records | 🟢 Good | 1.1 | 90% |
| Buyer Records | 🟢 Good | 1.1 | 90% |
| Property Records | 🟢 Good | 1.1 | 90% |
| Opportunities / Pipeline | 🟢 Good | 1.1 | 85% |
| Buyer Matching | ✅ Complete | 1.1 | 100% |
| Tasks | 🟢 Good | 1.1 | 85% |
| Notes | 🟢 Good | 1.1 | 80% |
| Documents | 🟡 Partial | 1.1→1.4 | 70% |
| Global Search | ✅ Complete | 1.1 | 100% |
| Notifications & Activity | ✅ Complete | 1.1 | 100% |
| Better Lists (cross-cutting) | 🟢 Good | 1.1 | 85% |
| Permissions (cross-cutting) | 🟢 Good | 1.1 | 90% |
| Team Management (Roster/Roles/Lifecycle) | 🟢 Good | 1.1 | 85% |
| Invitations | 🟢 Good | 1.1 | 90% |
| Organization Settings | 🟢 Good | 1.1 | 90% |
| Communications / Email (cross-cutting) | 🟢 Good | 1.1 | 60% |
| Testing & CI (cross-cutting) | ✅ Complete | 1.1 | 100% |
| Backups & DR (cross-cutting, D4) | ✅ Complete (code+docs) | 1.1 | 100%¹ |
| Deal Analyzer / Underwriting | ✅ Complete | 1.3 | 100% (**Version 1.3 accepted & released `v1.3.0` — 3a + 3b-i…3b-vi + 3d + 3e + offer-memo LIVE** — 3a: canonical deterministic ownership model `Underwriting → Scenario → Assumption → ScenarioResult` (model lineage + `scenarioVersion` fingerprint, one-way ScenarioSeed snapshot, rebuildable ScenarioResult, behavior-preserving analyzer repoint; `lib/analysis.ts` unchanged). **3b-i: deterministic debt sizing** (LTV/LTC/DSCR → binding constraint; lineage v2; DS-1/DS-2). **3b-ii: income/expense schedules** (pure `schedule.ts` — line items → effective NOI, override scalar per kind, scalar fallback; lineage v3; IS-1/IS-2/IS-3). **3b-iii: financing cases + multi-year cash flow** (`Scenario` operating → `FinancingCase` capital → `CashFlow`; capital relocated off the Scenario, `ScenarioResult` now operating-only; pure `cash-flow.ts`/`financing.ts` over the unchanged kernel; lineage v4; CF-1…CF-5). **3b-iv: exit valuation + basic equity waterfall** (`… → CashFlowYear → Exit Valuation → Equity Cash Flows → Return Metrics`; pure `exit.ts` — terminal value, amortized debt payoff, equity multiple, levered IRR; single-holder waterfall; lineage v5; EX-1…EX-6). **3b-v: sensitivity matrices** (per-`FinancingCase` `SensitivityAnalysis`→`SensitivityCell` as a pure CONSUMER — deterministic evenly-spaced axes, ≤11/axis + ≤121 cells, in-memory re-derivation with overrides never persisted, exact-only baseline marking; pure `sensitivity.ts`; lineage v6; SE-1…SE-7). **3b-vi: findings/risks + suggested recommendation** (the TOP consumer layer — pure `findings.ts` runs a fixed versioned ruleset over the settled outputs → per-Scenario `ScenarioFinding`s + one advisory `ScenarioRecommendation` (PROCEED/PROCEED_WITH_CONDITIONS/PASS); the engine suggests, humans decide. **Ratified R-A fingerprint separation**: `RULESET_VERSION` removed from every metric fingerprint and moved into a dedicated `findingsVersion`, so a rules-only change (ruleset 1→2) never invalidates a metric; FR-1…FR-6). **3d: decided recommendation + `UNDERWRITING_APPROVAL`** (the U-B human half — a terminal, append-only, immutable `UnderwritingDecision` (APPROVED/DECLINED/DEFERRED) recorded only on a LOCKED scenario against an immutable snapshot; lives entirely outside the engine (UW-4), never a calculation input (AP-3), no lineage/fingerprint/version; new `UNDERWRITING_APPROVAL` RBAC separate from authoring — separation of duties; AP-1…AP-6). **3e: scenario comparison** (a read-only side-by-side of every Scenario version at `/analyzer/[opportunityId]/compare` — a pure consumer honoring Calculation Principle 5: each version's metrics + primary financing case + suggested recommendation + current decision read from that Scenario's own persisted results, so a later version never alters a prior version's metrics; `UNDERWRITING`-read-gated; no new model/migration/fingerprint/lineage/RBAC — code-only). **Offer-memo generation** (final DoD item — a Documents-owned GENERATED artifact from a LOCKED scenario: deterministic self-contained HTML, immutable canonical snapshot + SHA-256, append-only per-scenario sequence, dual `UNDERWRITING`-read + `DOCUMENT`-write RBAC, one-way Documents→Underwriting read seam, `lib/analysis.ts` untouched; additive `Document` extension; [Offer-Memo Architecture Lock](../architecture/OFFER_MEMO_ARCHITECTURE_LOCK.md), OM-1…OM-12). Prod **22 migrations**, serving `OuE0HfLIzVy6LsKqzp3ct`. [Architecture Lock](../architecture/UNDERWRITING_ARCHITECTURE_LOCK.md) (UW-1…UW-9, DS-1…DS-4, IS-1…IS-3, CF-1…CF-5, EX-1…EX-6, SE-1…SE-7, FR-1…FR-6, AP-1…AP-6) + [Calculation Principles](../architecture/UNDERWRITING_CALCULATION_PRINCIPLES.md) (11 principles) + [Offer-Memo Lock](../architecture/OFFER_MEMO_ARCHITECTURE_LOCK.md) (OM-1…OM-12). **Version 1.3 is feature-complete;** LOI + PDF deferred to later sibling slices.) |
| Commercial Intelligence (Owner/Property/Market/Portfolio) | 🟢 Good | 1.2 | 62% (**Slice 1 LIVE in production** — Owner foundation/UI/linking/candidate review/refresh/merge. **Slice 2 Property Intelligence now fully LIVE** — 2a+2b (Property on the *shared* `Observation→Signal→Projection` spine + provenance UI/refresh, generalized `FieldProvenanceCard`), **2c-i** (derived deterministic fingerprinted `PropertyIdentity` index + immutable crosswalk), **2c-ii** (the Resolution engine — pure deterministic classifier + guarded resolve-before-create + append-only `PropertyResolution` audit/reversal + `PropertyMatchDecision` candidate store), and **2c-iii — the review/resolution UI, DEPLOYED**: candidate review queue + resolution/identity detail (evidence, provenance, basis, competing candidates, audit history, reversal), `PROPERTY_IDENTITY`-governed. Redeploy flipped the serving build **`4A-bszK-FtpZr-w48yTP_` → `8vRFYwF-JHfHalfXSAoSy`**, making the whole 2c stack live and **closing [D14](./TECHNICAL_DEBT.md)**. Prod at **13 migrations**; [D5](./TECHNICAL_DEBT.md)/[D13](./TECHNICAL_DEBT.md)/[D14](./TECHNICAL_DEBT.md) resolved. [Slice 1 acceptance](../releases/V1_2_SLICE_1_ACCEPTANCE.md). Deferred (gated): external sources, geocoding, structural Property merge, fuzzy/AI/scoring.) |
| Closing Center | 🔴 Planned | 1.4 | 0% |
| Automation & Campaigns | 🔴 Planned | 2.0 | 0% |
| AI Layer | 🔴 Planned | 2.0 | 0% |

¹ Backup/restore tooling is complete in code and documentation (six-stage pipeline, verified restore drill). Two **operational** follow-ups remain and are intentionally outside the codebase: provisioning the Cloudflare R2 bucket + credentials, and enabling the documented cron schedule. Until both are done, runs report 5/6 (off-site mirror pending).

## Release progress

| Version | Theme | Status |
|---|---|---|
| 1.0 | Foundation | ✅ Shipped |
| 1.1 | Operational Excellence | ✅ **Released — `v1.1.0`** (frozen on `release/1.1`). Testing/CI/lists + D4 backups + permissions Slices 1–2 + member lifecycle + invitation resend + org settings + email 3d-i/3d-ii + unit-test PQ-1 + lint-CI PQ-2 + perf PQ-3/PQ-4 all shipped — board p95 ~109→~43 ms; every path within budget. Password reset (3e) + relation search moved to 1.2. |
| 1.2 | Commercial Intelligence | 🟢 In progress — architecture locked ([Volume 12](./COMMERCIAL_INTELLIGENCE_ARCHITECTURE.md)); **Slice 1 LIVE** (1a…1d-3b; [acceptance](../releases/V1_2_SLICE_1_ACCEPTANCE.md)). **Slice 2 (Property Intelligence) fully LIVE** — 2a+2b (shared spine + provenance UI/refresh), **2c-i** (derived `PropertyIdentity` index + crosswalk), **2c-ii** (Resolution engine: deterministic classifier + guarded resolve-before-create + append-only audit/reversal + candidate store), **2c-iii** (review/resolution UI — candidate queue + identity detail, `PROPERTY_IDENTITY`-governed) **DEPLOYED**, serving **`8vRFYwF-JHfHalfXSAoSy`**, prod **13 migrations**, **D14 closed**; formally closed — [Slice 2 acceptance](../releases/V1_2_SLICE_2_ACCEPTANCE.md), tag `v1.2.0-slice.2`. Deferred (gated): external sources, geocoding, structural merge, fuzzy/AI/scoring. |
| 1.3 | Commercial Underwriting | ✅ **Released — `v1.3.0`** (accepted 2026-07-15, frozen on `release/1.3`; [V1.3 Acceptance](../releases/V1_3_ACCEPTANCE.md) · [Release Note](../releases/V1_3_RELEASE_NOTE.md)) — architecture locked ([Underwriting Architecture Lock](../architecture/UNDERWRITING_ARCHITECTURE_LOCK.md), UW-1…UW-9, DS-1…DS-4, IS-1…IS-3) + [Calculation Principles](../architecture/UNDERWRITING_CALCULATION_PRINCIPLES.md) + [Offer-Memo Lock](../architecture/OFFER_MEMO_ARCHITECTURE_LOCK.md) (OM-1…OM-12). **3a LIVE** (Underwriting Model Formalization — canonical ownership model, `scenarioVersion`, ScenarioSeed snapshot, rebuildable ScenarioResult, `UNDERWRITING` RBAC; `lib/analysis.ts` unchanged). **3b-i LIVE** (deterministic debt sizing — pure sibling `debt-sizing.ts`, LTV/LTC/DSCR → binding constraint, lineage v2). **3b-ii LIVE** (income/expense schedules — pure sibling `schedule.ts`, line items → effective NOI, override scalar per kind / scalar fallback, lineage v3). **3b-iii LIVE** (financing cases + multi-year cash flow — `FinancingCase` owns capital + cash flow, `ScenarioResult` operating-only, pure `cash-flow.ts`/`financing.ts`, lineage v4, CF-1…CF-5). **3b-iv LIVE** (exit valuation + basic equity waterfall — pure `exit.ts`, terminal value + amortized payoff + equity multiple + levered IRR, single-holder waterfall, lineage v5, EX-1…EX-6). **3b-v LIVE** (sensitivity matrices — per-`FinancingCase` `SensitivityAnalysis`/`SensitivityCell` as a pure CONSUMER, deterministic evenly-spaced axes ≤11/axis + ≤121 cells, in-memory re-derivation with overrides never persisted, exact-only baseline marking, pure `sensitivity.ts`, lineage v6, SE-1…SE-7). **3b-vi LIVE** (findings/risks + suggested recommendation — pure `findings.ts` fixed versioned ruleset over settled outputs → `ScenarioFinding`s + advisory `ScenarioRecommendation`; the R-A fingerprint separation moves `RULESET_VERSION` out of every metric fingerprint into a dedicated `findingsVersion` (ruleset 1→2), so a rules change never invalidates a metric; FR-1…FR-6). **3d LIVE** (decided recommendation + `UNDERWRITING_APPROVAL` — terminal, append-only, immutable `UnderwritingDecision` on a LOCKED scenario against an immutable snapshot; outside the engine, never a calc input, no lineage/fingerprint; new RBAC resource separate from authoring; AP-1…AP-6). **3e LIVE** (scenario comparison — a read-only side-by-side of every Scenario version at `/analyzer/[opportunityId]/compare`, a pure consumer honoring Calculation Principle 5: metrics + primary financing case + suggested recommendation + current decision read per version from its own persisted results, so a later version never alters a prior version's metrics; `UNDERWRITING`-read-gated; no new model/migration/fingerprint/lineage/RBAC — code-only). Prod **21 migrations**, serving `-UDpzvinJSPXahRVzUmsL`. **Offer-memo generation** (final 1.3 DoD item) is **✅ LIVE** — a Documents-owned generated artifact from a LOCKED scenario (deterministic self-contained HTML, immutable canonical snapshot + SHA-256, append-only, dual `UNDERWRITING`-read + `DOCUMENT`-write RBAC; additive `Document` extension, prod **22 migrations**, serving `OuE0HfLIzVy6LsKqzp3ct`; [Offer-Memo Architecture Lock](../architecture/OFFER_MEMO_ARCHITECTURE_LOCK.md), OM-1…OM-12; `lib/analysis.ts` untouched). **Version 1.3 is feature-complete.** Deferred: LOI export + PDF (Documents), `DealAnalysis` removal ([D15](./TECHNICAL_DEBT.md)). |
| 1.4 | Closing Center | 🔴 Planned |
| 2.0 | Automation & AI | 🔴 Planned |

## Development workflow (every feature)

```
Roadmap → Architecture → Specification → Implementation → Testing → Documentation → Merge → Release
```
Nothing skips a step. See the [EMP lifecycle](./ENGINEERING_MASTER_PLAN.md#development-lifecycle).

## Top priorities right now
1. **Version 1.2 — Commercial Intelligence (building the data pipeline):** architecture is locked ([Volume 12](./COMMERCIAL_INTELLIGENCE_ARCHITECTURE.md)); the headless foundation (identity 1a/1a-2 → `Observation → Signal → Projection` 1b → ingestion 1c) is shipped and deployed, and **Commit 1d-1 now makes it visible and usable**: the core Owner UI (nav, list with search, detail with per-field provenance shown Projected Value → Winning Signal → Signal History, create with duplicate warning, edit + override pins) built as a thin *consumer* — every mutation flows through the domain services, and the `OWNER` permission policy is enforced at its first call-sites. **Commit 1d-2a adds Seller/Property↔Owner linking** (link, atomic move A→B, unlink) — kept strictly separate from canonical identity (it edits only the operational FK, writing no Observation/Signal), plus a reusable open-redirect guard. Next: **1d-2b** — a standalone candidate-review queue (confirm/dismiss owner duplicates; candidate ≠ merge); then **1d-3** — refresh trigger/history + merge/unmerge controls.
2. **Carried into 1.2:** **password reset (Slice 3e)** on the messaging platform (closes D10), and **relation search** (Better Lists enrichment). Both reuse 1.1 platforms and are independent of the intelligence work.

*(Version 1.1 is released — `v1.1.0`, frozen on `release/1.1`. PQ-1/PQ-2/PQ-3/PQ-4 complete; CI runs Typecheck → Lint → Unit → E2E → Build as distinct blocking steps.)*

*(Invitation email delivery 3d-ii, email infrastructure 3d-i, org settings 3c, invitation resend 3b, member lifecycle 3a, and permissions Slices 1–2 are complete.)*

**Deferred from the email work (operational / later):** schedule the outbox drain (cron) for drainable kinds; bounce/complaint webhooks + an admin failed-send view; Resend/API transport.

**Operational follow-ups (not engineering code — see [Operations → Backups](./OPERATIONS_ROADMAP.md)):** provision Cloudflare R2 bucket/credentials, store the backup passphrase off-host, and enable the documented cron schedule. (D4 backup/restore tooling itself is ✅ complete.)

## How to update this dashboard
- Change a module's Status/% when its roadmap scope moves (same PR as the change).
- Keep this table and [Module Roadmaps](./MODULE_ROADMAPS.md) consistent — they must never disagree.
- Re-review the whole table at the start of each release.

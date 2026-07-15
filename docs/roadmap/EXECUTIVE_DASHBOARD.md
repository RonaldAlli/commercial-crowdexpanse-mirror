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
| Deal Analyzer / Underwriting | 🟡 Partial | 1.3 | 58% (**3a + 3b-i + 3b-ii LIVE** — 3a: canonical deterministic ownership model `Underwriting → Scenario → Assumption → ScenarioResult` (model lineage + `scenarioVersion` fingerprint, one-way ScenarioSeed snapshot, rebuildable ScenarioResult, behavior-preserving analyzer repoint; `lib/analysis.ts` unchanged). **3b-i: deterministic debt sizing** (pure sibling module — LTV/LTC/DSCR → binding constraint; lineage v2; DS-1/DS-2). **3b-ii: income/expense schedules** (pure sibling `schedule.ts` — line items roll up independently to effective NOI, override scalar per kind, scalar fallback when absent; lineage v3; IS-1/IS-2/IS-3). Prod **16 migrations**, serving `tJ-qMo34RYbpjWcFuqe1m`. [Architecture Lock](../architecture/UNDERWRITING_ARCHITECTURE_LOCK.md) (UW-1…UW-9, DS-1…DS-4, IS-1…IS-3) + [Calculation Principles](../architecture/UNDERWRITING_CALCULATION_PRINCIPLES.md). Remaining 3b: cash flow → exit/waterfall → sensitivity → findings/risks.) |
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
| 1.3 | Commercial Underwriting | 🟢 In progress — architecture locked ([Underwriting Architecture Lock](../architecture/UNDERWRITING_ARCHITECTURE_LOCK.md), UW-1…UW-9, DS-1…DS-4, IS-1…IS-3) + [Calculation Principles](../architecture/UNDERWRITING_CALCULATION_PRINCIPLES.md). **3a LIVE** (Underwriting Model Formalization — canonical ownership model, `scenarioVersion`, ScenarioSeed snapshot, rebuildable ScenarioResult, `UNDERWRITING` RBAC; `lib/analysis.ts` unchanged). **3b-i LIVE** (deterministic debt sizing — pure sibling `debt-sizing.ts`, LTV/LTC/DSCR → binding constraint, lineage v2). **3b-ii LIVE** (income/expense schedules — pure sibling `schedule.ts`, line items → effective NOI, override scalar per kind / scalar fallback, lineage v3). Prod **16 migrations**, serving `tJ-qMo34RYbpjWcFuqe1m`. Remaining 3b (sequenced): cash flow (3b-iii) → exit/waterfall (3b-iv) → sensitivity (3b-v) → findings/risks + recommendation (3b-vi). Deferred: decided recommendation (3d), reports, `DealAnalysis` removal ([D15](./TECHNICAL_DEBT.md)). |
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

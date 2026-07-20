# CrowdExpanse Commercial — Platform Architecture Index

> **The single entry point** to the platform's roadmap, architecture, accepted decisions, technical
> debt, restoration status, and current production state. Start here. Documentation-only navigation
> hub — created 2026-07-18 (roadmap-restoration). Links are relative to `docs/`.

---

## 0. Current production state

**→ [CURRENT_PLATFORM_STATUS.md](./CURRENT_PLATFORM_STATUS.md)** is the **single operational
current-state surface** (commit, build, migration count, automation/process state, restoration
status — with an "as of" timestamp). This index deliberately does **not** duplicate those volatile
values; it is **stable navigation + architecture references** only. The [Canonical Platform
Roadmap](./roadmap/CANONICAL_PLATFORM_ROADMAP.md) holds the stable roadmap chronology; per-version
operational figures link back to the current-status doc to avoid re-creating documentation drift.

---

## 0b. Baselines — the three permanent references
| Baseline | Answers |
|---|---|
| [Product Baseline](./roadmap/PRODUCT_BASELINE.md) | **What** the application does (accepted capabilities + invariants) |
| [Operations Baseline](./roadmap/OPERATIONS_BASELINE.md) | **How** production normally behaves (PM2/memory/health/deploy) |
| [Engineering Baseline](./roadmap/ENGINEERING_BASELINE.md) | **How** changes ship (the release lifecycle + disciplines) |

## 1. Roadmap & status

| Doc | Purpose |
|---|---|
| [Canonical Platform Roadmap](./roadmap/CANONICAL_PLATFORM_ROADMAP.md) | **Authoritative** chronology + status + frozen baselines |
| [Executive Dashboard](./roadmap/EXECUTIVE_DASHBOARD.md) | Module scope-complete snapshot |
| [Engineering Master Plan](./roadmap/ENGINEERING_MASTER_PLAN.md) | Lifecycle, global DoD, authorization principles |
| [Release Plan](./roadmap/RELEASE_PLAN.md) | Release sequence + status |
| [Module Roadmaps](./roadmap/MODULE_ROADMAPS.md) · [Feature Dependencies](./roadmap/FEATURE_DEPENDENCIES.md) | Per-module + dependency graph |
| [Version 1.1](./roadmap/VERSION_1_1.md) · [1.2](./roadmap/VERSION_1_2.md) · [1.3](./roadmap/VERSION_1_3.md) · [1.4](./roadmap/VERSION_1_4.md) · [2.0](./roadmap/VERSION_2_0.md) | Per-version plans |
| [Technical Debt](./roadmap/TECHNICAL_DEBT.md) | **D1–D23** register (incl. open D19/D15/D4) |
| [Testing Roadmap](./roadmap/TESTING_ROADMAP.md) · [Performance](./roadmap/PERFORMANCE.md) · [Operations](./roadmap/OPERATIONS_ROADMAP.md) · [AI Roadmap](./roadmap/AI_ROADMAP.md) | Cross-cutting |

## 2. Architecture — locks, decisions, source of truth

| Doc | Domain |
|---|---|
| [Platform Architecture Map](./architecture/PLATFORM_ARCHITECTURE_MAP.md) | Whole-platform map |
| [**Source-of-Truth Matrix**](./architecture/PLATFORM_SOURCE_OF_TRUTH_MATRIX.md) | One authoritative owner per concept |
| [Commercial Intelligence Architecture](./roadmap/COMMERCIAL_INTELLIGENCE_ARCHITECTURE.md) · [Property Identity Lock](./architecture/PROPERTY_IDENTITY_LOCK.md) | V1.2 Owner/Property identity |
| [Underwriting Architecture Lock](./architecture/UNDERWRITING_ARCHITECTURE_LOCK.md) · [Calculation Principles](./architecture/UNDERWRITING_CALCULATION_PRINCIPLES.md) · [Offer-Memo Lock](./architecture/OFFER_MEMO_ARCHITECTURE_LOCK.md) | **V1.3 (frozen)** |
| [Closing Center Architecture Lock](./architecture/CLOSING_CENTER_ARCHITECTURE_LOCK.md) + [Dashboard](./architecture/TRANSACTION_DASHBOARD_DECISION_PACKAGE.md)/[Timeline](./architecture/TRANSACTION_TIMELINE_DECISION_PACKAGE.md)/[Badges](./architecture/OPPORTUNITY_LIST_BADGES_DECISION_PACKAGE.md) packages | **V1.4 (frozen)** |
| [Automation Architecture Lock](./architecture/AUTOMATION_ARCHITECTURE_LOCK.md) (AU-1…AU-13) + [Discovery](./architecture/VERSION_2_0_DISCOVERY.md)/[Decision Package](./architecture/VERSION_2_0_DECISION_PACKAGE.md) | **V2.0 (ratified)** |
| [CRM Operations Boundary](./architecture/CRM_OPERATIONS_BOUNDARY.md) | **CRM (off-roadmap, accepted)** |
| [ADR-0001…0005](./architecture/adr/) (automation) · [ADR-0006](./architecture/adr/ADR-0006-CRM-IMPORT-FILE-PARSER.md) (CSV-only import) | Decision records |
| [Engineering Playbook](./architecture/ENGINEERING_PLAYBOOK.md) · [Human-Review Principles](./architecture/HUMAN_REVIEW_PRINCIPLES.md) | Practice |

## 3. Releases & acceptance records

| Version / Item | Acceptance | Notes |
|---|---|---|
| V1.2 Slice 1 / Slice 2 | [S1](./releases/V1_2_SLICE_1_ACCEPTANCE.md) · [S2](./releases/V1_2_SLICE_2_ACCEPTANCE.md) | Owner + Property identity |
| **V1.3 Underwriting** | [Acceptance](./releases/V1_3_ACCEPTANCE.md) · [Release Note](./releases/V1_3_RELEASE_NOTE.md) | Frozen `v1.3.0` |
| **V1.4 Closing Center** | [Acceptance](./releases/V1_4_ACCEPTANCE.md) · [Release Note](./releases/V1_4_RELEASE_NOTE.md) | Frozen `v1.4.0` |
| V2.0.1 Automation Foundation | [Impl Acceptance](./releases/V2_0_1_IMPLEMENTATION_ACCEPTANCE.md) · [Traceability](./releases/V2_0_1_ARCHITECTURE_TRACEABILITY.md) · [Stabilization Audit](./releases/V2_0_1_STABILIZATION_AUDIT.md) · [Decision Pkg](./releases/V2_0_1_STABILITY_DECISION_PACKAGE.md) · [Change Inventory](./releases/V2_0_1_CHANGE_INVENTORY.md) | Accepted, **executor paused** |
| Phase 2.0.1 build plans | [Impl Plan](./architecture/VERSION_2_0_PHASE_2_0_1_IMPLEMENTATION_PLAN.md) · [Schema](./architecture/VERSION_2_0_PHASE_2_0_1_SCHEMA_PROPOSAL.md) · [Acceptance Criteria](./architecture/VERSION_2_0_PHASE_2_0_1_ACCEPTANCE_CRITERIA.md) · [Test Plan](./architecture/VERSION_2_0_PHASE_2_0_1_TEST_PLAN.md) · [Rollout](./architecture/VERSION_2_0_PHASE_2_0_1_ROLLOUT_PLAN.md) · [Runbook](./architecture/VERSION_2_0_PHASE_2_0_1_RUNBOOK.md) | — |
| **CRM reconciliation** | [Reconciliation Acceptance](./releases/CRM_PRODUCTION_RECONCILIATION_ACCEPTANCE.md) · [Production Acceptance](./releases/CRM_PRODUCTION_RECONCILIATION_PRODUCTION_ACCEPTANCE.md) | Deployed + accepted 2026-07-18 |

## 4. Platform restoration (in progress — `stabilize/roadmap-restoration`)

> **"Where are we?"** → [Restoration Progress Matrix](./PLATFORM_RESTORATION_PROGRESS.md) (Wave ·
> Purpose · Status · Founder review · Merge · Deploy).

| Doc | Role |
|---|---|
| [Canonical Roadmap](./roadmap/CANONICAL_PLATFORM_ROADMAP.md) | Rebuilt roadmap (Discovery) |
| [Roadmap→Code Traceability](./releases/ROADMAP_IMPLEMENTATION_TRACEABILITY.md) | Milestone → code/tests |
| [Defect Register](./releases/PLATFORM_STABILIZATION_DEFECT_REGISTER.md) | All findings (no Critical/High) |
| [Off-Roadmap Assessment](./releases/OFF_ROADMAP_FEATURE_ASSESSMENT.md) | Contacts/Outreach/Diligence/Import/ATM |
| [Source-of-Truth Matrix](./architecture/PLATFORM_SOURCE_OF_TRUTH_MATRIX.md) | No competing SoT |
| [Restoration Plan](./releases/PLATFORM_ROADMAP_RESTORATION_PLAN.md) | 7-wave sequence + status |
| [**Wave 1 Acceptance**](./releases/PLATFORM_RESTORATION_WAVE_1_ACCEPTANCE.md) | ✅ Security / isolation / integrity |
| [**Wave 4 Acceptance**](./releases/PLATFORM_RESTORATION_WAVE_4_ACCEPTANCE.md) | ✅ Docs / nav / UI integration |

**Restoration status:** Discovery ✅ · Wave 1 ✅ · Wave 4 ✅ · **Waves 2, 3, 5, 6, 7 not started**
(await Founder authorization). Automation stays paused; D19 stays open until after Wave 7 acceptance.

## 5. Standing tests & tooling

- **Unit** `tests/unit/**` (node:test + tsx; CRITICAL ≥90% branch / overall ≥80% via
  `scripts/run-unit-tests.mjs`) · **E2E** `scripts/e2e-*.mjs` (throwaway-org, `assertTestDatabase`) run
  by `scripts/e2e-all.mjs` · **read-only audit** `scripts/audit/crm-integrity.mjs` · **predeploy
  ownership guard** `scripts/predeploy-check.mjs` + `scripts/lib/ownership-guard.mjs` (D5/D23).
- **Test-layering direction (Wave 5+):** as CRM behavior stabilizes, separate assertions into
  **unit** (services/pure logic) → **integration** (domain boundaries: CRM↔Closing, CRM↔Underwriting)
  → **E2E** (complete user workflows), keeping E2E focused on user behavior.

---

## 6. How to use this index

- **"What is the current state?"** → §0 + the [Canonical Roadmap](./roadmap/CANONICAL_PLATFORM_ROADMAP.md).
- **"Can I change X?"** → the relevant **architecture lock** (§2) + the [Source-of-Truth
  Matrix](./architecture/PLATFORM_SOURCE_OF_TRUTH_MATRIX.md); frozen V1.3/V1.4 modules must stay byte-unchanged.
- **"What's broken / owed?"** → [Defect Register](./releases/PLATFORM_STABILIZATION_DEFECT_REGISTER.md)
  + [Technical Debt](./roadmap/TECHNICAL_DEBT.md).
- **"Is automation live?"** → No — accepted but paused; [V2.0.1 Impl Acceptance](./releases/V2_0_1_IMPLEMENTATION_ACCEPTANCE.md), D19 open.
- **"Where's the restoration up to?"** → §4.

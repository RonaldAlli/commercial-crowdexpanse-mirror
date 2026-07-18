# CrowdExpanse Commercial — Canonical Platform Roadmap

> **Status: PENDING FOUNDER REVIEW.** Read-only reconstruction (2026-07-18) of the accepted
> roadmap from the beginning of the Commercial platform, reconciled against actual code,
> migrations, git tags, and production. Part of the Platform Roadmap Restoration program.
> Companion: [Roadmap↔Code Traceability](../releases/ROADMAP_IMPLEMENTATION_TRACEABILITY.md) ·
> [Defect Register](../releases/PLATFORM_STABILIZATION_DEFECT_REGISTER.md) · [Source-of-Truth
> Matrix](../architecture/PLATFORM_SOURCE_OF_TRUTH_MATRIX.md) · [Off-Roadmap
> Assessment](../releases/OFF_ROADMAP_FEATURE_ASSESSMENT.md) · [Restoration
> Plan](../releases/PLATFORM_ROADMAP_RESTORATION_PLAN.md).
>
> **Authoritative:** the roadmap + accepted architecture. Production behavior is evidence of what
> exists, not proof it is correct. This document reconstructs the *intended and accepted* sequence
> and marks each item's real status against code/prod.

---

## 1. Chronological roadmap

| Seq | Version / Phase | Intended capability | Accepted architecture | Acceptance evidence | Real status (code/prod) |
|---|---|---|---|---|---|
| 1 | **1.0 Foundation** | Auth, multi-tenancy, core records (Seller/Buyer/Property/Opportunity), pipeline, buyer matching | pre-roadmap-doc era | tag `v1.0.0` · 2026-07-09 | **Frozen/shipped** — migration `0_init` |
| 2 | **1.1 Operational Excellence** | Testing/CI, lists, RBAC, team lifecycle, invitations, org settings, email outbox, perf | `VERSION_1_1.md` | `release/1.1` · 2026-07-14 | **Released/frozen** — migrations 2–4 |
| 3 | **1.2 Slice 1 — Owner Intelligence** | Owner entity on Observation→Signal→Projection spine; linking/candidates/refresh/merge | `COMMERCIAL_INTELLIGENCE_ARCHITECTURE.md` | `v1.2.0-slice.1` · 2026-07-15 | **Accepted/deployed** — migr 5–10 |
| 4 | **1.2 Slice 2 — Property Identity** | Property on the shared spine; derived PropertyIdentity index + crosswalk + resolution + review UI | `PROPERTY_IDENTITY_LOCK.md` | `v1.2.0-slice.2` · 2026-07-15 | **Accepted/deployed** — migr 11–13 |
| — | **1.2 remainder** | External sources, geocoding, structural merge, fuzzy/AI scoring | (gated) | — | **DEFERRED** (1.2 never wholly released; only Slices 1–2) |
| 5 | **1.3 Commercial Underwriting** | Deterministic engine: scenarios → assumptions → results → debt/schedules/cash-flow/exit/sensitivity → findings → decided recommendation + `UNDERWRITING_APPROVAL` → comparison → Offer Memo | `UNDERWRITING_ARCHITECTURE_LOCK.md`, `OFFER_MEMO_ARCHITECTURE_LOCK.md` | tag `v1.3.0` = `release/1.3` · 2026-07-15 | **Accepted · released · FROZEN** — migr 14–22 |
| 6 | **1.4 Closing Center** | Checklist-gated `UNDER_CONTRACT→PAID` human workflow: DueDiligence + composed PAID gate → Escrow → Financing → Assignments → Dashboard → Timeline → List badges | `CLOSING_CENTER_ARCHITECTURE_LOCK.md`, `PLATFORM_ARCHITECTURE_MAP.md` | tag `v1.4.0` = `release/1.4` · 2026-07-16 | **Accepted · released · FROZEN** — migr 23–26 |
| 7 | **2.0 Automation & AI (architecture)** | Bounded automation + AI domain (deterministic-first) | `AUTOMATION_ARCHITECTURE_LOCK.md` (A1–A8, AU-1…AU-13) | Founder ratified 2026-07-16 (`6ab5e09`) — **design only** | **Planned** (ratified) |
| 8 | **2.0.1 Automation Foundation** | Org-scoped DB job spine (schedule→queue→policy→immutable execution ledger→retry/dead-letter/recovery) + one read-only proof job | `VERSION_2_0_PHASE_2_0_1_*` + ADR-0001…0005 | `V2_0_1_IMPLEMENTATION_ACCEPTANCE.md` · 2026-07-16 | **Accepted (impl) · migration 27 in prod · EXECUTOR NEVER STARTED (paused; D19 open)** — migr 27 |
| 9 | **CRM Operations (OFF-ROADMAP)** | Owner Contacts, Seller/Contact Outreach, Opportunity pre-contract Diligence, DealAutomator lead import, ATM Wholesale calculator | `CRM_OPERATIONS_BOUNDARY.md`, ADR-0006 (retroactive) | `CRM_..._PRODUCTION_ACCEPTANCE.md` · 2026-07-18 | **Deployed · Founder-accepted 2026-07-18 · NOT on the original roadmap** (built in prod concurrently, reconciled after) — migr 28–30 |
| 10 | **2.0.2+** | Event-driven outbox triggering, reminders, communications, conversation intelligence, AI assist | each separately ratified | — | **Planned / not authorized** |

**Migration ladder:** 1.2→13 · 1.3→22 · 1.4→**26 (frozen baseline)** · Automation→27 · CRM→**30 (current prod)**.

---

## 2. Frozen baselines (authoritative anchors)

| Baseline | Annotated tag object | Peeled commit (= release branch) |
|---|---|---|
| **v1.3.0** | `bca39f4` | `d341c0a` (= `release/1.3`) |
| **v1.4.0** | `c1133ad` | `ece38aa` (= `release/1.4`) |

> **Citation note (not a defect):** acceptance docs cite the **annotated-tag object** SHAs
> (`bca39f4`/`c1133ad`); the release branches point to the **peeled commits** (`d341c0a`/`ece38aa`).
> Both are correct — `git rev-parse v1.3.0^{}` = `d341c0a`. Earlier tags: `v1.0.0`, `release/1.1`,
> `v1.2.0-slice.1/2` (slice-level acceptances). No frozen ref has moved.

**Verified intact at current `main` (`ba1bd7c`):** `lib/analysis.ts`, `lib/underwriting/*`,
`lib/documents/offer-memo.ts`, `lib/closing.ts`, `lib/escrow.ts`, `lib/financing.ts`,
`lib/assignment.ts`, `lib/transaction-dashboard.ts`, `lib/transaction-timeline.ts` are **byte-identical
to `v1.4.0`**. `lib/permissions.ts` changed **additively only** (the accepted `AUTOMATION` resource).

---

## 3. Locked architectural invariants (per version)

- **V1.3 Underwriting:** deterministic one-way stack of pure sibling modules around an **unchanged
  `lib/analysis.ts` kernel**; every derived surface is a rebuildable, content-idempotent function of
  one Scenario's frozen assumptions + lineage/fingerprint; **engine suggests, humans decide** — the
  terminal `UnderwritingDecision` is append-only, outside the engine, never a calc input, with a
  **separate `UNDERWRITING_APPROVAL` RBAC** (separation of duties); a later Scenario version never
  alters a prior version's metrics.
- **V1.4 Closing:** a human workflow **outside** the deterministic engine; the **PAID gate is
  composed** (`isClosingReady()` AND `canMoveStage()`) — never replaced or bypassed; each terminal
  domain (Escrow/Financing/Assignment) captures an **immutable append-only snapshot + record-freeze**;
  the read model is **pure projections** (TX-4 composition / TX-6 reuse), no cached readiness.
- **V2.0.1 Automation:** *"Automation owns no authoritative business truth"* — orchestration only;
  org-scoped; two-model job + **immutable `AutomationExecution` ledger**; a **mandatory policy gate
  precedes every `perform()`**; acts as the **Automation Principal** (never a user);
  `producedDomainEffect=false` for every 2.0.1 run; inert until the kill-switch enables it.
- **CRM Operations Boundary:** **sourcing-side operational tooling** that reads existing projections
  and adds additive records; never owns/redefines Owner/Seller/Opportunity/underwriting/closing
  truth; never moves stage, composes/bypasses the PAID gate, or feeds underwriting; pre-contract
  diligence ≠ post-contract Closing checklist; imports org-scoped, fail-closed, CSV-only (ADR-0006).

---

## 4. Deferred / Superseded / Off-roadmap

**Deferred (tracked, non-blocking):** 1.2 remainder (external sources, geocoding, structural merge,
AI scoring) · 1.3 (LOI/PDF export, refinance/tax modeling, waterfalls, AI narrative, e-sign) · **D15**
(deprecated `DealAnalysis` removal — still present) · **D4** (off-host R2 backup + cron) · 1.4 reserved
(Board badges LB-7; ActivityLog composite index TX-A/TL-9/LB-8 — benchmark-gated) · **D17** (2.0.1
deferrals: outbox trigger→2.0.2, per-org cap + running-job cancel, DB-configurable policies) · D3/D6/D10/D16 ·
**D19** (automation runtime launch blocker — gates the dark start).

**Superseded:** ad-hoc Opportunity Activity card → Timeline (TX-0); 2.0.1 SheetJS `xlsx` parser →
removed by ADR-0006 (CSV-only); TX-5 Projection Version reserved-only.

**Added outside the roadmap (CRM):** Owner Contacts (`OwnerContact`/`ContactTouch`), Seller/Contact
outreach fields, Opportunity Diligence (`OpportunityDiligenceItem`), DealAutomator lead import, ATM
Wholesale calculator — migrations 28–30 + tooling. Built in prod concurrently (D18), reconciled into
Git and governed by `CRM_OPERATIONS_BOUNDARY.md` + ADR-0006, Founder-accepted 2026-07-18. Live data:
owner_contacts 6,897 · diligence_items 24.

---

## 5. Known documentation drift (see Defect Register D-DOC-*)

The forward-facing roadmap surface lags the release/CRM records and should be reconciled:
1. `VERSION_2_0.md` / `EXECUTIVE_DASHBOARD.md` still state **"prod at 26 migrations / automation not
   applied"** — true at 2.0.1 *implementation acceptance*, but migration 27 was later applied to prod
   (paused at dark-start) and CRM added 28–30 → **prod is at 30**.
2. `RELEASE_PLAN.md` still marks **1.4 "Planned"** — contradicts `V1_4_ACCEPTANCE.md` (frozen).
3. The **CRM feature set is absent from the roadmap volumes** — it exists only in `releases/` +
   `architecture/`, so the canonical roadmap surface omits a live, accepted, in-production layer.
4. `EXECUTIVE_DASHBOARD.md` "last reviewed 2026-07-16" predates the 2.0.1 prod migration + the CRM
   reconciliation; `MODULE_ROADMAPS.md` similarly lags.
5. **1.2 has no whole-version acceptance** — only Slices 1–2 were accepted/tagged; the version is
   permanently partial by design.

These are **documentation defects only** — no functional, security, or data regression underlies them.

---

## 6. Bottom line

The accepted roadmap (V1.0 → V1.4) is **frozen and intact in current `main`**; V2.0.1 Automation is
**accepted-but-paused** (executor never started, D19 open); the CRM layer is **off-roadmap but
Founder-accepted, additive, and cleanly isolated** from the frozen domains. The corrective work is
**documentation reconciliation + already-tracked debt**, not repair of broken behavior. Details:
[Defect Register](../releases/PLATFORM_STABILIZATION_DEFECT_REGISTER.md).

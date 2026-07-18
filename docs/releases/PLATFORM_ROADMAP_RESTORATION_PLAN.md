# Platform Roadmap Restoration Plan

> **Status: PENDING FOUNDER REVIEW.** The stabilization/repair sequence derived from the
> roadmap-restoration discovery (2026-07-18). Companion to the [Defect
> Register](./PLATFORM_STABILIZATION_DEFECT_REGISTER.md), [Canonical
> Roadmap](../roadmap/CANONICAL_PLATFORM_ROADMAP.md), [Source-of-Truth
> Matrix](../architecture/PLATFORM_SOURCE_OF_TRUTH_MATRIX.md), and [Off-Roadmap
> Assessment](./OFF_ROADMAP_FEATURE_ASSESSMENT.md).

---

## 0. Framing (what the discovery changed)

The discovery found the accepted platform **healthier than the worst case assumed**:
- **No Priority-1 security or data-integrity defect** (prod data clean; org-scoping holds).
- **Underwriting (V1.3) and Closing (V1.4) are byte-intact and un-regressed** — no restoration of
  damaged code is required.
- The off-roadmap CRM features are **additive, isolated, and boundary-compliant** — no reversal or
  re-architecture is required.

Therefore the "restoration" is **narrow**: documentation reconciliation, an off-roadmap **test-coverage**
backfill, and source-of-truth documentation — **not** repair of broken workflows. No fixes were made
in the discovery phase (none is an active Critical production defect). Each wave below is proposed for
**Founder review before execution**; all work stays in the isolated worktree with **no production
deployment** until reviewed.

---

## 1. Development discipline (binding for every wave)

- Work only in `stabilize/roadmap-restoration` (worktree `/opt/crowdexpanse/wt-roadmap`) with its
  **own `node_modules`** (not symlinked), own generated Prisma client, and a dedicated test DB at 30
  migrations. **No development in the production checkout.**
- **No root-run commands** (D5/D23); the predeploy ownership guard is active.
- **No deploy, no migration** applied to prod during repair; push branch + acceptance package, stop
  for review.
- **Automation stays paused; D19 stays open and is NOT fixed here.**

---

## 2. Wave sequence & acceptance gates

Each wave stops for Founder review with: defect list · files changed · architecture impact · schema
impact · test evidence · regression evidence · production risk · rollback plan.

### Wave 1 — Security & organization isolation · ✅ **DONE (2026-07-18) — PENDING FOUNDER REVIEW**
- **Scope:** regression lock — added `scripts/e2e-crm-isolation.mjs` (14 assertions: org-isolation +
  diligence↔Closing boundary), a reusable read-only `scripts/audit/crm-integrity.mjs`, and resolved the
  outreach-grain source of truth (`CRM_OPERATIONS_BOUNDARY.md §2a`). Gate green (unit 58, E2E 40,
  build ok, integrity clean test+prod). No app/schema/migration change. See
  [Wave 1 Acceptance](./PLATFORM_RESTORATION_WAVE_1_ACCEPTANCE.md).
- **Migration:** no. **Risk:** none (tests + docs only).

### Wave 2 — Underwriting integrity · ✅ **DONE (2026-07-18) — PENDING FOUNDER REVIEW**
> All 14 V1.3 modules byte-identical to v1.4.0; 145 underwriting unit tests + e2e-underwriting (166 assertions) pass; guarantees (determinism/lineage/decision/comparison/offer-memo) intact; no defect. See [Wave 2 Acceptance](./PLATFORM_RESTORATION_WAVE_2_ACCEPTANCE.md).

- **Scope:** verify-only. Re-run the underwriting unit + E2E gate on the branch and record it as
  evidence. **No code change** — V1.3 is byte-intact. **Migration:** no.

### Wave 3 — Closing integrity · ✅ **DONE (2026-07-18) — PENDING FOUNDER REVIEW**
> All 13 V1.4 modules byte-identical to v1.4.0; PAID-gate action unchanged; 97 closing unit tests + 245 closing-domain e2e assertions pass; composed PAID gate + terminal snapshots + TX projections intact; diligence provably can't bypass the gate; no defect. See [Wave 3 Acceptance](./PLATFORM_RESTORATION_WAVE_3_ACCEPTANCE.md).

- **Scope:** verify-only. Re-confirm the composed PAID gate + terminal-state protections via the
  existing suite; add (optional) an assertion test that CRM diligence cannot affect Closing readiness.
  **No code change.** **Migration:** no.

### Wave 4 — Projections & UI + documentation reconciliation · ✅ **DONE (2026-07-18) — PENDING FOUNDER REVIEW**
> Doc drift corrected (RELEASE_PLAN/VERSION_2_0/EXECUTIVE_DASHBOARD), CRM integrated into the roadmap surface, navigation audited (clean/role-aware), shared projections verified (no duplication), ATM advisory banner added, diligence UI confirmed pre-contract. Gate green (unit 58, E2E 40, build). See [Wave 4 Acceptance](./PLATFORM_RESTORATION_WAVE_4_ACCEPTANCE.md).

- **Scope:** (a) confirm TX-6 reuse (verify-only); (b) **reconcile documentation drift** (D-DOC-1…5):
  update `VERSION_2_0.md`/`EXECUTIVE_DASHBOARD.md` to prod=30, fix `RELEASE_PLAN.md` (1.4 Released),
  add the CRM layer to the roadmap surface (done in the Canonical Roadmap), refresh review dates.
- **Migration:** no. **Risk:** docs only.

### Wave 5 — CRM integration (the main quality wave)
- **Scope:** add the missing **tests** for Owner Contacts, Outreach, and Diligence
  (org-isolation, CRUD/lifecycle, single-primary invariant, diligence↔Closing boundary lock);
  **document** the outreach-grain source of truth (D-CRM-OUTREACH-OWNERSHIP) in
  `CRM_OPERATIONS_BOUNDARY.md`; ratify the CRM bounded domain rules (already satisfied).
- **Migration:** **none expected.** If a test reveals a real defect, document it in the register first,
  fix narrowly, and only add a migration if a confirmed defect requires it (separately reviewed).
- **Risk:** low (tests + docs). This wave carries the most net-new value (closes the test gap).
- **Test-layering direction (Founder guidance):** split assertions into **unit** (services/pure logic) → **integration** (domain boundaries: CRM↔Closing, CRM↔Underwriting) → **E2E** (complete user workflows), keeping E2E focused on user behavior and reducing maintenance cost. The Wave 1 `e2e-crm-isolation.mjs` boundary assertions migrate toward this layering as CRM behavior is stabilized.

### Wave 6 — Import & ATM Wholesale integration
- **Scope:** confirm Lead-Import remediation coverage (already 20 tests); document ATM Wholesale as
  advisory/non-authoritative; optionally relocate the `/analyzer/atm-wholesale` route under a CRM
  group (separately-reviewed, cosmetic — **not** required). **Migration:** no.

### Wave 7 — Full platform acceptance
- **Scope:** run the complete gate (tsc, unit, E2E, isolated build, secret/dep scans, frozen-kernel +
  automation-spine unchanged verification, ownership guard, prod-safety read-only checks); produce the
  final acceptance package. **Then stop for Founder acceptance.** Only after acceptance is a controlled
  deploy of any wave's changes considered — and Automation (D19) remains a **separate** later track.

---

## 3. Explicit non-goals / prohibitions (this program)

Do **not**: resume Automation / start the executor / enable the scheduler / fix D19 / begin Phase
2.0.2 · add new CRM capabilities, imports, AI, email/SMS, or document/task automation · add a migration
unless a confirmed defect requires it (separately reviewed) · alter frozen V1.3/V1.4 refs · deploy repair
work automatically · mark any new phase accepted without Founder approval.

---

## 4. Production posture during the program

Production remains on the current healthy build (`YPHm2Nw65jWb7JlF7eLUn`, 30 migrations) throughout.
No emergency restoration is warranted — the discovery found no active Critical production defect. Any
deployment of repair waves happens only after Founder acceptance, under the accepted controlled-rollout
+ predeploy-guard procedure.

---

## 5. Estimated effort profile

| Wave | Type | Net-new code | Migration | Value |
|---|---|---|---|---|
| 1 | tests (org-isolation) | tests only | no | safety net |
| 2 | verify | none | no | evidence |
| 3 | verify (+opt. boundary test) | minimal | no | evidence |
| 4 | docs | docs only | no | reconciliation |
| 5 | **tests + docs** | tests + docs | no | **closes the real gap** |
| 6 | docs (+opt. route move) | minimal | no | clarity |
| 7 | full gate + acceptance | none | no | closeout |

The program is **low-risk and additive**: it hardens (tests) and reconciles (docs) an already-healthy
platform, rather than repairing damage.

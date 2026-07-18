# Platform Restoration — Wave 1 Acceptance (Security, Org Isolation, Data Integrity)

> **Status: PENDING FOUNDER REVIEW.** Wave 1 of the roadmap-restoration program (2026-07-18) on
> branch `stabilize/roadmap-restoration`. Wave 1 **proves and locks** the security / tenant-isolation
> / data-integrity boundaries of the off-roadmap CRM features — it adds tests, a reusable read-only
> audit, and one documentation resolution. **No application code, schema, or migration changed;
> nothing deployed; Automation stays paused (D19 untouched).**

---

## 1. Gaps addressed

- **D-CRM-TEST (Medium) — partially closed:** the off-roadmap CRM features had **no** accepted-suite
  tests. Wave 1 adds **organization-isolation + boundary** tests (the security-critical subset).
  Deeper per-feature CRUD/lifecycle unit tests remain scheduled for **Wave 5**.
- **D-CRM-OUTREACH-OWNERSHIP (Low/Medium) — RESOLVED:** the "outreach at two grains" ambiguity is
  now documented with an authoritative-owner table (`CRM_OPERATIONS_BOUNDARY.md §2a`).

## 2. Tests added

### `scripts/e2e-crm-isolation.mjs` — 14 assertions, PASS (auto-discovered by `e2e-all.mjs`)
- **Owner Contacts:** org-scoped list returns only the caller org's rows; **cross-org direct read
  fails closed** (mirrors the action's `where {id, organizationId}`); a contact cannot resolve to an
  owner in another organization.
- **Opportunity Diligence:** items materialize org-scoped; org B cannot read org A's items;
  `ensureOpportunityDiligence` is idempotent (no duplication).
- **Diligence↔Closing BOUNDARY (load-bearing):** after marking **every** diligence item `REVIEWED`,
  (a) **no `ClosingChecklist` item was created**, (b) the composed **PAID gate is still `ready:false`**
  with outstanding required Closing items — proving **diligence completion ≠ Closing readiness / PAID
  eligibility**. Also asserts diligence created **no** Escrow/Financing/Assignment/Underwriting record.
- **Automation:** confirmed inert (0 jobs / 0 executions) throughout.

### Existing coverage confirmed (no duplication)
- **Lead Import:** `tests/unit/crm/{lead-import-jobs-core,lead-import-parse}.test.ts` — **20 tests**
  (org-scoped fail-closed job metadata, cross-org denial, id-traversal, no path leakage, Excel
  rejection, size/row/column/cell limits, ADMIN-only).
- **ATM Wholesale:** `tests/unit/analysis/atm-wholesale-calculator.test.ts` — **3 tests**; the
  calculator is pure and **persists nothing** (verified: no schema model, 0 DB writes, no
  `lib/analysis.ts` import — see Off-Roadmap Assessment §5).

## 3. Reusable read-only integrity audit

`scripts/audit/crm-integrity.mjs` — packages the discovery's ad-hoc checks: **read-only**
(SELECT/count only), **requires an explicit `DATABASE_URL`** (fail-closed, exit 2), prints violation
**counts** (no record contents), **exits nonzero** on any violation. Checks: owner_contacts
missing-org / orphan / owner cross-org mismatch / >1 primary / assignee orphan+cross-org; diligence
missing-org / orphan / cross-org; contact_touches missing-org; automation empty; migration
finished/rolled-back/count.

## 4. Organization-isolation matrix (verified)

| Feature | List scoped | Direct read fail-closed | Cross-org owner/parent | Writes scoped |
|---|---|---|---|---|
| Owner Contacts | ✅ e2e | ✅ e2e | ✅ e2e | ✅ code (`where {…, organizationId}`) |
| Opportunity Diligence | ✅ e2e | ✅ e2e | ✅ e2e | ✅ service + action |
| Lead Import (job metadata) | ✅ unit | ✅ unit | ✅ actor↔org verified | ✅ ADMIN-only |
| ATM Wholesale | reads org-scoped opps | n/a (no persistence) | n/a | n/a |

## 5. Permission enforcement (verified by inspection + existing tests)

- `contacts/actions.ts` → `authorize(user,"UPDATE",OWNER|SELLER|BUYER,…)`; `owners/actions.ts` →
  `authorize/checkAuthorized(…"OWNER"…)`; `diligence-actions.ts` → `authorize/checkAuthorized(…
  "OPPORTUNITY"…)`; `settings/imports/actions.ts` → `requireRole(ADMIN)`. Matrix exhaustive
  (`tests/unit/permissions/can.test.ts`).

## 6. Data-integrity evidence (read-only)

`scripts/audit/crm-integrity.mjs` run **PASS** against **both** the isolated test DB and
**production** (read-only): all violation counts **0**; migrations **30/0/0**; automation **0/0**.

## 7. Files changed · commits · architecture impact

- New: `scripts/e2e-crm-isolation.mjs`, `scripts/audit/crm-integrity.mjs`.
- Modified (docs): `docs/architecture/CRM_OPERATIONS_BOUNDARY.md` (§2a outreach grain), the discovery
  docs (defect register / SoT matrix / off-roadmap / restoration plan), this acceptance record.
- **Architecture impact: none** — no app/service/schema/migration change; frozen V1.3/V1.4 modules
  **byte-unchanged vs `v1.4.0`**; no new source-of-truth introduced.

## 8. Full gate (isolated worktree, test DB @ 30)

`prisma validate` valid · `tsc` 0 · unit **58 files / 93.0%** · **E2E 40 scripts pass** (incl.
`e2e-crm-isolation`) · isolated build passes · integrity audit clean (test + prod read-only).

## 9. Production read-only verification

Prod untouched: build `YPHm2Nw65jWb7JlF7eLUn`, 30 migrations, web healthy, automation **absent**;
integrity audit clean against prod (read-only). **Nothing deployed or migrated.**

## 10. Remaining risk / follow-ups

- **Wave 5** will add deeper CRM CRUD/lifecycle unit tests (single-primary enforcement at the
  action layer, diligence status transitions) and finish D-CRM-TEST.
- The single-primary rule is enforced in the **action** layer (not a DB constraint); prod shows
  **0 owners with >1 primary**, and the audit script guards it going forward. A DB partial-unique
  index is a possible future hardening (not required; would need a reviewed migration).

*Status: Wave 1 complete → PENDING FOUNDER REVIEW. Proceeding to Wave 4 (no merge, no deploy).*

# Version 2.0 · Phase 2.0.1 — Change Inventory (since accepted `07add1e`)

> **Status: PENDING FOUNDER REVIEW.** Companion to the [Stabilization
> Audit](./V2_0_1_STABILIZATION_AUDIT.md). Every change in the production working tree since the
> accepted checkpoint `07add1e`, with provenance and recommendation. **All changes below are
> uncommitted** (0 new commits); they are live in production but absent from git `main`.

**Owner/source (all):** shared "BreadBasket Deploy" identity (concurrent development session).
**Relationship to Phase 2.0.1:** unrelated CRM/sourcing feature work.

> **UPDATE 2026-07-17:** all "keep" files below are now **captured** on
> `stabilize/crm-production-reconciliation` in 7 structured commits (byte-identical to
> production). The two loose root scripts (`ce_*.js`) were **excluded** (preserved in the backup
> archive + prod working tree; recommend removal). The ATM-calculator unit test is now wired into
> the unit gate (55 files). See [CRM Reconciliation
> Acceptance](./CRM_PRODUCTION_RECONCILIATION_ACCEPTANCE.md).

Recommendation legend: **keep** (retain, needs commit+review) · **revise** · **revert** ·
**defer** · **investigate**.

---

## A. Modified tracked files (14)

| File | Change | Boundary impact | Stability | Recommendation |
|---|---|---|---|---|
| `prisma/schema.prisma` | +3 models (`OwnerContact`, `ContactTouch`, `OpportunityDiligenceItem`), +4 enums, additive nullable/defaulted columns + back-relations on `sellers`/`buyers`/`owners`/`opportunities`/`users` | Additive only; **no** automation/underwriting/closing model modified | Typechecks clean (combined) | **keep** — commit + review |
| `lib/auth.ts` | +`organizationSlug` on the session `CurrentUser` (2 lines) | Additive; **no** change to auth/session/org-scoping logic | Clean | **keep** — commit; low-risk |
| `package.json` | +`xlsx ^0.18.5` dep; +`import:dealautomator-leads` script | New runtime dep + script | Clean typecheck | **investigate** (xlsx security) then keep |
| `package-lock.json` | lockfile update for `xlsx` | — | — | **keep** with `package.json` |
| `app/(workspace)/dashboard/page.tsx` | dashboard UI additions (new stat/cards) | UI only | Clean | **keep** — commit + review |
| `app/(workspace)/opportunities/page.tsx` | opportunities list UI | UI only | Clean | **keep** — commit + review |
| `app/(workspace)/opportunities/[id]/page.tsx` | opportunity detail incl. diligence surface | UI only; reads new diligence model | Clean | **keep** — commit + review |
| `app/(workspace)/owners/[id]/page.tsx` | owner detail + contacts surface | UI only | Clean | **keep** — commit + review |
| `app/(workspace)/owners/actions.ts` | owner server actions (contacts) | Server action; org-scoped (verify in review) | Clean | **keep** — commit + review |
| `app/(workspace)/sellers/[id]/page.tsx` | seller detail + contact/outreach fields | UI only | Clean | **keep** — commit + review |
| `app/(workspace)/properties/[id]/page.tsx` | property detail UI | UI only | Clean | **keep** — commit + review |
| `app/(workspace)/analyzer/page.tsx` | analyzer page — adds ATM-wholesale entry | UI only; **`lib/analysis.ts` unchanged** | Clean | **keep** — commit + review; confirm no calc coupling |
| `components/workspace-shell.tsx` | nav/shell additions (Contacts, Imports) | UI only | Clean | **keep** — commit + review |
| `components/stat-card.tsx` | shared stat-card component tweak | UI only; shared component | Clean | **keep** — commit + review (shared) |

---

## B. Untracked files — grouped by feature (24 paths)

### B1. Owner Contacts / Contact Operations
| Path | Purpose | Recommendation |
|---|---|---|
| `app/(workspace)/contacts/` | Contacts workspace (list/detail/actions) | **keep** — commit + review |
| `app/(workspace)/owners/[id]/contacts/` | Per-owner contacts UI | **keep** — commit + review |
| `components/owner-contact-form.tsx` | Contact create/edit form | **keep** — commit + review |
| `components/owner-primary-contact-card.tsx` | Primary-contact card | **keep** — commit + review |
| `components/hard-link.tsx` | Shared link component | **keep** — commit + review |
| `lib/contact-options.ts` | Contact enums/options helpers | **keep** — commit + review |

### B2. Opportunity Diligence
| Path | Purpose | Recommendation |
|---|---|---|
| `app/(workspace)/opportunities/diligence-actions.ts` | Diligence server actions | **keep** — commit + review (org-scope check) |
| `lib/opportunity-diligence-service.ts` | Diligence service layer | **keep** — commit + review |
| `lib/opportunity-diligence.ts` | Diligence pure/domain helpers | **keep** — commit + review |

### B3. Lead Import (DealAutomator) — uses `xlsx`
| Path | Purpose | Recommendation |
|---|---|---|
| `app/(workspace)/settings/imports/` | Import UI | **keep** — commit + review |
| `components/lead-import-form.tsx` | Upload/import form | **keep** — commit + review |
| `lib/lead-import-jobs.ts` | Import job logic | **investigate** (xlsx parsing of untrusted files) + review |
| `scripts/import-dealautomator-commercial-leads.ts` | CLI import (tsx) | **keep** — commit + review; note tsx runtime dep |
| `scripts/run-commercial-import-job.mjs` | Import job runner | **keep** — commit + review |
| `scripts/backfill-owner-seller-contact-pipeline.cjs` | One-time backfill (populated 6,897 owner_contacts) | **keep** as history / **defer** if one-shot; commit for auditability |

### B4. ATM Wholesale Calculator
| Path | Purpose | Recommendation |
|---|---|---|
| `app/(workspace)/analyzer/atm-wholesale/` | ATM wholesale UI | **keep** — commit + review |
| `components/atm-wholesale-calculator.tsx` | Calculator component | **keep** — commit + review |
| `lib/atm-wholesale-calculator.ts` | Calculator logic | **keep** — commit + review; **confirm it does NOT feed `lib/analysis.ts`** |
| `tests/unit/analysis/atm-wholesale-calculator.test.ts` | Unit test (untracked, not in gate) | **keep** — commit + wire into the unit gate |

### B5. Migrations (additive; already applied to prod)
| Path | Purpose | Recommendation |
|---|---|---|
| `prisma/migrations/20260717113000_add_owner_contacts/` | owner_contacts table + seller/buyer columns | **keep** — commit (reconcile with DB) · **do not re-apply** |
| `prisma/migrations/20260717123000_add_contact_operations/` | contact_touches + outreach columns/FKs | **keep** — commit · **do not re-apply** |
| `prisma/migrations/20260717134500_add_opportunity_diligence/` | opportunity_diligence_items | **keep** — commit · **do not re-apply** |

### B6. Loose root scripts (unknown provenance)
| Path | Purpose | Recommendation |
|---|---|---|
| `ce_counts_records.js` | ad-hoc record-count script (root) | **investigate** → likely **revert/remove** (should not be tracked at repo root) |
| `ce_verify_records.js` | ad-hoc record-verify script (root) | **investigate** → likely **revert/remove** |

---

## C. Automation Phase 2.0.1 artifacts — verified UNCHANGED

For completeness: the accepted automation surface is **byte-unchanged** vs `07add1e` and is **not**
part of the concurrent change set — `lib/automation/*`, `app/api/automation/health/route.ts`,
`scripts/automation-runtime.mjs`, `ecosystem.config.js`, `prisma/migrations/20260716040000_add_automation_foundation/`,
and the `AUTOMATION` RBAC in `lib/permissions.ts`. **Recommendation: keep as-is** (already accepted);
the only outstanding automation item is the runtime-launch blocker (`tsx`), tracked in the audit §5.

---

## D. Summary counts

- Modified tracked: **14** · Untracked paths: **24** · New commits: **0**.
- Additive migrations applied to prod but absent from `main`: **3**.
- New production dependency: **1** (`xlsx`, security review pending).
- Files touching a frozen/automation boundary: **0** (all concurrent work is additive/CRM-side).
- Recommended **keep** (commit + review): the entire CRM feature set. **investigate**:
  `xlsx`/`lead-import-jobs.ts`, two loose root scripts. **revert candidates**: the two root scripts.

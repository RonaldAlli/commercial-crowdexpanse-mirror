# Platform Stabilization — Defect Register

> **Status: PENDING FOUNDER REVIEW.** All defects found by the roadmap-restoration discovery
> (2026-07-18), most-severe first. **Headline: no Critical or High functional/security/data defect
> was found.** The frozen V1.3/V1.4 architecture is intact, production data integrity is clean, and
> the baseline gate is green. The findings are documentation drift, an off-roadmap **test gap**, and
> already-tracked debt. Companion to the [Restoration
> Plan](./PLATFORM_ROADMAP_RESTORATION_PLAN.md).

**Severity key:** Critical (active harm) · High (correctness/security/data risk) · Medium (quality/
maintainability/latent risk) · Low (hygiene/docs). **No defect below is Critical or High.**

---

## A. New findings

> **Wave 1 update (2026-07-18):** D-CRM-TEST **partially closed** (org-isolation + diligence↔Closing
> boundary tests added — `scripts/e2e-crm-isolation.mjs`, 14 assertions; deeper CRUD/lifecycle unit
> tests remain for Wave 5). D-CRM-OUTREACH-OWNERSHIP **RESOLVED** (documented in
> `CRM_OPERATIONS_BOUNDARY.md §2a`). Read-only integrity audit added (`scripts/audit/crm-integrity.mjs`),
> clean against test + prod. See [Wave 1 Acceptance](./PLATFORM_RESTORATION_WAVE_1_ACCEPTANCE.md).

### D-CRM-TEST — Off-roadmap CRM features lack accepted-suite tests · **Medium** · *partially closed (Wave 1); remainder Wave 5*
- **Feature/milestone:** CRM Owner Contacts, Contact/Seller Outreach, Opportunity Diligence (off-roadmap, migr 28–30).
- **Expected:** platform features carry unit/E2E coverage in the accepted suite (as V1.3/V1.4 do).
- **Actual:** Owner Contacts, Outreach, and Diligence have **no tests** in `tests/unit/**` or the E2E suite. (Lead-Import has 20 unit tests; ATM-Wholesale has 1.)
- **Architecture violation:** none. **Data risk:** none observed (prod data clean). **Org-isolation risk:** low — org-scoping verified by code inspection, but **not regression-locked by tests**.
- **Production impact:** live, functioning, data-clean; but a future change could silently break org-scoping or lifecycle rules without a failing test.
- **Required fix:** add focused unit + E2E tests (org-isolation, CRUD/lifecycle, primary-contact rule, diligence status transitions, diligence↔Closing boundary). **Test required:** yes. **Migration:** no.
- **Order:** Wave 5 (CRM integration).

### D-CRM-OUTREACH-OWNERSHIP — Outreach fields on two surfaces · **Low/Medium** · ✅ *RESOLVED (Wave 1)*
- **Feature:** outreach operational fields (`outreachStatus`, `nextFollowUpAt`, `assignedUserId`, do-not-* flags) exist on **`OwnerContact`** (migr 28) **and** on `Seller`/`Buyer` (migr 29).
- **Expected:** a single, documented authoritative owner per outreach concept.
- **Actual:** two outreach surfaces. They are **different entities** (owner-contact-level vs seller/buyer-level), so it is **not a data conflict** — but the authoritative owner of "outreach state" is not documented, risking future ambiguity/duplication.
- **Architecture violation:** none today. **Data risk:** none. 
- **Required fix:** document the boundary in the [Source-of-Truth Matrix](../architecture/PLATFORM_SOURCE_OF_TRUTH_MATRIX.md) + `CRM_OPERATIONS_BOUNDARY.md` (owner-contact outreach = per-contact; seller/buyer outreach = per-lead). **Test:** optional. **Migration:** no.
- **Order:** Wave 5 (documentation, then confirm no dedup needed).

### D-DOC-1 — Roadmap volumes understate production migration state · **Low**
- `VERSION_2_0.md`, `EXECUTIVE_DASHBOARD.md` state "prod at 26 migrations / automation not applied." Reality: **prod at 30** (migration 27 applied but executor paused; CRM 28–30). Repro: `prisma migrate status` on prod = 30.
- **Fix:** reconcile the roadmap volumes to prod=30 + the accepted CRM layer. **Migration:** no. **Order:** Wave 4/7 (doc reconciliation).

### D-DOC-2 — `RELEASE_PLAN.md` marks 1.4 "Planned" · **Low**
- Contradicts `V1_4_ACCEPTANCE.md` (1.4 accepted/released/frozen 2026-07-16). **Fix:** update to Released. **Order:** doc reconciliation.

### D-DOC-3 — CRM layer absent from the roadmap surface · **Low**
- The accepted, in-production CRM features appear only in `releases/`+`architecture/`, not the roadmap volumes. **Fix:** add the CRM entry (now captured in the [Canonical Roadmap](../roadmap/CANONICAL_PLATFORM_ROADMAP.md) seq 9). **Order:** doc reconciliation.

### D-DOC-4 — Dashboard / MODULE_ROADMAPS lag · **Low**
- `EXECUTIVE_DASHBOARD.md` "last reviewed 2026-07-16" predates the 2.0.1 prod migration + CRM reconciliation. **Fix:** refresh review date + status. **Order:** doc reconciliation.

### D-DOC-5 — `/analyzer/atm-wholesale` route location · **Low (cosmetic)**
- ATM Wholesale (a CRM wholesale tool) lives under the underwriting analyzer route group. It does **not** couple to `lib/analysis.ts` and persists nothing, so it is not a source-of-truth risk — only a navigational/roadmap-labeling mismatch. **Fix:** document (and optionally relocate under a CRM route group in a later, separately-reviewed change — not required for correctness). **Order:** Wave 6 (optional).

---

## B. Confirmed NON-defects (verified clean — no action)

- **Frozen V1.3/V1.4 intact** — 9/10 load-bearing modules byte-identical to `v1.4.0`; `permissions.ts` additive only.
- **Composed PAID gate intact** — `isClosingReady()` AND `authorizeStageMove()` in `opportunities/actions.ts`; no bypass path.
- **TX-6 projection reuse intact** — Dashboard/Timeline/badges read authoritative primitives; zero duplicated readiness logic.
- **No CRM→frozen-domain coupling** — no CRM module imports/mutates underwriting/closing.
- **ATM Wholesale is advisory-only** — no schema model, **0 persistence writes**, no `analysis.ts` import; not a competing analysis engine.
- **Opportunity Diligence defers to Closing** — references `OpportunityStage.PAID` read-only; does not replace ClosingChecklist, compose/bypass PAID, or complete/waive items.
- **Lead Import remediated** — CSV-only (xlsx removed), org-scoped + fail-closed job metadata, ADMIN-only, resource-limited (ADR-0006); 20 tests.
- **Production data integrity clean** — owner_contacts 6,897 (0 no-org / 0 orphan / **0 cross-org** / **0 owners with >1 primary** / 0 assignee-orphan); diligence 24 (0 cross-org); contact_touches 0; automation 0/0; migrations 30/0/0.
- **Org-scoping** — 53/55 models carry `organizationId` (Organization + OwnerAlias intentionally excepted); CRM actions authorize + scope.

---

## C. Carried-forward known debt (not new; tracked in TECHNICAL_DEBT)

| ID | Item | Severity | Gate |
|---|---|---|---|
| **D19** | Automation runtime launch blocker (`tsx`/plain-node) | Medium | **Blocks the Automation dark start** — do NOT fix during this program |
| **D15** | Deprecated `DealAnalysis` table retained | Low | Separate destructive-migration cleanup |
| **D4** | Off-host R2 backup mirror + cron unscheduled | Medium (DR) | Operational (provision R2) |
| **D16** | Transient E2E-runner SIGSEGV (Node 20/tsx) | Low | Node 22 upgrade / retry-on-signal |
| **D17** | 2.0.1 deferrals (outbox trigger, per-org cap, DB policies) | — | 2.0.2+ |

---

## D. Repair-order summary

No Priority-1 security/data-integrity defect exists (all clean). The corrective work is:
1. **Documentation reconciliation** (D-DOC-1…5) — Low.
2. **Off-roadmap test coverage** (D-CRM-TEST) — Medium, the main quality gap.
3. **Source-of-truth documentation** (D-CRM-OUTREACH-OWNERSHIP) — Low/Medium.
Sequenced in the [Restoration Plan](./PLATFORM_ROADMAP_RESTORATION_PLAN.md). **No fixes performed in
this discovery phase** (none is an active Critical production defect).

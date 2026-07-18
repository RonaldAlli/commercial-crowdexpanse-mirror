# Platform Restoration — Wave 4 Acceptance (Projections, Navigation, UI Integration)

> **Status: PENDING FOUNDER REVIEW.** Wave 4 of the roadmap-restoration program (2026-07-18),
> executed **after** Wave 1 was green. Wave 4 **reconciles roadmap/status documentation, integrates
> the CRM layer into the roadmap surface, audits navigation and shared projections, and clarifies
> the ATM-Wholesale advisory boundary in the UI** — without touching Underwriting or Closing
> calculations. **Frozen V1.3/V1.4 modules byte-unchanged; nothing deployed; Automation paused
> (D19 untouched).**

---

## 1. Documentation drift corrected (D-DOC-1…4)

One authoritative status surface — the [Canonical Platform
Roadmap](../roadmap/CANONICAL_PLATFORM_ROADMAP.md) — is now referenced from the drifted docs, and
the stale status lines were fixed (targeted edits, historical per-slice notes retained):
- **`RELEASE_PLAN.md`:** 1.4 → **Released · Frozen**; added **2.0.1 (accepted + prod, executor
  paused)** and the **CRM (accepted)** rows; 1.2 → **Partial**. Points to the canonical roadmap.
- **`VERSION_2_0.md`:** the stale **"prod stays at 26"** corrected — migration 27 was later applied
  to prod (executor paused, D19), CRM added 28–30, **prod now 30**; original wording retained as
  history.
- **`EXECUTIVE_DASHBOARD.md`:** review date → 2026-07-18; Automation row → **"Foundation accepted,
  PAUSED"** (migration 27 in prod, executor never started, D19); added a **CRM Operations** row
  (advisory-labeled ATM); header now states current prod = 30 migrations + points to the canonical
  roadmap; per-slice counts flagged as historical.

## 2. CRM integrated into the roadmap surface (D-DOC-3)

The CRM feature set (Owner Contacts, Seller/Contact Outreach, Opportunity Diligence, DealAutomator
Import, ATM Wholesale) now appears in the [Canonical Roadmap](../roadmap/CANONICAL_PLATFORM_ROADMAP.md)
(seq 9), the `RELEASE_PLAN` table, and the Dashboard — classified as **initially added outside the
roadmap → reconciled → security-remediated → architecturally reviewed → undergoing restoration
acceptance**. It is **not** classified as Automation; ATM Wholesale is explicitly **not** Underwriting truth.

## 3. Navigation audit — CLEAN (verify-only, no change)

`components/workspace-shell.tsx` nav (`navigation[]`) reviewed:
- **Role-aware:** `visibleNav = navigation.filter(item => item.section !== "Settings" || isAdmin)` —
  the Settings group (Team, Organization, **Imports**, Access denials) is **ADMIN-only**, matching
  `settings/imports/actions.ts` `requireRole(ADMIN)`. No unauthorized-role exposure.
- **No dead links:** every `href` maps to a real route (verified against the route inventory).
- **Active highlighting** works (`pathname.startsWith(item.href)`); ATM Wholesale (reached from the
  Deal Analyzer index) correctly highlights *Deal Analyzer*.
- Consistent labels + sections (Overview / Records / Workflow / Settings). **No redesign performed.**

## 4. Shared projection audit — CLEAN (verify-only, no duplication)

- Dashboard, Timeline, list badges, and the **Opportunity detail page** all read the **authoritative
  primitives** from `@/lib/closing` (`closingProgress`, `blockingItems`, `closingReadinessSummary`)
  and `@/lib/transaction-dashboard` (`projectClosingBadges`) — **no inline re-derivation** of
  readiness/blockers/PAID (grep for `items.every`/`required && COMPLETE` outside the closing libs:
  **zero**). TX-6 reuse intact.
- **No new CRM projection module needed** — there is no duplicated CRM-summary calculation to
  consolidate. (If future duplication of contact-count / open-diligence-count emerges across pages,
  a single read-only `lib/crm-*.ts` projection is the pattern to use — not required now.)

## 5. Opportunity page — domain boundaries already clear (verify-only)

`opportunities/[id]/page.tsx` already presents lifecycle-ordered, labelled sections and does **not**
blend CRM into Closing: pre-contract diligence carries the eyebrow **"Pre-contract diligence"** and
the explicit boundary text *"Before contract, work seller pursuit and pre-contract diligence above.
Once this deal moves to Under Contract, escrow, financing, assignment, and closing checklist
execution take over here."* No Closing-language leakage (no "closing ready"/"PAID"/"funded" applied
to diligence). Completing a CRM section does **not** authorize a later domain (proven by the Wave 1
boundary E2E).

## 6. ATM Wholesale — advisory boundary clarified in the UI (fix)

`analyzer/atm-wholesale/page.tsx`: the misleading eyebrow **"Underwriting"** → **"Advisory · deal
prep"**, and a banner added: *"Advisory & preliminary — not an approved Underwriting result … its
numbers are not saved and never become Underwriting truth. For the authoritative … underwriting
workflow, use the Deal Analyzer"* (links to `/analyzer`). **No ATM model added, no persistence, no
approval status, no auto-copy of values into Underwriting assumptions.** (Prohibitions honored.)

## 7. UI state quality

Reviewed the CRM surfaces at the render level; found **no broken behavior** to fix (Wave 4 fixes
broken behavior, not visual preferences). The pages use the platform's standard server-component +
`PageHeader`/card patterns; cross-org access already fails closed (Wave 1). *Deeper per-page
loading/empty/error-state test coverage is folded into the Wave 5 CRM test backfill.*

## 8. Files changed · commits

- **App (1):** `app/(workspace)/analyzer/atm-wholesale/page.tsx` (advisory banner + eyebrow) — the
  only application code changed in Wave 4; a CRM page, not a frozen module.
- **Docs:** `RELEASE_PLAN.md`, `VERSION_2_0.md`, `EXECUTIVE_DASHBOARD.md`, this acceptance record,
  discovery-doc status updates.
- **Architecture impact: none to frozen domains** — `lib/analysis.ts`, `lib/closing.ts`,
  `lib/transaction-dashboard.ts`, `lib/underwriting/*` **byte-unchanged vs `v1.4.0`**.

## 9. Gate (isolated worktree, test DB @ 30)

`tsc` 0 · unit **58 files / 93.0%** · **E2E 40 scripts pass** · isolated build passes (ATM route
built). Frozen modules unchanged; production untouched (build `YPHm2Nw65jWb7JlF7eLUn`, 30 migrations,
automation absent).

## 10. Remaining

- **Wave 5** (not authorized yet): deeper CRM CRUD/lifecycle + UI-state tests (closes D-CRM-TEST).
- **D-DOC-5** (cosmetic): the `/analyzer/atm-wholesale` route still lives under the analyzer group;
  the advisory banner now removes the ambiguity in-product. A route relocation remains optional and
  separately reviewed.

*Status: Waves 1 and 4 complete → PENDING FOUNDER REVIEW. No merge, no deploy, Automation paused.*

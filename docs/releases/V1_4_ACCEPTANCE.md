# Version 1.4 (Closing Center) — Acceptance Record & Closeout

> **Status: ✅ ACCEPTED · RELEASED · FROZEN (2026-07-16).**
> - **Accepting authority:** Founder (Ronald Allicock).
> - **Acceptance date:** 2026-07-16.
> - **Frozen at:** branch **`release/1.4`** + annotated tag **`v1.4.0`**, both at the
>   acceptance commit on `main` (this closeout commit; `git rev-parse v1.4.0`).
> - **Production at acceptance:** 26 migrations, schema up to date, serving build
>   `pgfa3y2AzXBEWuUkYQ6Fo`.
>
> Version 1.4 (Closing Center) is **feature-complete, accepted, released, and frozen** as
> the stable baseline for Version 2.0 (Automation & AI). No feature work lands on
> `release/1.4`. The five closeout reviews are below. **This closeout does not start
> Version 2.0, does not modify D15** (the deprecated `DealAnalysis` removal remains a
> separately-reviewed cleanup), and changes no frozen 1.4 architecture.

---

## What shipped in Version 1.4

The Closing Center: carrying an underwritten, matched deal the operational "last mile"
(`UNDER_CONTRACT → BUYER_MATCHED → CLOSING → PAID`) as a checklist-gated, human workflow —
the deliberate opposite of the deterministic V1.3 underwriting engine — plus a complete,
read-only **read model** over that operational state.

| Slice | Delivery | Prod migrations | Serving build |
|---|---|---|---|
| **1 — Foundation + Due Diligence + PAID gate** | LIVE | 22 → **23** | `q0k2nXlweILTSGL6K8rS7` |
| **2 — Escrow** | LIVE | 23 → **24** | `hJJCViPhweeyHioi_UMkP` |
| **3 — Financing** | LIVE | 24 → **25** | `YJdWgq0rNRz7tPNraoOhD` |
| **UI-prep — Closing Center accordion** | LIVE | code-only (25) | `N4WIQvz0k7RSXD_iurA9u` |
| **4 — Assignments** | LIVE | 25 → **26** | `T6JdJGzrYR-a6lWtEhnmS` |
| **5 — Transaction Dashboard** | LIVE | code-only (26) | `I1QNF8TL8U1e-EuGPHtp1` |
| **6 — Transaction Timeline (TX-0)** | LIVE | code-only (26) | `AkKD_n2EeTREsRoFafA-N` |
| **7 — Opportunity-list Closing Badges (#7)** | LIVE | code-only (26) | `pgfa3y2AzXBEWuUkYQ6Fo` (current) |

**Net schema change:** V1.4 added migrations **23 → 26** — 4 additive migrations, **0
destructive**; the frozen `v1.3.0` baseline (22 migrations) is unaffected. Slices 5–7 (the
entire read model) were **code-only**.

---

## 1. Architecture review

**Verdict: coherent and boundary-preserving.** The organizing achievement of 1.4 is that
every later slice *reused* the earlier architecture rather than bypassing it:

- **Operational domains own state; the read model owns none.** Due Diligence, Escrow,
  Financing, and Assignments are first-class records with lifecycles, immutable terminal
  snapshots, and ADMIN-only reasoned overrides. The Dashboard, Timeline, and List badges
  are pure projections that derive at read time and persist nothing (TX-2/TX-3, LB-1).
- **The projection layer is real and enforced.** `TX-4 Projection Composition` and `TX-6
  Projection Reuse` were established *and then used*: the three read surfaces consume the
  same pure modules (`lib/transaction-dashboard.ts`, `lib/transaction-timeline.ts`) and
  never recompute closing status — so they cannot diverge. `TX-5 Projection Version` is
  reserved for when semantics need independent versioning.
- **The frozen V1.3 boundary held.** `lib/analysis.ts` is untouched since V1.2; the
  underwriting engine, lineage, and fingerprints were never modified. The one touchpoint —
  Financing reading a scenario's sized debt — is a one-way, read-only, non-persisted
  reference (FC-0/FC-15), proven to write no underwriting row.
- **The PAID gate stayed composed, never bypassed.** `isClosingReady()` (pure) composed
  with role-based `canMoveStage()` (CC-2/CC-3), re-verified in every slice; escrow,
  financing, and assignment gate PAID only via *configured* checklist items, never
  hardcoded (EC-H/FC-H/AS-J-revised).
- **Reuse across frameworks.** Assignments bridged the operational Closing record with the
  V1.3 generated-document framework (CC-F) without duplicating it; the Timeline reused
  `ActivityLog`; the badges reused the dashboard projection.

Full invariant catalog (locked): CC-A…CC-G/CC-1…CC-10 · EC-A…EC-J/EC-1…EC-11 ·
FC-0…FC-J/FC-1…FC-15 · AS-A…AS-N/AS-1…AS-15 · TX-0…TX-6/TX-A · TD-A…TD-L/TD-1…TD-12 ·
TL-1…TL-13 · LB-1…LB-14. See the [Closing Center Architecture Lock](../architecture/CLOSING_CENTER_ARCHITECTURE_LOCK.md)
and the new [Platform Architecture Map](../architecture/PLATFORM_ARCHITECTURE_MAP.md).

## 2. UI review

**Verdict: consistent and non-disruptive.**

- The **Closing Center accordion** groups Due Diligence / Escrow / Financing / Assignment
  into one labelled workspace on the Opportunity page, with a persistent authoritative
  readiness header — added as its own presentation-only slice so the fourth domain landed
  into structure, not a flat stack.
- The **Dashboard** (`/closing`) is a cross-deal current-state list with deterministic
  ordering (TD-10), graceful degradation (TD-11), and GET-link filters; each row links out
  to the Closing Center (orchestration, not ownership).
- The **Timeline** replaced the ad-hoc 12-item Activity card with a categorized, ordered,
  paginated history beside the Closing Center — richer, honest (event integrity TL-10,
  snapshot references TL-11), and read-only.
- The **List badges** are a compact chip cluster beneath each Opportunity title, quiet on
  early leads (LB-9), stable in height as status evolves (LB-13), and rendered entirely
  from the projection (LB-14). The Kanban Board was deliberately left untouched (LB-7).
- All read surfaces are read-only and link OUT; none add inline mutation. Accessibility
  (accessible names, keyboard focus) and responsive layouts (desktop/tablet/mobile) are
  covered by the Playwright harness.

## 3. Performance review

**Verdict: bounded and deliberately un-optimized (prove-first).**

- The **Dashboard** loads only in-flight deals via one org-scoped query with 1:1 joins +
  a single owner-name lookup (no N+1).
- The **Timeline** is one org+opportunity-scoped `ActivityLog` query with offset
  pagination (page size 20) — the same shape as the existing `/activity` feed.
- The **List badges** add only the minimal Closing selects to the existing List query,
  bounded by the existing 20/page pagination, with **no** owner lookup, **no** `ActivityLog`
  fetch, and **no** N+1 (LB-10). The unbounded Kanban Board was excluded on purpose.
- **No speculative indexes.** The additive `ActivityLog (organizationId, opportunityId,
  createdAt)` index is reserved and **benchmark-gated** (TX-A/TL-9/LB-8) — to be added only
  if real Timeline/List volume justifies it, consistent with "prove first, optimize second."

## 4. Technical-debt review

**Verdict: no new release-blocking debt; V1.4 improved the debt posture.** Full register:
[TECHNICAL_DEBT.md](../roadmap/TECHNICAL_DEBT.md). Status relevant to this acceptance:

- **D4 — Off-host backup mirror (R2) unprovisioned + cron unscheduled.** Standing, accepted
  operational caveat (reaffirmed at V1.3 acceptance). The local six-stage backup is
  restore-verified and was exercised before every V1.4 migration (reports 5/6). **Accepted
  as-is for 1.4**; the off-host mirror remains the one open operational item.
- **D3 — Local filesystem document storage.** Unchanged; V1.4's generated assignment
  agreements stay on local storage. Open, non-blocking (storage-abstraction future refactor).
- **D2 — Org scoping by convention (not RLS).** Mitigated: every V1.4 slice added explicit
  cross-org isolation E2E assertions. Open, non-blocking.
- **D16 — Transient E2E-runner SIGSEGV under tsx/Node 20.** Test-infra reliability only, not
  reproducible; interim workaround is re-running `npm test`. Clears with the Node 22 upgrade
  (also clears D11). Non-blocking.
- **D6/D10 — Email campaigns/digests & password reset.** Deferred (2.0 / scheduled). Not in
  1.4 scope.
- **D15 — Deprecated `DealAnalysis` table.** Trigger satisfied at V1.3 acceptance but
  **explicitly out of this closeout** — a separately-reviewed destructive cleanup with its
  own plan, data verification, and review gate. Untouched.
- **No `TODO`/`FIXME`/`HACK` markers** in `lib/`, `app/`, or `components/`.

**New in 1.4, recorded for the register (non-blocking):** the reserved benchmark-gated
`ActivityLog` index (TX-A) and Board-level closing badges (LB-7) are deferred follow-ups,
not debt.

## 5. Documentation review

**Verdict: synchronized.** Every slice updated its decision record, the Architecture Lock,
and the roadmap docs at release. As of this closeout:

- **Architecture:** Closing Center Architecture Lock (Slices 1–7, all invariant families);
  four ratified decision packages (Dashboard, Timeline, Opportunity-list Badges) preserved
  as records; the new **Platform Architecture Map**.
- **Roadmap:** `VERSION_1_4.md`, `ENGINEERING_MASTER_PLAN.md`, `EXECUTIVE_DASHBOARD.md` all
  mark Slices 1–7 LIVE and 1.4 feature-complete / entering closeout.
- **Debt:** `TECHNICAL_DEBT.md` current.
- **Project memory:** updated through Slice 7.

Release notes are **drafted at freeze time**, after acceptance (per the process ordering).

---

## Verification summary

- **Tests:** 50 unit test files (critical pure modules ≥90% branch, overall ≥80%) · 38
  E2E scripts · 5 Playwright visual specs (full authenticated cross-viewport coverage) —
  all green on the `_test` DB at each slice's gate.
- **Production:** 26 migrations, schema up to date, drift empty; serving
  `pgfa3y2AzXBEWuUkYQ6Fo`; V1.3 baseline + all prior slices verified intact at each release.
- **Empty-prod caveat (honest):** production currently has **0 opportunities** (1 user).
  The operational domains and the read model are therefore verified end-to-end on the
  `_test` DB (unit + E2E + Playwright), and on production at the route / health / schema /
  build-ID level, rather than against live production deal data. No artificial production
  transactions were created (founder instruction). First real usage will exercise the live
  render; the projections are deterministic and covered.

---

## Acceptance record — ACCEPTED

**Version 1.4 (Closing Center)** is accepted as **feature-complete**: Slices 1–7 plus the
accordion UI-preparation slice, LIVE in production, with the architecture, UI, performance,
technical-debt, and documentation reviews above.

- **Accepted by:** Founder (Ronald Allicock) — 2026-07-16.
- **Frozen:** branch **`release/1.4`** + annotated tag **`v1.4.0`** at the acceptance
  commit (`git rev-parse v1.4.0`). No feature work lands on `release/1.4`.
- **Release note:** [`V1_4_RELEASE_NOTE.md`](./V1_4_RELEASE_NOTE.md).
- **Recorded** in the Executive Dashboard, Engineering Master Plan, Version 1.4 roadmap,
  and project memory as **ACCEPTED · RELEASED · FROZEN**.

**Not done by this closeout (deliberately):** no Version 2.0 (Automation & AI) work; no
change to D15 (the deprecated `DealAnalysis` removal remains a separate, later, reviewed
cleanup); no change to any frozen 1.4 architecture.

**Standing accepted caveat carried into 1.4 (unchanged):** D4 — no guaranteed off-host DR
copy until R2 is provisioned and the backup cron is scheduled.

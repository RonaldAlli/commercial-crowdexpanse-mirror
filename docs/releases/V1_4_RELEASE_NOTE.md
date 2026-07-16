# CrowdExpanse Commercial — Version 1.4 (Closing Center) Release Note

**Status:** ✅ Accepted · Released · Frozen — 2026-07-16
**Tag:** `v1.4.0`   **Frozen branch:** `release/1.4`   **Serving build:** `pgfa3y2AzXBEWuUkYQ6Fo`
**Acceptance record:** [`V1_4_ACCEPTANCE.md`](./V1_4_ACCEPTANCE.md)

---

## Highlights

Version 1.4 delivers the **Closing Center** — carrying an underwritten, matched deal the
operational "last mile" (`UNDER_CONTRACT → BUYER_MATCHED → CLOSING → PAID`) as a
checklist-gated **human workflow**, the deliberate opposite of the deterministic V1.3
underwriting engine — plus a complete, read-only **read model** over that operational state.

- Four first-class **operational domains**: Due Diligence, Escrow, Financing, Assignments.
- A complete **read model**: Transaction Dashboard (breadth across deals), Transaction
  Timeline (depth within one deal), and Opportunity-list Closing Badges (health across the
  pipeline list).
- A durable **projection layer** — one source, many consumers — so read surfaces never
  duplicate or diverge in closing logic.

## What's new (by slice)

- **Slice 1 — Foundation + Due Diligence + PAID gate.** First-class `ClosingChecklist`
  (1:1 Opportunity) instantiated by a one-way snapshot of a versioned template; the pure
  `isClosingReady` PAID gate **composed with** role-based `canMoveStage` (never replacing
  it); a blocked move explains its outstanding items; new `CLOSING` RBAC + ADMIN-only
  reasoned waiver; reuses Documents/Tasks/ActivityLog.
- **Slice 2 — Escrow.** First-class `EscrowRecord` deposit lifecycle with an immutable
  append-only `EscrowEvent` terminal snapshot (record frozen after); ADMIN-only reasoned
  resolution; PAID gate unchanged (escrow gates PAID only via a configured checklist item).
- **Slice 3 — Financing.** First-class `FinancingRecord` lender process; immutable in-record
  terminal snapshot (no separate ledger); no money fields; the read-only FC-0/FC-15
  underwriting-reference boundary (reads a scenario's sized debt, never persists it).
- **UI-prep — Closing Center accordion.** Presentation-only grouping of the domains into one
  labelled workspace with a persistent authoritative readiness header; introduced the
  test-only Playwright visual harness.
- **Slice 4 — Assignments.** First-class `AssignmentRecord` for the wholesale transaction;
  the agreement **reuses the V1.3 Offer-Memo generated-document framework** (immutable,
  append-only, SHA-256, regenerable-until-execution); immutable execution snapshot;
  ADMIN-only execution.
- **Slice 5 — Transaction Dashboard.** Read-only cross-opportunity current-state projection
  (readiness, blockers, per-domain status, next/overdue milestone, responsible party),
  deterministic ordering, graceful degradation; each row links out to the Closing Center.
- **Slice 6 — Transaction Timeline (TX-0).** Read-only single-opportunity chronological
  projection over `ActivityLog`, replacing the ad-hoc Activity card; newest/oldest ordering,
  pagination, snapshot references; event integrity and honest "as-recorded" semantics.
- **Slice 7 — Opportunity-list Closing Badges (Roadmap #7).** Compact read-only closing-health
  badges beneath each Opportunity title on the List view; stage-aware visibility; the Kanban
  Board left untouched.

## Architecture additions (durable design principles)

- **Composed PAID gate** — `isClosingReady()` ∘ `canMoveStage()`; never bypassed or hardcoded.
- **Immutable terminal snapshots** for Escrow/Financing/Assignment; append-only, record-freeze.
- **Generated-document framework reuse** — Assignments inherit the Offer-Memo framework (CC-F).
- **TX-4 Projection Composition** and **TX-6 Projection Reuse** — every read surface consumes
  the same pure projection modules; no surface recomputes closing status.
- **TX-5 Projection Version** — reserved (not implemented).
- New **[Platform Architecture Map](../architecture/PLATFORM_ARCHITECTURE_MAP.md)** — the
  canonical whole-platform picture for Version 2.0.
- Full invariant catalog: CC-A…CC-G/CC-1…CC-10 · EC-A…EC-J/EC-1…EC-11 · FC-0…FC-J/FC-1…FC-15 ·
  AS-A…AS-N/AS-1…AS-15 · TX-0…TX-6/TX-A · TD-A…TD-L/TD-1…TD-12 · TL-1…TL-13 · LB-1…LB-14.

## Production changes & migrations

- **Migrations 23 → 26** — 4 additive, **0 destructive**; the frozen `v1.3.0` baseline (22)
  is unaffected. Slice 1 (23), Escrow (24), Financing (25), Assignments (26).
- **Slices 5, 6, 7 (the entire read model) were code-only** — no migration, no schema change.
- Build-ID progression: `q0k2nXlweILTSGL6K8rS7` → `hJJCViPhweeyHioi_UMkP` →
  `YJdWgq0rNRz7tPNraoOhD` → `N4WIQvz0k7RSXD_iurA9u` → `T6JdJGzrYR-a6lWtEhnmS` →
  `I1QNF8TL8U1e-EuGPHtp1` → `AkKD_n2EeTREsRoFafA-N` → **`pgfa3y2AzXBEWuUkYQ6Fo`**.

## Read-model completion

The Closing Center read model is complete: **Dashboard** (breadth), **Timeline** (depth),
**List badges** (list health) — all pure projections over the operational domains, sharing
one projection layer (TX-4/TX-6). No cached readiness, no materialized views, no second
source of truth.

## Known deferred work (non-blocking)

- **Board-level closing badges** — reserved, benchmark-gated (LB-7).
- **Additive `ActivityLog (organizationId, opportunityId, createdAt)` index** — reserved,
  benchmark-gated (TX-A/TL-9/LB-8); add only if real Timeline/List volume justifies it.
- **D4** — off-host backup mirror (R2) unprovisioned + cron unscheduled; standing accepted
  operational caveat (local backups are restore-verified, reports 5/6).
- **D15** — deprecated `DealAnalysis` table removal; separately-reviewed destructive cleanup,
  untouched by this release.
- **D3/D6/D10/D16** — local document storage, email campaigns/digests, password reset, and the
  transient Node-20/tsx E2E-runner SIGSEGV; all open, non-blocking (see TECHNICAL_DEBT.md).

## Upgrade notes

- **Schema:** run `prisma migrate deploy` to reach 26 migrations (additive only; safe on the
  `v1.3.0` baseline). No destructive changes.
- **No dependency changes** introduced by the read-model slices.
- **Boundaries preserved:** the frozen V1.3 underwriting engine (`lib/analysis.ts`, lineage,
  fingerprints) is untouched; the PAID gate is composed, not bypassed; closing state has a
  single source of truth per domain.

## Testing summary

- **50 unit test files** — critical pure modules ≥90% branch, overall ≥80%.
- **38 E2E scripts** — per-domain lifecycles, gate composition, org isolation, no-writes /
  byte-identical read proofs, projection determinism.
- **5 Playwright visual specs** — authenticated cross-viewport (desktop/tablet/mobile)
  behavior, accessibility, and screenshots for the Closing Center, Dashboard, Timeline, and
  List badges.
- **Production:** schema drift empty at every release; V1.3 baseline + prior slices verified
  intact. Honest caveat: production currently holds 0 opportunities, so live-data rendering
  of the Closing Center is exercised on the `_test` DB; production was verified at the
  route/health/schema/build-ID level.

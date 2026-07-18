# Volume 3 — Release Plan

> Development is organized into **releases**, not a flat feature list. Each release has a theme, a scope, a checklist, and a Definition of Done. See the [EMP](./ENGINEERING_MASTER_PLAN.md) for the lifecycle and global DoD.
>
> **Authoritative current status:** the [Canonical Platform Roadmap](./CANONICAL_PLATFORM_ROADMAP.md)
> is the single up-to-date status surface (prod migration count, frozen tags, accepted/paused state).
> This table is kept in sync with it (updated 2026-07-18, roadmap-restoration Wave 4).

## Release sequence

| Version | Theme | Status | Detail |
|---|---|---|---|
| **1.0** | Foundation (auth, multi-tenancy, core records, pipeline) | ✅ Shipped | — |
| **1.1** | **Operational Excellence** | ✅ Shipped (`v1.1.0`) | [VERSION_1_1.md](./VERSION_1_1.md) |
| **1.2** | **Commercial Intelligence** | 🟡 Partial — Slices 1–2 accepted (`v1.2.0-slice.1/2`); remainder deferred, no whole-version freeze | [VERSION_1_2.md](./VERSION_1_2.md) |
| **1.3** | **Commercial Underwriting** | ✅ **Released · Frozen (`v1.3.0`, 2026-07-15)** | [VERSION_1_3.md](./VERSION_1_3.md) · [Acceptance](../releases/V1_3_ACCEPTANCE.md) |
| **1.4** | **Closing Center** | ✅ **Released · Frozen (`v1.4.0`, 2026-07-16)** | [VERSION_1_4.md](./VERSION_1_4.md) · [Acceptance](../releases/V1_4_ACCEPTANCE.md) |
| **2.0.1** | **Automation Foundation** | 🟠 Accepted + in prod (migration 27) but **executor paused** (D19 open) | [V2_0_1 Impl Acceptance](../releases/V2_0_1_IMPLEMENTATION_ACCEPTANCE.md) |
| **CRM** | **CRM Operations** (off-roadmap, accepted) | ✅ Deployed + Founder-accepted 2026-07-18 (migr 28–30) | [CRM Production Acceptance](../releases/CRM_PRODUCTION_RECONCILIATION_PRODUCTION_ACCEPTANCE.md) |
| **2.0** | **Automation & AI** (full) | 🔴 Planned (architecture ratified; phases separately gated) | [VERSION_2_0.md](./VERSION_2_0.md) |

> Note: the Deal Analyzer already computes NOI/cap rate/DSCR/debt yield, so 1.3 hardens an existing foundation rather than starting from zero. Underwriting improvements may be pulled forward opportunistically when they unblock 1.2 intelligence.

## Why this order
1. **1.1 Operational Excellence** — make the existing workflow trustworthy (tests, CI, permissions, performance, the remaining list polish) before adding surface area.
2. **1.2 Commercial Intelligence** — enrich the data (market/owner/property/portfolio) so underwriting and matching get better inputs.
3. **1.3 Commercial Underwriting** — deepen the Analyzer into full financial modeling using that richer data.
4. **1.4 Closing Center** — carry underwritten, matched deals through due diligence to a closed assignment.
5. **2.0 Automation & AI** — only once the deterministic workflow end-to-end exists and is trusted, layer automation and AI on top.

## Release Checklist (applies to every version)
A version is releasable only when:
- [ ] Every in-scope item meets the global [Definition of Done](./ENGINEERING_MASTER_PLAN.md#definition-of-done).
- [ ] Full `npm test` green on the `_test` DB; CI green on `main`.
- [ ] `npm run build` succeeds; no schema drift outside intended changes.
- [ ] [Executive Dashboard](./EXECUTIVE_DASHBOARD.md) updated to reflect shipped state.
- [ ] [Technical Debt](./TECHNICAL_DEBT.md) reviewed; no release-blocking items open.
- [ ] Operations items for the release (backups/monitoring) satisfied per [Operations](./OPERATIONS_ROADMAP.md).
- [ ] Tagged in git; both remotes pushed.

## Definition of Done (release-level)
Beyond the per-change DoD, a **release** additionally requires:
- A written release note summarizing scope, migrations (if any), and rollback steps.
- Regression pass: the full E2E suite plus manual smoke of the critical path (lead → underwrite → match → close-adjacent).
- No known data-loss or cross-tenant defects.
- Ops rollback path verified (see [Operations](./OPERATIONS_ROADMAP.md#rollback)).

## Versioning convention
- **Minor (1.x):** additive feature themes; backward-compatible data.
- **Patch (1.x.y):** fixes and hardening within a theme.
- **Major (2.0):** introduces automation/AI as a new capability class with its own governance (Volume 6).

# Volume 10 — Executive Dashboard

> The single source of truth for "what state is each module in." Update this table whenever a module's status changes (part of the [Definition of Done](./ENGINEERING_MASTER_PLAN.md#definition-of-done)).
> **Last reviewed:** 2026-07-12. Percentages are engineering-judgment estimates of scope-complete against that module's roadmap.

## Legend
✅ Complete · 🟢 Good (usable, minor gaps) · 🟡 Partial · 🔴 Planned

## Module status

| Module | Status | Target Version | % Complete |
|---|---|---|---|
| Authentication & Sessions | ✅ Complete | 1.0 | 100% |
| Organization / Multi-Tenancy | ✅ Complete | 1.0 | 100% |
| Seller Records | 🟢 Good | 1.1 | 90% |
| Buyer Records | 🟢 Good | 1.1 | 90% |
| Property Records | 🟢 Good | 1.1 | 90% |
| Opportunities / Pipeline | 🟢 Good | 1.1 | 85% |
| Buyer Matching | ✅ Complete | 1.1 | 100% |
| Tasks | 🟢 Good | 1.1 | 85% |
| Notes | 🟢 Good | 1.1 | 80% |
| Documents | 🟡 Partial | 1.1→1.4 | 70% |
| Global Search | ✅ Complete | 1.1 | 100% |
| Notifications & Activity | ✅ Complete | 1.1 | 100% |
| Better Lists (cross-cutting) | 🟢 Good | 1.1 | 85% |
| Permissions (cross-cutting) | 🟡 Partial | 1.1 | 55% |
| Team Management (Roster/Roles) | 🟡 Partial | 1.1 | 50% |
| Invitations | 🟡 Partial | 1.1 | 55% |
| Testing & CI (cross-cutting) | ✅ Complete | 1.1 | 100% |
| Backups & DR (cross-cutting, D4) | ✅ Complete (code+docs) | 1.1 | 100%¹ |
| Deal Analyzer / Underwriting | 🟡 Partial | 1.3 | 35% |
| Commercial Intelligence (Market/Owner/Property/Portfolio) | 🔴 Planned | 1.2 | 0% |
| Closing Center | 🔴 Planned | 1.4 | 0% |
| Automation & Campaigns | 🔴 Planned | 2.0 | 0% |
| AI Layer | 🔴 Planned | 2.0 | 0% |

¹ Backup/restore tooling is complete in code and documentation (six-stage pipeline, verified restore drill). Two **operational** follow-ups remain and are intentionally outside the codebase: provisioning the Cloudflare R2 bucket + credentials, and enabling the documented cron schedule. Until both are done, runs report 5/6 (off-site mirror pending).

## Release progress

| Version | Theme | Status |
|---|---|---|
| 1.0 | Foundation | ✅ Shipped |
| 1.1 | Operational Excellence | 🟡 ~82% (testing/CI/lists + D4 backups + permissions Slice 1 done; permissions Slice 2 + performance remain) |
| 1.2 | Commercial Intelligence | 🔴 Planned |
| 1.3 | Commercial Underwriting | 🟡 Foundation (~35%) |
| 1.4 | Closing Center | 🔴 Planned |
| 2.0 | Automation & AI | 🔴 Planned |

## Development workflow (every feature)

```
Roadmap → Architecture → Specification → Implementation → Testing → Documentation → Merge → Release
```
Nothing skips a step. See the [EMP lifecycle](./ENGINEERING_MASTER_PLAN.md#development-lifecycle).

## Top priorities right now
1. **1.1 Permissions Slice 2 (highest-priority engineering task):** Slice 1 (deletes, pipeline moves, team/invite management) is enforced + audited via `lib/permissions.ts` + `lib/authorize.ts`; extend enforcement to ordinary create/update, then finish Team Management + Invitations delivery.
2. **1.1 Testing depth:** unit tests for pure `lib/*`; lint in CI.
3. **1.1 Performance:** latency budgets for board + search; index review.

**Operational follow-ups (not engineering code — see [Operations → Backups](./OPERATIONS_ROADMAP.md)):** provision Cloudflare R2 bucket/credentials, store the backup passphrase off-host, and enable the documented cron schedule. (D4 backup/restore tooling itself is ✅ complete.)

## How to update this dashboard
- Change a module's Status/% when its roadmap scope moves (same PR as the change).
- Keep this table and [Module Roadmaps](./MODULE_ROADMAPS.md) consistent — they must never disagree.
- Re-review the whole table at the start of each release.

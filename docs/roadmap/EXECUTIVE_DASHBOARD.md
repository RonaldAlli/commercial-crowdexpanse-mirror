# Volume 10 — Executive Dashboard

> The single source of truth for "what state is each module in." Update this table whenever a module's status changes (part of the [Definition of Done](./ENGINEERING_MASTER_PLAN.md#definition-of-done)).
> **Last reviewed:** 2026-07-14. Percentages are engineering-judgment estimates of scope-complete against that module's roadmap.

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
| Permissions (cross-cutting) | 🟢 Good | 1.1 | 90% |
| Team Management (Roster/Roles/Lifecycle) | 🟢 Good | 1.1 | 85% |
| Invitations | 🟢 Good | 1.1 | 90% |
| Organization Settings | 🟢 Good | 1.1 | 90% |
| Communications / Email (cross-cutting) | 🟢 Good | 1.1 | 60% |
| Testing & CI (cross-cutting) | ✅ Complete | 1.1 | 100% |
| Backups & DR (cross-cutting, D4) | ✅ Complete (code+docs) | 1.1 | 100%¹ |
| Deal Analyzer / Underwriting | 🟡 Partial | 1.3 | 35% |
| Commercial Intelligence (Owner/Property/Market/Portfolio) | 🟡 In progress | 1.2 | 8% (Slice 1a — Owner + identity spine shipped) |
| Closing Center | 🔴 Planned | 1.4 | 0% |
| Automation & Campaigns | 🔴 Planned | 2.0 | 0% |
| AI Layer | 🔴 Planned | 2.0 | 0% |

¹ Backup/restore tooling is complete in code and documentation (six-stage pipeline, verified restore drill). Two **operational** follow-ups remain and are intentionally outside the codebase: provisioning the Cloudflare R2 bucket + credentials, and enabling the documented cron schedule. Until both are done, runs report 5/6 (off-site mirror pending).

## Release progress

| Version | Theme | Status |
|---|---|---|
| 1.0 | Foundation | ✅ Shipped |
| 1.1 | Operational Excellence | ✅ **Released — `v1.1.0`** (frozen on `release/1.1`). Testing/CI/lists + D4 backups + permissions Slices 1–2 + member lifecycle + invitation resend + org settings + email 3d-i/3d-ii + unit-test PQ-1 + lint-CI PQ-2 + perf PQ-3/PQ-4 all shipped — board p95 ~109→~43 ms; every path within budget. Password reset (3e) + relation search moved to 1.2. |
| 1.2 | Commercial Intelligence | 🟡 In progress — architecture locked ([Volume 12](./COMMERCIAL_INTELLIGENCE_ARCHITECTURE.md)); **Slice 1 Commit 1a shipped** (Owner entity + identity spine, deployed to prod). Next: 1a-2 merge/unmerge, then 1b ledger/projections |
| 1.3 | Commercial Underwriting | 🟡 Foundation (~35%) |
| 1.4 | Closing Center | 🔴 Planned |
| 2.0 | Automation & AI | 🔴 Planned |

## Development workflow (every feature)

```
Roadmap → Architecture → Specification → Implementation → Testing → Documentation → Merge → Release
```
Nothing skips a step. See the [EMP lifecycle](./ENGINEERING_MASTER_PLAN.md#development-lifecycle).

## Top priorities right now
1. **Version 1.2 — Commercial Intelligence (building the identity spine first):** architecture is locked ([Volume 12](./COMMERCIAL_INTELLIGENCE_ARCHITECTURE.md)) and **Slice 1 Commit 1a shipped** — the `Owner` entity, the authoritative/immutable `ExternalIdentifier` crosswalk, proposal-only identity resolution, and nullable Seller/Property links, deployed to production. Next: **1a-2** (reversible merge/unmerge), then **1b** (provenance ledger + typed projections).
2. **Carried into 1.2:** **password reset (Slice 3e)** on the messaging platform (closes D10), and **relation search** (Better Lists enrichment). Both reuse 1.1 platforms and are independent of the intelligence work.

*(Version 1.1 is released — `v1.1.0`, frozen on `release/1.1`. PQ-1/PQ-2/PQ-3/PQ-4 complete; CI runs Typecheck → Lint → Unit → E2E → Build as distinct blocking steps.)*

*(Invitation email delivery 3d-ii, email infrastructure 3d-i, org settings 3c, invitation resend 3b, member lifecycle 3a, and permissions Slices 1–2 are complete.)*

**Deferred from the email work (operational / later):** schedule the outbox drain (cron) for drainable kinds; bounce/complaint webhooks + an admin failed-send view; Resend/API transport.

**Operational follow-ups (not engineering code — see [Operations → Backups](./OPERATIONS_ROADMAP.md)):** provision Cloudflare R2 bucket/credentials, store the backup passphrase off-host, and enable the documented cron schedule. (D4 backup/restore tooling itself is ✅ complete.)

## How to update this dashboard
- Change a module's Status/% when its roadmap scope moves (same PR as the change).
- Keep this table and [Module Roadmaps](./MODULE_ROADMAPS.md) consistent — they must never disagree.
- Re-review the whole table at the start of each release.

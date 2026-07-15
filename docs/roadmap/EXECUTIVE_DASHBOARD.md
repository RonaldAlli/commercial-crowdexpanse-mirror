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
| Commercial Intelligence (Owner/Property/Market/Portfolio) | 🟡 In progress | 1.2 | 40% (**Slice 1 implementation complete** — foundation + Owner UI + linking + candidate review + refresh + merge/unmerge controls; Commit 1d-3b done, prod at 10 migrations). Merged/built/prod-DB-current, **not yet user-accessible** — awaiting frontend redeploy (D5) |
| Closing Center | 🔴 Planned | 1.4 | 0% |
| Automation & Campaigns | 🔴 Planned | 2.0 | 0% |
| AI Layer | 🔴 Planned | 2.0 | 0% |

¹ Backup/restore tooling is complete in code and documentation (six-stage pipeline, verified restore drill). Two **operational** follow-ups remain and are intentionally outside the codebase: provisioning the Cloudflare R2 bucket + credentials, and enabling the documented cron schedule. Until both are done, runs report 5/6 (off-site mirror pending).

## Release progress

| Version | Theme | Status |
|---|---|---|
| 1.0 | Foundation | ✅ Shipped |
| 1.1 | Operational Excellence | ✅ **Released — `v1.1.0`** (frozen on `release/1.1`). Testing/CI/lists + D4 backups + permissions Slices 1–2 + member lifecycle + invitation resend + org settings + email 3d-i/3d-ii + unit-test PQ-1 + lint-CI PQ-2 + perf PQ-3/PQ-4 all shipped — board p95 ~109→~43 ms; every path within budget. Password reset (3e) + relation search moved to 1.2. |
| 1.2 | Commercial Intelligence | 🟡 In progress — architecture locked ([Volume 12](./COMMERCIAL_INTELLIGENCE_ARCHITECTURE.md)); **Slice 1 implementation complete — final Commit 1d-3b merge/unmerge controls shipped** (1a/1a-2→1b→1c→1d-1→1d-2a→1d-2b→1d-3a→1d-3b; prod at 10 migrations). Slice 1 code merged/tested/built/prod-DB-current. ⚠️ Whole 1.2 UI **not yet user-accessible** — awaits frontend redeploy (root-owned `.next`, D5). Next: Slice 2 (Property Intelligence). |
| 1.3 | Commercial Underwriting | 🟡 Foundation (~35%) |
| 1.4 | Closing Center | 🔴 Planned |
| 2.0 | Automation & AI | 🔴 Planned |

## Development workflow (every feature)

```
Roadmap → Architecture → Specification → Implementation → Testing → Documentation → Merge → Release
```
Nothing skips a step. See the [EMP lifecycle](./ENGINEERING_MASTER_PLAN.md#development-lifecycle).

## Top priorities right now
1. **Version 1.2 — Commercial Intelligence (building the data pipeline):** architecture is locked ([Volume 12](./COMMERCIAL_INTELLIGENCE_ARCHITECTURE.md)); the headless foundation (identity 1a/1a-2 → `Observation → Signal → Projection` 1b → ingestion 1c) is shipped and deployed, and **Commit 1d-1 now makes it visible and usable**: the core Owner UI (nav, list with search, detail with per-field provenance shown Projected Value → Winning Signal → Signal History, create with duplicate warning, edit + override pins) built as a thin *consumer* — every mutation flows through the domain services, and the `OWNER` permission policy is enforced at its first call-sites. **Commit 1d-2a adds Seller/Property↔Owner linking** (link, atomic move A→B, unlink) — kept strictly separate from canonical identity (it edits only the operational FK, writing no Observation/Signal), plus a reusable open-redirect guard. Next: **1d-2b** — a standalone candidate-review queue (confirm/dismiss owner duplicates; candidate ≠ merge); then **1d-3** — refresh trigger/history + merge/unmerge controls.
2. **Carried into 1.2:** **password reset (Slice 3e)** on the messaging platform (closes D10), and **relation search** (Better Lists enrichment). Both reuse 1.1 platforms and are independent of the intelligence work.

*(Version 1.1 is released — `v1.1.0`, frozen on `release/1.1`. PQ-1/PQ-2/PQ-3/PQ-4 complete; CI runs Typecheck → Lint → Unit → E2E → Build as distinct blocking steps.)*

*(Invitation email delivery 3d-ii, email infrastructure 3d-i, org settings 3c, invitation resend 3b, member lifecycle 3a, and permissions Slices 1–2 are complete.)*

**Deferred from the email work (operational / later):** schedule the outbox drain (cron) for drainable kinds; bounce/complaint webhooks + an admin failed-send view; Resend/API transport.

**Operational follow-ups (not engineering code — see [Operations → Backups](./OPERATIONS_ROADMAP.md)):** provision Cloudflare R2 bucket/credentials, store the backup passphrase off-host, and enable the documented cron schedule. (D4 backup/restore tooling itself is ✅ complete.)

## How to update this dashboard
- Change a module's Status/% when its roadmap scope moves (same PR as the change).
- Keep this table and [Module Roadmaps](./MODULE_ROADMAPS.md) consistent — they must never disagree.
- Re-review the whole table at the start of each release.

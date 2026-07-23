# Launch Baseline v1.0 — CrowdExpanse Commercial

> A release snapshot, not a design. The reference point for **Version 1**. Everything after this is v1.x,
> not "still launching." Frozen 2026-07-23.

## Release identity

| | |
|---|---|
| Deployed commit | `3bcbab7` (main HEAD — deployed == HEAD, no drift) |
| Production release | `r…3bcbab771dd5` · build id `uYCl70sN-aGNKhmPVt6Mj` · swapped ✓ · smoke ok |
| Schema version | **33 migrations**, latest `20260723124740_add_acquisition_attribution` · "Database schema is up to date" |
| App | pm2 `crowdexpanse-commercial` → :3030 → nginx · `/api/health` 200 |
| Launch tags | `launch-b1-pipeline-surface-closed` · `launch-r1-seller-qualify` · `launch-r2-source-performance` |
| Data | single tenant `commercial-crowdexpanse` — 6,897 sellers, 9,641 opportunities/properties (real import; no test orgs) |

## Active features (operational)

- **Seller acquisition** — add seller (with required acquisition **channel** + optional campaign) and bulk **import** (ADMIN); imported opportunities enter the normal screens.
- **Qualification** — outreach-status control on the seller record (badge + select + promote hint).
- **Promotion** — qualified seller → opportunity, seeding the New-Opportunity form; attribution stamped on the opportunity, immutable.
- **Opportunities & stages** — legacy stage system (`lib/stage-policy*`), inline stage moves, role + closing gates.
- **Buyer matching** — on-demand generation + status management; confirming a match advances the opportunity.
- **Agreements** — AssignmentRecord lifecycle NOT_STARTED → DRAFTED → EXECUTED (ADMIN), fee snapshot on execute.
- **Closing** — per-opportunity Closing Center (checklist, escrow, financing, diligence) + cross-deal `/closing`.
- **Attribution** — three-layer (channel/campaign/eventKey) captured on manual + import paths, retained on every opportunity (Attribution Rule 1); shown on the opportunity detail.
- **Business intelligence** — `lib/business-intelligence/` five primitives; consumed by the **Source performance** screen (`/insights`): revenue / closed-won conversion / buyer coverage by channel, revenue by campaign, revenue by acquisition event.
- **Auth / tenancy** — signed-session auth, role-based `can()`, session-authoritative tenant scope (Authority Rule 1).

## Disabled / dormant (intentionally not in launch)

- **Slice-2 pipeline** — HTTP surface CLOSED: write `POST /api/pipeline/[id]/fact-operations` → 404, read `GET /api/pipeline/[id]` → 404, screen `/pipeline/[id]` → notFound. Libraries intact; re-enabled (with session-derived actor) only by the Opportunity Pipeline Migration Initiative.
- **Automation (D27)** — `crowdexpanse-automation` not running; `AUTOMATION_SCHEDULER_ENABLED="0"`. D27 remains Open (Monitoring).
- **Deferred metrics** — `daysToContractByChannel` (no authoritative contract timestamp), `confirmedMatchRateByChannel` (separate future primitive).

## Known deployment dependencies (configuration, not engineering)

- **Email** — `EMAIL_PROVIDER` unset → console transport (teammate **invitations & notifications do not send**); `APP_URL` defaults to `http://localhost:3030` (email links). To enable: set `EMAIL_PROVIDER=smtp` + `SMTP_HOST/PORT/USER/PASS` + production `APP_URL`. Required only if teammate invites / outbound email are in the initial release scope; the single-operator deal workflow does not depend on it.

## Launch acceptance evidence

- **B1** pipeline actor-spoofing closed — deployed, verified (all three pipeline surfaces → 404).
- **R1** qualify control on seller record — deployed, verified (card + select render).
- **R2** Source performance consumer + per-deal attribution — deployed, verified (5 BI tables render).
- **End-to-end workflow verified in production 2026-07-23** (throwaway org, cascade-cleaned, prod pristine): seller + source → qualify → promote → opportunity (attribution retained) → buyer match confirmed → assignment executed ($42,000) → Source performance shows $42,000 under `COMMERCIAL_BROKER`.
- Gates per change: `tsc 0 · unit ≥78 files 93.0% branch · e2e 57/57 · build:isolated`.

## Production verification date

**2026-07-23.** Launch status: **Ready** (one outstanding operational config item: SMTP + `APP_URL`, only if email is in initial scope).

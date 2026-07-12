# Volume 9 — Operations

> How the system is released, recovered, backed up, watched, and maintained. Current posture is single-VPS; this volume also sets the path to a more resilient setup.

## Current environment
- **Host:** single VPS. **App:** Next.js served by **pm2** (`crowdexpanse-commercial`, port **3030**) behind **Caddy** (TLS/reverse-proxy).
- **DB:** local **PostgreSQL 16** (`commercial_crowdexpanse`, role `commercial_app`).
- **Docs:** local filesystem (`UPLOAD_DIR`).
- **Remotes:** Gitea (`origin`/`gitea`) + GitHub mirror (`github`). CI on the GitHub mirror.

## Release Process
1. Feature branch → verify locally (`npm run typecheck`, `npm test` on `_test` DB, `npm run build:isolated`).
2. Fast-forward merge to `main`; push to **both** remotes.
3. CI (GitHub mirror) green.
4. Deploy: build on host (`build:isolated` until the `.next` chown is done — see [Tech Debt](./TECHNICAL_DEBT.md)), then pm2 reload.
5. Smoke-test the critical path; update the [Dashboard](./EXECUTIVE_DASHBOARD.md).

## Rollback
- **App:** pm2 keeps the previous build; `git checkout <prev tag>` + rebuild + `pm2 reload`. Keep the last known-good `.next` build dir.
- **DB:** restore from the latest backup (see below). **Blocked by:** no automated backups yet — highest-priority ops gap.
- **Principle:** every release note documents its rollback steps ([Release Plan](./RELEASE_PLAN.md#definition-of-done-release-level)).

## Backups — 🔴 gap (top priority)
- **Needed:** scheduled `pg_dump` of `commercial_crowdexpanse` to off-host storage; document retention; **periodic restore drill** (Testing Roadmap DR).
- **Documents:** `UPLOAD_DIR` must be backed up alongside the DB (metadata↔file consistency).

## Monitoring — 🟡 partial
- **Have:** `/api/health` endpoint.
- **Needed:** uptime check on `/api/health`; error logging/alerting; pm2 process alerts; DB connection/disk alerts; p95 latency tracking (ties to Performance).

## Incident Response
- **Define:** severity levels, on-call/owner, comms, and a written postmortem per incident.
- **Runbook (to write):** app down, DB down, disk full, bad deploy, data-integrity issue.
- Every incident → a regression test + a Tech Debt entry.

## Maintenance
- **Housekeeping (open):** one-time `sudo chown -R deploy:deploy .next` so plain `npm run build` works on host (until then `build:isolated`).
- Dependency updates (Next/Prisma) on a cadence, gated by CI.
- Postgres minor-version patching; disk/log rotation.

## Infrastructure roadmap
- **Near term:** automated backups + restore drill; uptime/error alerting.
- **Mid term:** managed Postgres; object storage for documents; a **staging** environment mirroring prod for release verification.
- **Longer term:** containerized deploy; blue/green or rolling deploys to remove the in-place-build risk.

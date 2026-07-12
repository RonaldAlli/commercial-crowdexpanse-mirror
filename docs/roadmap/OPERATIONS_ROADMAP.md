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
- **DB:** restore from the latest backup with `scripts/restore-verify.sh` (validates into the isolated verify DB first), then promote/point at the restored data. Backups exist (D4); **remaining:** enable scheduling + provision R2 so restores are guaranteed off-host.
- **Principle:** every release note documents its rollback steps ([Release Plan](./RELEASE_PLAN.md#definition-of-done-release-level)).

## Backups — 🟢 implemented (D4); scheduling + R2 creds pending
The backup system lives in `scripts/` and treats a backup as successful only after **six stages**: **Backup → Verify → Restore Test → Report → Retention → Off-site Mirror**. An un-restore-testable dump is never retained or shipped.

- **`scripts/backup.sh [daily|weekly|monthly|adhoc]`** — `pg_dump -Fc` (read-only on prod) + zstd document archive + manifest, **client-side encrypted (gpg AES-256)** before retention/mirror; tiered retention (daily=30, weekly=12, monthly=12); off-site mirror to a **dedicated Cloudflare R2 bucket** via rclone.
- **`scripts/restore-verify.sh [RUN_DIR]`** — decrypt → validate archive → restore into the **isolated `commercial_restore_verify` DB** → assert 13 key tables present/countable + count match → verify document hashes vs manifest. Hard **never-prod** guard.
- **`scripts/backup.sh check`** — freshness gate (fails if last full success > 26h); for monitoring.
- **Local layout:** `/opt/crowdexpanse/backups/commercial/<tier>/<stamp>/` (dirs `700`, files `600`).

### One-time setup (privileged / operational — NOT in code)
1. `sudo -u postgres createdb -O commercial_app commercial_restore_verify` (isolated restore DB). *(done)*
2. Create `.backup-passphrase` (`chmod 600`, gitignored) **and keep a copy OFF-HOST** — without it, R2 backups can't be decrypted after a host loss.
3. Provision a dedicated R2 bucket + set `R2_*` in `.env` (until then the mirror stage is SKIPPED and runs report 5/6).

### Scheduling (apply after review — deliberately NOT installed by the code)
```cron
30 3 * * *  /opt/crowdexpanse/commercial/scripts/backup.sh daily      # offset from deals' 03:00
0  4 * * 0  /opt/crowdexpanse/commercial/scripts/restore-verify.sh    # weekly standalone drill
*/30 * * * * /opt/crowdexpanse/commercial/scripts/backup.sh check || <alert>   # freshness monitor
```

- **Consistency note:** DB dump and document archive are captured in the same run, close together (small window; acceptable at current scale).

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

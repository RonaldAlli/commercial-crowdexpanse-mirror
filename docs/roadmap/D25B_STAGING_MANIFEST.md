# D25b · Staging Environment Manifest

> **Authoritative description of the D25b staging instance.** Written **before** provisioning (per the
> conditional authorization). Staging is a **disposable production clone for deployment rehearsal only** —
> NOT a second production service. Everything below is scoped so a staging failure **cannot** reach
> production. Companion to [Phase 1 Validation](./D25B_PHASE1_STAGING_VALIDATION.md) and the
> [D25b initiative](./D25B_HOST_MIGRATION_INITIATIVE.md).

---

## Identity

| Field | Value |
|---|---|
| **Purpose** | Deployment-engine rehearsal only (dry-run / forced-failure / rollback / recovery / normal deploy / smoke). No real users, no product traffic. |
| **Host** | `crowdexpanse-hub` (same host as production; instance isolated below) |
| **PM2 process** | `crowdexpanse-commercial-staging` (distinct from prod `crowdexpanse-commercial`) |
| **Directory** | `/opt/crowdexpanse/staging-commercial` (fresh clone of `main`; prod is `/opt/crowdexpanse/commercial`, untouched) |
| **Port** | **3040**, bound to **127.0.0.1 only** (`next start -p 3040 -H 127.0.0.1`) — prod is 3030 |
| **Base commit** | `main` @ provisioning (recorded in `release.json`) |
| **`.next` model** | **symlink → `releases/<init>`** (pre-migrated, so the rehearsal exercises the steady-state engine) |

## Separation from production (the isolation contract)

**Runtime identity**
- Separate PM2 name (`…-staging`) ⇒ separate PID (`~/.pm2/pids/crowdexpanse-commercial-staging-*.pid`) and
  separate logs (`~/.pm2/logs/crowdexpanse-commercial-staging-{out,error}.log`).
- Separate app directory + separate `.next`/`releases/`/`deploy-history/` (no shared writable paths with prod).
- **`pm2 save` is NOT run** ⇒ staging is absent from the resurrect list; a reboot does not start it.

**Data**
- Database: **`commercial_crowdexpanse_test` only** (127.0.0.1:5432) — the isolated test DB. Never the prod DB.
- Uploads/storage: **`/tmp/commercial-staging-uploads` only** (`UPLOAD_DIR`) — staging-only, never prod uploads.
- No production queues / webhooks / cron / integrations exist in this app (verified: no Redis/queue/cron in
  `app`,`lib`); email defaults to **`console`** (EMAIL_PROVIDER unset) ⇒ **no real mail is ever sent**.

**Networking**
- Bound to **127.0.0.1:3040** only ⇒ not reachable off-host. No nginx/reverse-proxy route added; no public DNS.
- Access via SSH/localhost on the host only.

**Disposability**
- No persistent state required; the test DB and `/tmp` uploads are throwaway.
- No production rollback depends on staging. Staging can be destroyed at any time.

## Environment (`/opt/crowdexpanse/staging-commercial/.env`)

```
NODE_ENV=production
DATABASE_URL="postgresql://commercial_app:***@127.0.0.1:5432/commercial_crowdexpanse_test"   # test DB only
SESSION_SECRET="staging-dummy-secret-not-production"
UPLOAD_DIR="/tmp/commercial-staging-uploads"                                                   # staging-only
APP_URL="http://127.0.0.1:3040"
EMAIL_PROVIDER="console"                                                                       # no real mail
ADMIN_EMAIL="staging-admin@localhost"
ADMIN_PASSWORD="staging-only-not-production"
```

## Isolation proof (MUST pass before any rehearsal)

1. Staging healthy on 3040 **and** prod healthy on 3030 (baseline captured: prod pid + `restart_time`).
2. **Stop staging** → prod remains healthy; prod pid + `restart_time` unchanged.
3. **Kill/stop the staging PM2 process** → prod unaffected.
4. Staging writes only to test locations (DB = `…_test`; uploads = `/tmp/commercial-staging-uploads`).
5. Prod metrics unchanged across all staging operations (pid, `restart_time`, uptime not reset).

Results are recorded in the Phase 1 validation doc / rehearsal report. **Only after this proof passes does
the rehearsal begin — and only after a separate review.**

## Destroy procedure (one-shot, reversible-by-nonexistence)

```
pm2 delete crowdexpanse-commercial-staging      # remove the process (do NOT pm2 save)
rm -rf /opt/crowdexpanse/staging-commercial      # remove the entire clone (dir, releases/, .next, deploy-history/)
rm -rf /tmp/commercial-staging-uploads           # remove staging uploads
# test DB is shared/managed by test infra — left as-is (never the prod DB)
```
Production (`commercial/`, `crowdexpanse-commercial`, :3030, prod DB) is untouched by any of the above.

---
*Provisioning follows this manifest exactly. If provisioning must deviate, this manifest is updated first.*

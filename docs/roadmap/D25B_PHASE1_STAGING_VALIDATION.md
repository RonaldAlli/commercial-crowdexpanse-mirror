# D25b · Phase 1 — Staging Environment Validation

> **Purpose:** verify a suitable staging environment EXISTS and is isolated **before** the rehearsal
> ([D25B_HOST_MIGRATION_INITIATIVE.md](./D25B_HOST_MIGRATION_INITIATIVE.md) §4) is executed. Prerequisites
> are verified, not assumed. **The rehearsal does not begin until this phase passes.**

**Validation performed:** 2026-07-20 · read-only probes of the host (no changes made).

---

## 1. Findings (measured, read-only)

| Fact | Observed |
|---|---|
| Host | `crowdexpanse-hub` — **this IS the production host** |
| Live prod process | pm2 `crowdexpanse-commercial` (id 3) **online**, Next 14.2.20, port **3030**, ↺96 (D24 recycle) |
| Other prod apps here | `breadbasketfarms-web`, `crowdexpanse-deals`, `dealflow` (all live) |
| Prod checkout | `/opt/crowdexpanse/commercial` @ `main f4af2d6`; `.next` = **173 MB real directory** (pre-migration, as expected) |
| Deployment Engine present | ✅ `scripts/deploy/{deploy-engine,ops-real,deploy}.mjs` in the checkout |
| Node / pm2 | Node **v20.20.2**, pm2 **6.0.14** |
| Test DB (isolated) | `commercial_crowdexpanse_test` @ 127.0.0.1:5432 (`.env.test`, `assertTestDatabase` guard) |
| Disk free | **31 GB** free on `/` (173 MB/release → ample) |
| Ports in use | 53, 80, 443, 2222, 2223, 3007, 3010, 3020, 3025, **3030**, 3100, 5432, 6379, 8080, … |
| **Dedicated staging environment** | **NONE.** `/opt/crowdexpanse` has only prod apps, `backups/`, and git worktrees — no staging host/dir |

## 2. Validation criteria vs. reality

| # | Required for a suitable staging environment | Status |
|---|---|---|
| 1 | Staging host identified and accessible | ❌ none identified (only the production host) |
| 2 | Config sufficiently mirrors prod (pm2, Node, paths, permissions) | ⚠️ host tooling matches (Node 20.20.2, pm2 6.0.14, `deploy` user) but **no staging instance exists to configure** |
| 3 | A disposable copy of the application installed | ❌ not installed |
| 4 | The Deployment Engine present | ✅ present in the repo (would be included in a copy) |
| 5 | Rollback assets can be created | ⚠️ possible in principle (disk + engine), but **no environment to create them in** |
| 6 | Isolated so failures cannot affect production | ❌ not established — no isolated instance exists |

## 3. Verdict

**STAGING ABSENT → Phase 1 does NOT pass. The §4 rehearsal is BLOCKED and must not begin.**

Running the rehearsal in `/opt/crowdexpanse/commercial` is **prohibited** — that is the live production
checkout serving port 3030; a forced-failure/rollback drill there would be a production incident, which is
the exact opposite of the D25b discipline.

## 4. Proposal — provision an isolated, disposable staging instance (requires authorization)

An isolated staging instance can be stood up **on this host** without any path to production, using the
engine's existing `--app-dir/--pm2-app/--port` parameters and the already-isolated test DB. Nothing below
touches prod's directory (`commercial/`), process (`crowdexpanse-commercial`), port (`3030`), or DB.

| Dimension | Production (untouched) | Proposed staging (disposable) |
|---|---|---|
| Directory | `/opt/crowdexpanse/commercial` | `/opt/crowdexpanse/staging-commercial` (fresh copy of `main`) |
| pm2 process | `crowdexpanse-commercial` | `crowdexpanse-commercial-staging` |
| Port | 3030 | **3040** (verified free) |
| Database | prod DB | `commercial_crowdexpanse_test` (isolated, `assertTestDatabase`-guarded) |
| `.next` model | real dir (pre-migration) | **symlink+`releases/`** (pre-migrated, so the rehearsal exercises the steady-state engine) |

**Provisioning steps (when authorized):**
1. Copy the repo at `main` → `staging-commercial` (or `git clone` the local repo); install deps; write a
   staging `.env` pointing at the **test DB** and port **3040**.
2. Build once into `releases/<init>`; set `.next` → symlink (put staging directly in the post-migration
   model); write `.release-id` + `release.json`.
3. Start pm2 `crowdexpanse-commercial-staging` on 3040; confirm health.
4. **Isolation proof (must pass before any drill):** staging config references only 3040 + test DB +
   `staging-commercial/`; a deliberate staging process kill leaves `crowdexpanse-commercial` (3030)
   untouched; no shared writable paths with prod; test-DB guard active.

Only after the instance is up **and** the isolation proof passes does Phase 1 pass — then the §4 rehearsal
runs against `--app-dir=/opt/crowdexpanse/staging-commercial --pm2-app=crowdexpanse-commercial-staging
--port=3040`.

## 5. Stop point

**No staging environment exists; nothing was provisioned. This is a read-only validation.** Provisioning
the disposable staging instance (§4) adds a pm2 process + port on the production host and therefore needs
explicit authorization before I proceed. **I will not begin the rehearsal, and will not provision staging,
until authorized.**

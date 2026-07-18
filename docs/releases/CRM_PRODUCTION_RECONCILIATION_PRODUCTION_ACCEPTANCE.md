# CRM Production Reconciliation — Production Acceptance Package

> **Status: ✅ FOUNDER PRODUCTION ACCEPTED — 2026-07-18** (Founder: Ronald Delroy Anthony
> Allicock). The Founder-accepted CRM reconciliation branch (with security remediations) was
> merged to `main` and **deployed to production** through a controlled build, and the final
> ownership defect (D23) has been resolved. Clean `main` now reproduces the live application. The
> Phase 2.0.1 Automation rollout **remains paused** (D19 still open); the executor was **not**
> started.
>
> **Acceptance record:** Founder Ronald Delroy Anthony Allicock · 2026-07-18 · deployed
> implementation tip `c5f46f9` · production build `YPHm2Nw65jWb7JlF7eLUn` · backup
> `20260718-041113Z` · DB 30 migrations, no drift · **D18 closed · D20 closed · D21 resolved ·
> D22 resolved · D23 resolved · D19 still open**. This acceptance applies **only** to the CRM
> production reconciliation; it does **not** authorize Automation.
>
> **Companions:** [CRM Reconciliation Acceptance](./CRM_PRODUCTION_RECONCILIATION_ACCEPTANCE.md) ·
> [CRM Operations Boundary](../architecture/CRM_OPERATIONS_BOUNDARY.md) ·
> [ADR-0006](../architecture/adr/ADR-0006-CRM-IMPORT-FILE-PARSER.md).

---

## 1. Deployment summary

| Item | Value |
|---|---|
| Founder-accepted branch tip | `32f3704` (accepted 2026-07-18) |
| Merged `main` tip (FF) | `c5f46f9` (+ this doc commit) — local = Gitea = GitHub |
| Merge type | **strict fast-forward** (no merge commit, no squash, no rebase) |
| Production build ID | **`YPHm2Nw65jWb7JlF7eLUn`** (was `fWqzJm1Ca_-dscQZVtMP5`) |
| Pre-deploy backup | **`20260718-041113Z`** — restore-verified (13 tables, counts MATCH, db_sha `d973acd7…`) |
| Production migrations | **30** (unchanged — 28–30 already live; **none re-applied**) |
| Automation | **absent / stopped** (unchanged) |

---

## 2. Migration count & checksums

30 migrations, all `finished`, 0 rolled-back/unfinished, `prisma migrate status` = up to date (no
drift). The 3 CRM migrations' file `sha256` == DB `checksum` (verified pre- and post-deploy):
`add_owner_contacts e3755758…`, `add_contact_operations d6b93165…`, `add_opportunity_diligence
d3da49b3…`. **Migrations 28–30 were NOT re-applied** — they were already live; the deploy carried
only code + dependency changes.

## 3. Dependency reconciliation & `xlsx` removal proof

- `package.json` / `package-lock.json` no longer declare `xlsx`.
- The stale extraneous `node_modules/xlsx` directory was removed; **`npm ls xlsx` → empty**.
- `prisma generate` was re-run against the merged 30-migration schema; the generated client
  contains the CRM fields (`outreachStatus`, `OpportunityDiligenceItem`, …).

## 4. Security verification (production, bounded/non-destructive)

- **Organization isolation:** the 2 historical prod import-job files carry **no** `organizationId`;
  the deployed `listLeadImportJobs(orgId)` returns **0** for them (fail closed); the public
  projection leaks **no** absolute paths; `getLeadImportJob` rejects id traversal → `null`.
- **Import parser:** the deployed importer does **not** support `.xlsx`/`.xls` and rejects them
  explicitly; CSV/TSV/TXT/JSON only, with pre-parse size + row/column/cell limits (ADR-0006).
- **Access:** import remains **ADMIN-only** (`requireRole(UserRole.ADMIN)`).
- **No unsafe files:** **0** `.xlsx`/`.xls` retained in the job dir; no lingering upload files.
- No customer data was exposed, altered, or created during verification.

## 5. CRM smoke tests (production)

Web health `ok`; `/login` 200; `/dashboard`, `/opportunities`, `/closing`, **`/contacts`**,
**`/settings/imports`**, **`/analyzer/atm-wholesale`**, `/sellers`, `/owners`, `/api/automation/health`
all return 307 (auth redirect) — **no 500s**. No restart loop (stable uptime, one restart).

## 6. Frozen-architecture & automation-inactive verification

- Frozen V1.3/V1.4 kernel byte-unchanged vs `v1.4.0` (`lib/analysis.ts`, `lib/closing.ts`,
  `lib/transaction-dashboard.ts`); automation spine byte-unchanged vs `07add1e`.
- Automation: `automation_jobs` 0, `automation_executions` 0, AUTOMATION `ActivityLog` 0; the
  `crowdexpanse-automation` process is **absent** (never started). Migration 27 intact.
- Frozen refs unmoved: `release/1.3` `d341c0a`, `release/1.4` `ece38aa`, `v1.3.0` `bca39f4`,
  `v1.4.0` `c1133ad`. D15 untouched.

## 7. Repository ⇄ production reconciliation (D18 closed)

| Component | Git `main` | Production | Result |
|---|---|---|---|
| Source HEAD | `c5f46f9` | `c5f46f9` | **match** |
| Working tree | clean | clean | **match** |
| Migrations | 30 | 30 applied | up to date |
| Dependencies (`xlsx`) | absent | absent | **match** |
| Web build | merged source | `YPHm2Nw65jWb7JlF7eLUn` | recorded |
| Automation | accepted-but-paused | absent/stopped | unchanged |
| Frozen refs | unchanged | unchanged | **match** |

A clean deployment from `main` now reproduces production. **D18 is closed.**

## 8. Production working-tree cleanliness & incidents/anomalies

- `git status` on the prod checkout is **clean** at `c5f46f9`.
- **Anomaly (worked around, no impact):** an external build had left **4 root-owned paths** in the
  working tree (`prisma/migrations/20260717134500_add_opportunity_diligence/`,
  `app/(workspace)/settings/imports/` + its 2 files) — a **re-occurrence of D5**. `git reset --hard`
  could not unlink them. Resolved without `sudo` and without altering content: `git reset --mixed`
  (moves HEAD+index, no working-tree unlink) + in-place content overwrites of the two world-writable
  files with the `c5f46f9` blobs. The working tree is content-clean and git-clean; the affected
  files' **content matches `main` byte-for-byte**. The lingering **root ownership** is cosmetic for
  git but is recorded as re-opened D5 — a `sudo chown -R deploy:deploy` is recommended to prevent
  future build/git friction. `.next` was deploy-owned (0 root files), so the build was unaffected.
- The quarantined earlier `reset --hard` attempt left the 2 deploy-owned migration dirs re-created
  cleanly; the root-owned migration dir's content is byte-identical to `main`.
- The web app was restarted **once** (planned deploy); no restart loop.

## 9. Rollback readiness

- **Backup:** `20260718-041113Z` (restore-verified) available for DR.
- **Prior build:** `fWqzJm1Ca_-dscQZVtMP5` (web-code rollback target).
- **Preferred rollback:** web-code only (`git checkout` prior build + rebuild + restart), **retaining
  the additive schema + data** (migrations 28–30 are live; no new migration was applied, so migration
  rollback is neither needed nor authorized). Two preservation archives of the pre-deploy working
  tree exist in the reconciliation scratch dir.
- **Rollback triggers:** login failure · 500s · org-scope violation · import-metadata leakage ·
  Excel not rejected · Prisma client/schema mismatch · Underwriting/Closing/PAID regression ·
  repeated PM2 restart · unreconcilable source · migration drift. None observed.

## 10. What remains

- **D19 (automation runtime launch blocker) — STILL OPEN.** Not touched here; it continues to block
  the Automation dark start. Automation remains paused.
- **D23 (root-owned working-tree paths) — RESOLVED 2026-07-18.** An operator ran a surgical `sudo
  chown -R deploy:deploy` on the two affected dirs (the app repo only — not `/opt/crowdexpanse/backups`,
  `/etc`, `/var`, TLS, or other apps); all 4 paths are now `deploy:deploy`, **0 non-deploy paths**
  remain. Verified: git clean at `e2aab35`, tracked content + migration checksums unchanged, build
  ID unchanged (no rebuild), web healthy, DB 30/no-drift, CRM counts intact, automation absent.
  Permissions normalized per-path (world-writable `666`→`644`, `777`→`755`; secrets stay `600`) —
  **0 world-writable paths** remain. **Recurrence prevention:** a read-only source-ownership guard
  (`scripts/lib/ownership-guard.mjs` + `scripts/predeploy-check.mjs`, unit-tested) now fails the
  build if any repo source path is not owned by the build user — it never runs `chown`/`sudo`.
  Standing rule (D5/D23): builds/Prisma/deps/git/app-file-creation must run as **deploy**, never root.
- The 8 pre-existing platform `npm audit` advisories (Next.js image opt., etc.) are unchanged from
  the `v1.4.0` baseline — **not** introduced by this branch; tracked as separate upgrade debt.

---

*Status: FOUNDER PRODUCTION ACCEPTED — 2026-07-18 (Ronald Delroy Anthony Allicock). CRM
reconciliation only. Automation remains paused; Phase 2.0.1 does not resume until D19 is resolved
and the Founder authorizes it.*

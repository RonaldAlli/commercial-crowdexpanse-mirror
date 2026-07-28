# Runbook — Governance Operational Tooling

Three fail-closed shell controls that turn the most valuable manual BE-2 checks into reusable
commands: **merge verification**, a **guarded migration deploy**, and a **post-deploy monitor**.

- `scripts/diag/verify-merge.sh` — prove a branch is really merged and live on `main`.
- `scripts/db/migrate-deploy-guarded.sh` — refuse `prisma migrate deploy` unless it is provably safe.
- `scripts/diag/post-deploy-monitor.sh` — watch health / restarts / errors / a DB fact after deploy.

Shared design principles:

- **Fail closed.** Every tool exits non-zero with a precise report on any failed check. Exit `2`
  means a usage error; `1` means a check failed; `0` means all required checks passed.
- **Read-only where it counts.** `verify-merge` and `post-deploy-monitor` mutate nothing.
  `migrate-deploy-guarded` is the only one that can change state, and only after all guards pass.
- **No secrets in output.** The Gitea token, the DB password, and the full `DATABASE_URL` are
  never printed. Only redacted identifiers (DB name, host) appear.
- **Testability seams double as safety.** Each external dependency (git, Gitea API, prisma,
  curl, pm2, psql) is injectable via a documented env var, which is how the shell tests exercise
  failure paths without touching production. In normal use you pass nothing and get the real tool.

Run `<script> --help` for the full option list.

---

## 1. `verify-merge.sh` — merge verification

Confirms, for a branch that should be merged:

1. a Gitea PR exists for the branch → base, and it is **merged**;
2. the expected commit is an **ancestor of `origin/<base>`**;
3. Gitea (`origin`), the GitHub mirror (`github`), and the local base ref **all agree**;
4. the Gitea API's live head of `<base>` matches `origin/<base>` (fetch not stale);
5. required files / content markers are **present on `<base>`**;
6. the working tree has **no tracked modifications**;
7. optional read-only production-state assertions **remain unchanged**.

```sh
scripts/diag/verify-merge.sh \
  --branch docs/be-2-operational-closeout \
  --expected-commit e680b63 \
  --base main \
  --require-file docs/business/evolution/be-2/ACCEPTANCE_REPORT.md \
  --require-marker docs/business/evolution/RELEASE_HISTORY.md:BE-2
```

Notes:
- Uses the read-only Gitea token from `~/.config/crowdexpanse/gitea.env` (see
  `GITEA_API_ACCESS_FOR_CLAUDE.md`). Pass `--skip-gitea-api` to run git-only (emits a WARN; the
  PR-merged check is then UNVERIFIED — use only when the API is unreachable).
- Untracked files are **reported but not fatal** by default, because the production host always
  carries build artifacts (`.next*`). Pass `--strict-untracked` in a clean CI checkout to make
  untracked files a failure.
- `--prod-state-cmd '<read-only cmd>' --prod-state-expect '<value>'` (repeatable pair) compares a
  command's trimmed stdout to an expected value — use it to assert e.g. a health status or a PM2
  state is unchanged. Supply only read-only commands.

## 2. `migrate-deploy-guarded.sh` — guarded migration deploy

Refuses to run `prisma migrate deploy` unless **all** hold:

1. the DB name resolved from `DATABASE_URL` **exactly matches** `--expected-db`;
2. the set of pending migrations **exactly matches** the supplied allow-list (no unexpected, none missing);
3. `--backup-evidence` names a file that **exists, is readable, and is non-empty**;
4. `--production-confirm` is present and **equals `--expected-db`** (required only for a real deploy).

```sh
# Inspect first — no changes:
scripts/db/migrate-deploy-guarded.sh \
  --expected-db commercial \
  --allow-migration 20260728_add_foo \
  --backup-evidence /opt/crowdexpanse/backups/commercial/adhoc-XXXX/manifest \
  --verify-only

# Then, after a fresh backup, actually deploy:
scripts/db/migrate-deploy-guarded.sh \
  --expected-db commercial \
  --allow-migration 20260728_add_foo \
  --backup-evidence /opt/crowdexpanse/backups/commercial/adhoc-XXXX/manifest \
  --production-confirm commercial
```

Notes:
- Always run `--verify-only` first and read the reported pending set; then copy those exact names
  into `--allow-migration` / `--allow-list`.
- Produce backup evidence with `scripts/backup.sh adhoc` (restore-verified) and point
  `--backup-evidence` at a real artifact from that run.
- The DB password and full connection string are never printed — only the DB name and host.

## 3. `post-deploy-monitor.sh` — post-deploy monitor

Samples, over a bounded window, any subset of: HTTP health, PM2 restart-count delta, new
error-log activity, and a DB row-count assertion. Emits a compact evidence report and exits
non-zero on a stop condition (health failures over tolerance, a restart loop, error growth over
threshold, or a failed DB assertion).

```sh
scripts/diag/post-deploy-monitor.sh \
  --health-url https://<host>/api/health --expected-status 200 \
  --pm2-name crowdexpanse-commercial --max-restarts 0 \
  --duration 120 --interval 10 \
  --error-log /home/deploy/.crowdexpanse-health.log \
  --db-query "select count(*) from organizations" --expected-rows 1
```

Notes:
- `--samples N` overrides `--duration`/`--interval` for a fixed number of samples (no trailing sleep).
- `--max-new-errors` defaults to `-1` (error-log growth is advisory); set it to make growth a
  stop condition.
- `DATABASE_URL` is read lazily only when `--db-query` is used, and is never printed.

---

## Tests

```sh
npm run test:governance-tooling          # or: bash scripts/diag/tests/governance-tooling.test.sh
```

The harness builds real git fixtures for `verify-merge` and stubs prisma/curl/pm2/psql for the
other two, asserting exit codes for each required failure case (wrong target DB, unexpected
pending migration, missing backup evidence, merge not found, branch not merged, health failure,
restart loop, unexpected DB rows) plus a passing baseline per tool.

Static checks: `bash -n <script>` for each (shellcheck is not installed on this host). The tools
are shell + docs only; they do not affect `next lint` / `tsc`.

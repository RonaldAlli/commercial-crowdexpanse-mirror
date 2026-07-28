#!/usr/bin/env bash
# migrate-deploy-guarded.sh — fail-closed wrapper around `prisma migrate deploy` (BE-2 governance tooling).
#
# Purpose: encode the manual pre-migration safety checks BE-2 performed by hand into a reusable
# guard. It REFUSES to run `prisma migrate deploy` unless the target DB, the exact set of pending
# migrations, backup evidence, and an explicit production confirmation all check out.
#
# Refuses unless ALL hold:
#   1. resolved DB name (from DATABASE_URL) EXACTLY matches --expected-db
#   2. the set of pending migrations EXACTLY matches the supplied allow-list (no unexpected, none missing)
#   3. backup evidence file is supplied, exists, is readable, and is non-empty
#   4. explicit production confirmation is present (--production-confirm must equal --expected-db)
#
# Modes: default = run deploy after checks pass. --verify-only / --dry-run = run every check and
#        print what WOULD run, but NEVER invoke deploy.
#
# Secret hygiene: the DATABASE_URL password and full connection string are NEVER logged. Only the
# resolved database name (and host, redacted) are shown.
#
# Exit: 0 = checks passed (and, unless dry-run, deploy succeeded). Nonzero = refused or deploy failed.
#       2 = usage error.
#
# Usage:
#   scripts/db/migrate-deploy-guarded.sh \
#     --expected-db commercial \
#     --allow-migration 20260728_add_foo \
#     --backup-evidence /opt/crowdexpanse/backups/commercial/adhoc-XXXX/manifest.json \
#     --production-confirm commercial
#   # inspect only, no deploy:
#   scripts/db/migrate-deploy-guarded.sh --expected-db commercial --allow-migration 20260728_add_foo \
#     --backup-evidence ./evidence.txt --verify-only
#
# Options:
#   --expected-db <name>        (required) DB name the resolved DATABASE_URL MUST point at.
#   --allow-migration <name>    allowed pending migration (repeatable).
#   --allow-list <file>         file with one allowed migration name per line (# comments ok).
#   --backup-evidence <path>    (required) readable, non-empty file proving a fresh backup exists.
#   --production-confirm <s>    explicit confirmation; MUST equal --expected-db to run a real deploy.
#   --env-file <path>           env file to source DATABASE_URL from (default: <app-dir>/.env).
#   --app-dir <path>            app directory (default: /opt/crowdexpanse/commercial).
#   --verify-only | --dry-run   run all checks, print plan, do NOT deploy.
#   -h|--help                   this help.
#
# Testability seams (env overrides; safe in prod, used by shell tests):
#   MIGRATE_STATUS_CMD  command printing `prisma migrate status` style output (default: npx prisma migrate status).
#   MIGRATE_DEPLOY_CMD  command running the deploy (default: npx prisma migrate deploy).
#   DATABASE_URL        may be provided directly instead of via --env-file.
set -euo pipefail

APP_DIR="${APP_DIR:-/opt/crowdexpanse/commercial}"
ENV_FILE=""
EXPECTED_DB=""
BACKUP_EVIDENCE=""
PROD_CONFIRM=""
DRY_RUN=0
ALLOW=()

ts() { date -u +%Y-%m-%dT%H:%M:%SZ; }
log()  { echo "[migrate-guard] $(ts) $*" >&2; }
die()  { echo "[migrate-guard] $(ts) REFUSED: $*" >&2; exit 1; }
usage_err() { echo "[migrate-guard] usage error: $*" >&2; exit 2; }

while [ $# -gt 0 ]; do
  case "$1" in
    --expected-db)        EXPECTED_DB="${2:-}"; shift 2 ;;
    --allow-migration)    ALLOW+=("${2:-}"); shift 2 ;;
    --allow-list)         ALLOW_LIST_FILE="${2:-}"; shift 2 ;;
    --backup-evidence)    BACKUP_EVIDENCE="${2:-}"; shift 2 ;;
    --production-confirm) PROD_CONFIRM="${2:-}"; shift 2 ;;
    --env-file)           ENV_FILE="${2:-}"; shift 2 ;;
    --app-dir)            APP_DIR="${2:-}"; shift 2 ;;
    --verify-only|--dry-run) DRY_RUN=1; shift ;;
    -h|--help)            sed -n '2,60p' "$0"; exit 0 ;;
    *) usage_err "unknown argument: $1" ;;
  esac
done

[ -n "$EXPECTED_DB" ]      || usage_err "--expected-db is required"
[ -n "$BACKUP_EVIDENCE" ]  || usage_err "--backup-evidence is required"

# Load allow-list file entries (if any) into ALLOW.
if [ -n "${ALLOW_LIST_FILE:-}" ]; then
  [ -r "$ALLOW_LIST_FILE" ] || die "allow-list file not readable: $ALLOW_LIST_FILE"
  while IFS= read -r line; do
    line="${line%%#*}"; line="$(echo "$line" | tr -d '[:space:]')"
    [ -n "$line" ] && ALLOW+=("$line")
  done < "$ALLOW_LIST_FILE"
fi

# --- resolve DATABASE_URL (never printed) -------------------------------------
if [ -z "${DATABASE_URL:-}" ]; then
  [ -z "$ENV_FILE" ] && ENV_FILE="$APP_DIR/.env"
  [ -r "$ENV_FILE" ] || die "cannot read env file '$ENV_FILE' and DATABASE_URL not set"
  # extract only DATABASE_URL, without exporting the rest of the file
  db_line="$(grep -E '^DATABASE_URL=' "$ENV_FILE" | tail -1 || true)"
  [ -n "$db_line" ] || die "DATABASE_URL not found in $ENV_FILE"
  DATABASE_URL="${db_line#DATABASE_URL=}"
  DATABASE_URL="${DATABASE_URL%\"}"; DATABASE_URL="${DATABASE_URL#\"}"
fi
[ -n "${DATABASE_URL:-}" ] || die "DATABASE_URL is empty"

# Parse DB name + host WITHOUT echoing credentials. Strip scheme+creds, then path/query.
resolve_db_name() {
  python3 -c "
import sys
from urllib.parse import urlparse
u=urlparse(sys.argv[1])
print((u.path or '/').lstrip('/').split('?')[0])
" "$DATABASE_URL"
}
resolve_db_host() {
  python3 -c "
import sys
from urllib.parse import urlparse
u=urlparse(sys.argv[1])
print(u.hostname or '?')
" "$DATABASE_URL"
}
RESOLVED_DB="$(resolve_db_name)"
RESOLVED_HOST="$(resolve_db_host)"
log "resolved target: db='${RESOLVED_DB}' host='${RESOLVED_HOST}' (connection string redacted)"

# ============================ CHECK 1: DB name ================================
if [ "$RESOLVED_DB" = "$EXPECTED_DB" ]; then
  log "check 1 OK: resolved DB '$RESOLVED_DB' matches expected"
else
  die "check 1 FAILED: resolved DB '$RESOLVED_DB' != expected '$EXPECTED_DB'"
fi

# ============================ CHECK 2: pending set ============================
status_cmd="${MIGRATE_STATUS_CMD:-npx prisma migrate status}"
status_out="$(cd "$APP_DIR" 2>/dev/null; bash -c "$status_cmd" 2>&1 || true)"
# Parse pending migration names from prisma-style output.
mapfile -t PENDING < <(printf '%s\n' "$status_out" | awk '
  /have not yet been applied/ {grab=1; next}
  /To apply migrations|migrate deploy|Database schema is up to date/ {grab=0}
  grab {
    line=$0; gsub(/^[[:space:]]+|[[:space:]]+$/,"",line);
    if (line ~ /^[0-9A-Za-z._-]+$/) print line;
  }')

# Build sorted unique sets for comparison.
allow_sorted="$(printf '%s\n' "${ALLOW[@]:-}" | sed '/^$/d' | sort -u)"
pending_sorted="$(printf '%s\n' "${PENDING[@]:-}" | sed '/^$/d' | sort -u)"
unexpected="$(comm -23 <(printf '%s\n' "$pending_sorted") <(printf '%s\n' "$allow_sorted") | sed '/^$/d')"
missing="$(comm -13 <(printf '%s\n' "$pending_sorted") <(printf '%s\n' "$allow_sorted") | sed '/^$/d')"

log "pending migrations detected: $(printf '%s' "${pending_sorted:-<none>}" | tr '\n' ' ')"
log "allow-list:                  $(printf '%s' "${allow_sorted:-<none>}" | tr '\n' ' ')"
if [ -n "$unexpected" ]; then
  die "check 2 FAILED: unexpected pending migration(s) not in allow-list: $(printf '%s' "$unexpected" | tr '\n' ' ')"
fi
if [ -n "$missing" ]; then
  die "check 2 FAILED: allow-list contains migration(s) that are not pending: $(printf '%s' "$missing" | tr '\n' ' ')"
fi
log "check 2 OK: pending set exactly matches allow-list"

# ============================ CHECK 3: backup evidence =======================
if [ ! -e "$BACKUP_EVIDENCE" ]; then
  die "check 3 FAILED: backup evidence '$BACKUP_EVIDENCE' does not exist"
elif [ ! -r "$BACKUP_EVIDENCE" ]; then
  die "check 3 FAILED: backup evidence '$BACKUP_EVIDENCE' not readable"
elif [ ! -s "$BACKUP_EVIDENCE" ]; then
  die "check 3 FAILED: backup evidence '$BACKUP_EVIDENCE' is empty"
fi
log "check 3 OK: backup evidence present ($(wc -c < "$BACKUP_EVIDENCE" | tr -d ' ') bytes)"

# ============================ CHECK 4: production confirm =====================
if [ "$DRY_RUN" -eq 1 ]; then
  log "check 4 SKIPPED for verify-only/dry-run (no deploy will occur)"
else
  if [ -z "$PROD_CONFIRM" ]; then
    die "check 4 FAILED: --production-confirm required to run a real deploy"
  elif [ "$PROD_CONFIRM" != "$EXPECTED_DB" ]; then
    die "check 4 FAILED: --production-confirm does not match --expected-db"
  fi
  log "check 4 OK: production confirmation matches expected DB"
fi

# ============================ deploy or dry-run ==============================
deploy_cmd="${MIGRATE_DEPLOY_CMD:-npx prisma migrate deploy}"
if [ "$DRY_RUN" -eq 1 ]; then
  echo
  echo "VERIFY-ONLY: all checks passed. WOULD run (in $APP_DIR):"
  echo "  $deploy_cmd"
  echo "  → applying: $(printf '%s' "${pending_sorted:-<none>}" | tr '\n' ' ')"
  echo "VERDICT: PASS (no changes made)"
  exit 0
fi

log "all guards passed — running deploy"
( cd "$APP_DIR" && bash -c "$deploy_cmd" )
rc=$?
if [ "$rc" -eq 0 ]; then log "deploy completed OK"; echo "VERDICT: DEPLOYED"; else log "deploy FAILED rc=$rc"; echo "VERDICT: DEPLOY-FAILED"; fi
exit "$rc"

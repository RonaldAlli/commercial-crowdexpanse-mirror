#!/usr/bin/env bash
# post-deploy-monitor.sh — reusable post-deploy health/stability monitor (BE-2 governance tooling).
#
# Purpose: encode the manual "watch it for a few minutes after deploy" check into a repeatable
# control that emits a compact evidence report and fails closed when a stop condition is hit.
#
# Samples, over a bounded window, any subset of:
#   - HTTP health endpoint status
#   - PM2 process restart-count delta (a restart loop is the classic bad-deploy signal)
#   - new error-log activity
#   - a DB assertion (row count from a supplied query)
#
# Safety: READ-ONLY / OBSERVATIONAL. It issues HTTP GETs, reads `pm2 jlist`, tails a log, and runs
# the (caller-supplied, ideally read-only) DB query. It restarts/kills nothing and changes no config.
# It NEVER prints DATABASE_URL or any secret.
#
# Exit: 0 = all sampled dimensions within tolerance. Nonzero (1) = a stop condition occurred.
#       2 = usage error.
#
# Usage:
#   scripts/diag/post-deploy-monitor.sh \
#     --health-url https://.../api/health --expected-status 200 \
#     --pm2-name crowdexpanse-commercial --max-restarts 0 \
#     --duration 120 --interval 10 \
#     --error-log /home/deploy/.crowdexpanse-health.log \
#     --db-query "select count(*) from organizations" --expected-rows 1
#
# Options:
#   --health-url <url>          health endpoint to GET (optional).
#   --expected-status <code>    expected HTTP status (default: 200).
#   --max-health-failures <n>   tolerated health failures before FAIL (default: 0).
#   --pm2-name <name>           PM2 process to watch restart_time for (optional).
#   --max-restarts <n>          tolerated restart-count delta over the window (default: 0).
#   --duration <seconds>        total window (default: 60).
#   --interval <seconds>        seconds between samples (default: 10).
#   --samples <n>               explicit sample count (overrides duration/interval; no trailing sleep).
#   --error-log <path>          log file; new bytes/lines since baseline are reported (optional).
#   --max-new-errors <n>        FAIL if new error/fatal lines exceed n (default: -1 = advisory only).
#   --db-query <sql>            query returning a single integer (optional).
#   --expected-rows <n>         expected value of --db-query result.
#   --env-file <path>           env file to source DATABASE_URL from (default: <app-dir>/.env).
#   --app-dir <path>            app dir (default: /opt/crowdexpanse/commercial).
#   -h|--help                   this help.
#
# Testability seams (env overrides; safe in prod, used by shell tests):
#   POST_DEPLOY_CURL        cmd taking a URL, printing the HTTP status code (default: curl).
#   POST_DEPLOY_PM2_JLIST   cmd printing `pm2 jlist` JSON (default: pm2 jlist).
#   POST_DEPLOY_PSQL        cmd taking a SQL string, printing a single integer (default: psql "$DATABASE_URL").
#   MONITOR_SLEEP           sleep cmd (default: sleep) — tests may stub to no-op.
set -euo pipefail

APP_DIR="${APP_DIR:-/opt/crowdexpanse/commercial}"
ENV_FILE=""
HEALTH_URL=""
EXPECTED_STATUS="200"
MAX_HEALTH_FAILS=0
PM2_NAME=""
MAX_RESTARTS=0
DURATION=60
INTERVAL=10
SAMPLES=""
ERROR_LOG=""
MAX_NEW_ERRORS=-1
DB_QUERY=""
EXPECTED_ROWS=""

ts() { date -u +%Y-%m-%dT%H:%M:%SZ; }
log() { echo "[post-deploy] $(ts) $*" >&2; }
usage_err() { echo "[post-deploy] usage error: $*" >&2; exit 2; }

while [ $# -gt 0 ]; do
  case "$1" in
    --health-url)          HEALTH_URL="${2:-}"; shift 2 ;;
    --expected-status)     EXPECTED_STATUS="${2:-}"; shift 2 ;;
    --max-health-failures) MAX_HEALTH_FAILS="${2:-}"; shift 2 ;;
    --pm2-name)            PM2_NAME="${2:-}"; shift 2 ;;
    --max-restarts)        MAX_RESTARTS="${2:-}"; shift 2 ;;
    --duration)            DURATION="${2:-}"; shift 2 ;;
    --interval)            INTERVAL="${2:-}"; shift 2 ;;
    --samples)             SAMPLES="${2:-}"; shift 2 ;;
    --error-log)           ERROR_LOG="${2:-}"; shift 2 ;;
    --max-new-errors)      MAX_NEW_ERRORS="${2:-}"; shift 2 ;;
    --db-query)            DB_QUERY="${2:-}"; shift 2 ;;
    --expected-rows)       EXPECTED_ROWS="${2:-}"; shift 2 ;;
    --env-file)            ENV_FILE="${2:-}"; shift 2 ;;
    --app-dir)             APP_DIR="${2:-}"; shift 2 ;;
    -h|--help)             sed -n '2,60p' "$0"; exit 0 ;;
    *) usage_err "unknown argument: $1" ;;
  esac
done

[ -n "$HEALTH_URL$PM2_NAME$ERROR_LOG$DB_QUERY" ] || usage_err "at least one dimension required (--health-url/--pm2-name/--error-log/--db-query)"
[ -n "$DB_QUERY" ] && [ -z "$EXPECTED_ROWS" ] && usage_err "--db-query requires --expected-rows"

SLEEP="${MONITOR_SLEEP:-sleep}"

# sample count
if [ -z "$SAMPLES" ]; then
  SAMPLES=$(( DURATION / INTERVAL )); [ "$SAMPLES" -lt 1 ] && SAMPLES=1
fi

# --- command seams ------------------------------------------------------------
http_status() { # arg: url
  if [ -n "${POST_DEPLOY_CURL:-}" ]; then "$POST_DEPLOY_CURL" "$1"
  else curl -s -o /dev/null -w '%{http_code}' --max-time 10 "$1" 2>/dev/null || echo "000"; fi
}
pm2_jlist() {
  if [ -n "${POST_DEPLOY_PM2_JLIST:-}" ]; then "$POST_DEPLOY_PM2_JLIST"
  else pm2 jlist 2>/dev/null || echo "[]"; fi
}
restart_count() { # arg: name
  pm2_jlist | python3 -c "
import sys,json
try: arr=json.load(sys.stdin)
except Exception: arr=[]
name=sys.argv[1]
for p in arr:
    if p.get('name')==name:
        print((p.get('pm2_env') or {}).get('restart_time', 0)); break
else: print(-1)" "$1"
}
db_scalar() { # arg: query — prints integer; loads DATABASE_URL lazily, never prints it
  if [ -n "${POST_DEPLOY_PSQL:-}" ]; then "$POST_DEPLOY_PSQL" "$1"; return; fi
  if [ -z "${DATABASE_URL:-}" ]; then
    [ -z "$ENV_FILE" ] && ENV_FILE="$APP_DIR/.env"
    if [ -r "$ENV_FILE" ]; then
      local dl; dl="$(grep -E '^DATABASE_URL=' "$ENV_FILE" | tail -1 || true)"
      DATABASE_URL="${dl#DATABASE_URL=}"; DATABASE_URL="${DATABASE_URL%\"}"; DATABASE_URL="${DATABASE_URL#\"}"
    fi
  fi
  [ -n "${DATABASE_URL:-}" ] || { echo "ERR"; return; }
  psql "$DATABASE_URL" -tAc "$1" 2>/dev/null | tr -d '[:space:]' || echo "ERR"
}

# --- baselines ----------------------------------------------------------------
health_failures=0
restart_base=""
restart_final=""
errlog_base_bytes=0
new_error_lines=0
db_fail=0
db_last=""

if [ -n "$PM2_NAME" ]; then
  restart_base="$(restart_count "$PM2_NAME")"
  log "baseline restart_time for '$PM2_NAME' = $restart_base"
  [ "$restart_base" = "-1" ] && log "WARN: pm2 process '$PM2_NAME' not found at baseline"
fi
if [ -n "$ERROR_LOG" ] && [ -f "$ERROR_LOG" ]; then
  errlog_base_bytes="$(wc -c < "$ERROR_LOG" | tr -d ' ')"
  log "baseline error-log size = ${errlog_base_bytes} bytes ($ERROR_LOG)"
fi

# --- sample loop --------------------------------------------------------------
s=0
while [ "$s" -lt "$SAMPLES" ]; do
  s=$((s+1))
  if [ -n "$HEALTH_URL" ]; then
    code="$(http_status "$HEALTH_URL")"
    if [ "$code" != "$EXPECTED_STATUS" ]; then
      health_failures=$((health_failures+1))
      log "sample $s/$SAMPLES health=$code (expected $EXPECTED_STATUS) FAIL"
    else
      log "sample $s/$SAMPLES health=$code OK"
    fi
  fi
  if [ "$s" -lt "$SAMPLES" ]; then "$SLEEP" "$INTERVAL" 2>/dev/null || true; fi
done

# --- post-window measurements -------------------------------------------------
restart_delta=0
if [ -n "$PM2_NAME" ]; then
  restart_final="$(restart_count "$PM2_NAME")"
  if [ "$restart_base" != "-1" ] && [ "$restart_final" != "-1" ]; then
    restart_delta=$(( restart_final - restart_base ))
  else
    restart_delta=-1
  fi
fi
if [ -n "$ERROR_LOG" ] && [ -f "$ERROR_LOG" ]; then
  now_bytes="$(wc -c < "$ERROR_LOG" | tr -d ' ')"
  if [ "$now_bytes" -gt "$errlog_base_bytes" ]; then
    new_error_lines="$(tail -c "+$((errlog_base_bytes+1))" "$ERROR_LOG" | grep -icE 'error|fatal|unhandled|exception' || true)"
  fi
fi
if [ -n "$DB_QUERY" ]; then
  db_last="$(db_scalar "$DB_QUERY")"
  if [ "$db_last" != "$EXPECTED_ROWS" ]; then db_fail=1; fi
fi

# --- stop-condition evaluation ------------------------------------------------
verdict_fail=0
reasons=()
if [ -n "$HEALTH_URL" ] && [ "$health_failures" -gt "$MAX_HEALTH_FAILS" ]; then
  verdict_fail=1; reasons+=("health_failures=$health_failures > $MAX_HEALTH_FAILS")
fi
if [ -n "$PM2_NAME" ]; then
  if [ "$restart_delta" = "-1" ]; then
    verdict_fail=1; reasons+=("pm2 process '$PM2_NAME' missing")
  elif [ "$restart_delta" -gt "$MAX_RESTARTS" ]; then
    verdict_fail=1; reasons+=("restart_delta=$restart_delta > $MAX_RESTARTS (restart loop)")
  fi
fi
if [ "$MAX_NEW_ERRORS" -ge 0 ] && [ "$new_error_lines" -gt "$MAX_NEW_ERRORS" ]; then
  verdict_fail=1; reasons+=("new_error_lines=$new_error_lines > $MAX_NEW_ERRORS")
fi
if [ "$db_fail" -eq 1 ]; then
  verdict_fail=1; reasons+=("db assertion: got '$db_last' expected '$EXPECTED_ROWS'")
fi

# --- compact evidence report --------------------------------------------------
echo
echo "post-deploy evidence report ($(ts))"
echo "  samples taken     : $SAMPLES (interval ${INTERVAL}s)"
[ -n "$HEALTH_URL" ] && echo "  health failures   : $health_failures / $SAMPLES (expected $EXPECTED_STATUS, tol $MAX_HEALTH_FAILS)"
[ -n "$PM2_NAME" ]   && echo "  restart delta     : $restart_delta (base $restart_base → $restart_final, max $MAX_RESTARTS)"
[ -n "$ERROR_LOG" ]  && echo "  new error lines   : $new_error_lines (log $ERROR_LOG; threshold $MAX_NEW_ERRORS)"
[ -n "$DB_QUERY" ]   && echo "  db assertion      : got '$db_last' expected '$EXPECTED_ROWS'"
if [ "$verdict_fail" -eq 0 ]; then
  echo "  VERDICT           : PASS"
  exit 0
else
  echo "  VERDICT           : FAIL — ${reasons[*]}"
  exit 1
fi

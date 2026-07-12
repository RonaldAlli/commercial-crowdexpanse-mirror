#!/usr/bin/env bash
# Shared helpers for the CrowdExpanse Commercial backup system (D4).
# Sourced by backup.sh and restore-verify.sh. Not executable on its own.
#
# Responsibilities: config/env loading, logging, DB-URL handling, the
# "never touch production" guard, client-side encryption (gpg AES-256), and
# small utilities. No production data is ever modified by this file.

set -uo pipefail

# --- Paths / config (env-overridable; names documented in .env.example) -------
APP_DIR="${APP_DIR:-/opt/crowdexpanse/commercial}"
BACKUP_ROOT="${BACKUP_ROOT:-/opt/crowdexpanse/backups/commercial}"
BACKUP_LOG="${BACKUP_LOG:-/home/deploy/.crowdexpanse-commercial-backup.log}"
BACKUP_PASSPHRASE_FILE="${BACKUP_PASSPHRASE_FILE:-$APP_DIR/.backup-passphrase}"
RESTORE_VERIFY_DB="${RESTORE_VERIFY_DB:-commercial_restore_verify}"
ENV_FILE="${ENV_FILE:-$APP_DIR/.env}"

# Retention (runs kept per tier)
RETAIN_DAILY="${RETAIN_DAILY:-30}"
RETAIN_WEEKLY="${RETAIN_WEEKLY:-12}"
RETAIN_MONTHLY="${RETAIN_MONTHLY:-12}"

# Key tables asserted present + countable during the restore test.
KEY_TABLES=(organizations users sellers buyers properties opportunities deal_analysis tasks notes documents buyer_matches invitations activity_log)

# --- Logging ------------------------------------------------------------------
log() { echo "[$(date -u +%Y-%m-%dT%H:%M:%SZ)] $*" | tee -a "$BACKUP_LOG" >&2; }
die() { log "FATAL: $*"; exit 1; }

rotate_log() {
  if [ -f "$BACKUP_LOG" ] && [ "$(stat -c%s "$BACKUP_LOG" 2>/dev/null || echo 0)" -gt 524288 ]; then
    tail -c 262144 "$BACKUP_LOG" > "${BACKUP_LOG}.tmp" && mv "${BACKUP_LOG}.tmp" "$BACKUP_LOG"
  fi
}

# --- Env / DB URL -------------------------------------------------------------
# Reads only the keys we need from .env without exporting the whole file.
load_env() {
  [ -r "$ENV_FILE" ] || die "cannot read $ENV_FILE"
  local key val
  while IFS= read -r line; do
    case "$line" in
      DATABASE_URL=*|UPLOAD_DIR=*|R2_*=*|BACKUP_*=*|RESTORE_VERIFY_DB=*)
        key="${line%%=*}"; val="${line#*=}"
        val="${val%\"}"; val="${val#\"}"
        # Do not override values already set in the environment.
        [ -z "${!key:-}" ] && printf -v "$key" '%s' "$val" && export "${key?}"
        ;;
    esac
  done < "$ENV_FILE"
  [ -n "${DATABASE_URL:-}" ] || die "DATABASE_URL not set"
}

# Database name from a postgres URL.
db_name_of() { local u="$1"; u="${u#*://}"; u="${u#*/}"; echo "${u%%\?*}"; }

# The production database name (the one we back up, read-only).
prod_db() { db_name_of "$DATABASE_URL"; }

# Build a connection URL to a *different* database on the same server.
url_for_db() {
  local target="$1" u="$DATABASE_URL" base query
  base="${u%%\?*}"; query=""; [ "$u" != "$base" ] && query="?${u#*\?}"
  echo "${base%/*}/${target}${query}"
}

# Absolute guard: refuse to let a restore/verify target the production DB.
assert_not_prod() {
  local target="$1" prod
  prod="$(prod_db)"
  [ "$target" != "$prod" ] || die "refusing to use production database '$prod' as a restore/verify target"
  case "$target" in
    *_verify|*_test) : ;;
    *) die "restore/verify target '$target' must end in _verify or _test (never production)";;
  esac
}

# --- Encryption (client-side, symmetric AES-256) ------------------------------
require_passphrase() {
  [ -r "$BACKUP_PASSPHRASE_FILE" ] || die "missing passphrase file $BACKUP_PASSPHRASE_FILE (chmod 600; store a copy OFF-host for DR)"
  [ -s "$BACKUP_PASSPHRASE_FILE" ] || die "passphrase file $BACKUP_PASSPHRASE_FILE is empty"
}

gpg_encrypt() { # <plaintext-in> <cipher-out>
  gpg --batch --yes --quiet --pinentry-mode loopback --passphrase-file "$BACKUP_PASSPHRASE_FILE" \
      --cipher-algo AES256 --symmetric -o "$2" "$1"
}
gpg_decrypt() { # <cipher-in> <plaintext-out>
  gpg --batch --yes --quiet --pinentry-mode loopback --passphrase-file "$BACKUP_PASSPHRASE_FILE" \
      -o "$2" --decrypt "$1"
}
# Decrypt to stdout (for streaming into pg_restore --list etc.)
gpg_decrypt_stream() { # <cipher-in>
  gpg --batch --yes --quiet --pinentry-mode loopback --passphrase-file "$BACKUP_PASSPHRASE_FILE" \
      --decrypt "$1"
}

sha256_of() { sha256sum "$1" | awk '{print $1}'; }

# --- R2 (off-site mirror) -----------------------------------------------------
r2_configured() {
  [ -n "${R2_ACCOUNT_ID:-}" ] && [ -n "${R2_BUCKET:-}" ] && \
  [ -n "${R2_ACCESS_KEY_ID:-}" ] && [ -n "${R2_SECRET_ACCESS_KEY:-}" ]
}

# Configure an ephemeral rclone S3 remote for Cloudflare R2 via env (no config file).
r2_env() {
  export RCLONE_CONFIG_R2_TYPE=s3
  export RCLONE_CONFIG_R2_PROVIDER=Cloudflare
  export RCLONE_CONFIG_R2_ACCESS_KEY_ID="$R2_ACCESS_KEY_ID"
  export RCLONE_CONFIG_R2_SECRET_ACCESS_KEY="$R2_SECRET_ACCESS_KEY"
  export RCLONE_CONFIG_R2_ENDPOINT="https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com"
  export RCLONE_CONFIG_R2_ACL=private
}

#!/usr/bin/env bash
# Restore drill for CrowdExpanse Commercial backups (D4, stages Verify + Restore Test).
#
# Decrypts the latest (or a given) backup run, restores the database into an
# ISOLATED verify database, checks integrity, and verifies the document archive
# against its manifest. Production is never a target (hard guard).
#
# Usage:
#   restore-verify.sh [RUN_DIR]        # default: newest run under $BACKUP_ROOT/daily
#
# Exit: 0 = restore verified · non-zero = a check failed (backup is NOT trustworthy).

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=./backup-common.sh
source "$HERE/backup-common.sh"

load_env
require_passphrase

RUN_DIR="${1:-}"
if [ -z "$RUN_DIR" ]; then
  RUN_DIR="$(ls -1dt "$BACKUP_ROOT"/daily/*/ 2>/dev/null | head -1)"
  [ -n "$RUN_DIR" ] || die "no backup runs found under $BACKUP_ROOT/daily (run backup.sh first)"
fi
RUN_DIR="${RUN_DIR%/}"
[ -d "$RUN_DIR" ] || die "run dir not found: $RUN_DIR"

DB_GPG="$RUN_DIR/db.dump.gpg"
DOCS_GPG="$RUN_DIR/docs.tar.zst.gpg"
MANIFEST_GPG="$RUN_DIR/docs-manifest.txt.gpg"
COUNTS_GPG="$RUN_DIR/db-counts.txt.gpg"
[ -f "$DB_GPG" ] || die "missing $DB_GPG"

TARGET_DB="$RESTORE_VERIFY_DB"
assert_not_prod "$TARGET_DB"
RESTORE_URL="$(url_for_db "$TARGET_DB")"

WORK="$(mktemp -d -t ce-restore-XXXXXX)"
cleanup() { rm -rf "$WORK"; }
trap cleanup EXIT

log "restore-verify: run=$RUN_DIR target_db=$TARGET_DB"

# --- Stage: Verify (archive is structurally valid) ----------------------------
gpg_decrypt "$DB_GPG" "$WORK/db.dump" || die "decrypt failed for $DB_GPG (bad passphrase or corrupt file)"
pg_restore --list "$WORK/db.dump" >/dev/null 2>>"$BACKUP_LOG" || die "pg_restore --list failed: not a valid archive"
log "verify: db archive is valid ($(sha256_of "$DB_GPG" | cut -c1-16)...)"

# --- Stage: Restore Test (into the isolated verify DB) ------------------------
# The verify DB must already exist (commercial_app lacks CREATEDB). One-time:
#   sudo -u postgres createdb -O commercial_app commercial_restore_verify
if ! psql "$RESTORE_URL" -tAc "select 1" >/dev/null 2>>"$BACKUP_LOG"; then
  die "cannot connect to verify DB '$TARGET_DB'. Create it once: sudo -u postgres createdb -O commercial_app $TARGET_DB"
fi

if ! pg_restore --clean --if-exists --no-owner --no-privileges --dbname="$RESTORE_URL" "$WORK/db.dump" 2>>"$BACKUP_LOG"; then
  die "pg_restore into $TARGET_DB failed"
fi

# Integrity: every key table must exist and be countable.
declare -A RESTORED
for t in "${KEY_TABLES[@]}"; do
  reg="$(psql "$RESTORE_URL" -tAc "select to_regclass('public.$t')" 2>>"$BACKUP_LOG")"
  [ "$reg" = "$t" ] || die "restored DB missing expected table: $t"
  c="$(psql "$RESTORE_URL" -tAc "select count(*) from \"$t\"" 2>>"$BACKUP_LOG")"
  [[ "$c" =~ ^[0-9]+$ ]] || die "could not count table: $t"
  RESTORED[$t]="$c"
done
log "restore-test: all ${#KEY_TABLES[@]} key tables present and countable"

# Advisory: compare restored counts to the dump-time snapshot (WARN on drift).
COUNT_STATUS="MATCH"
if [ -f "$COUNTS_GPG" ] && gpg_decrypt "$COUNTS_GPG" "$WORK/db-counts.txt" 2>/dev/null; then
  while IFS='=' read -r t expected; do
    [ -n "$t" ] || continue
    got="${RESTORED[$t]:-?}"
    if [ "$got" != "$expected" ]; then
      COUNT_STATUS="CHANGED"
      log "restore-test: WARN count drift $t snapshot=$expected restored=$got (likely writes during dump; advisory)"
    fi
  done < "$WORK/db-counts.txt"
fi
log "restore-test: count check = $COUNT_STATUS"

# --- Stage: Document restore verification -------------------------------------
DOC_STATUS="SKIPPED"
if [ -f "$DOCS_GPG" ] && [ -f "$MANIFEST_GPG" ]; then
  mkdir -p "$WORK/docs"
  gpg_decrypt "$DOCS_GPG" "$WORK/docs.tar.zst" || die "decrypt failed for $DOCS_GPG"
  gpg_decrypt "$MANIFEST_GPG" "$WORK/manifest.txt" || die "decrypt failed for $MANIFEST_GPG"
  tar --use-compress-program=zstd -xf "$WORK/docs.tar.zst" -C "$WORK/docs" 2>>"$BACKUP_LOG" || die "doc archive extract failed"
  n="$(grep -c . "$WORK/manifest.txt" || true)"
  if [ "${n:-0}" -eq 0 ]; then
    DOC_STATUS="OK (0 files)"
  elif ( cd "$WORK/docs" && sha256sum -c "$WORK/manifest.txt" >/dev/null 2>>"$BACKUP_LOG" ); then
    DOC_STATUS="OK ($n files)"
  else
    die "document hash verification failed against manifest"
  fi
fi
log "restore-test: documents = $DOC_STATUS"

echo "RESTORE-VERIFY PASS · db=$TARGET_DB · tables=${#KEY_TABLES[@]} · counts=$COUNT_STATUS · docs=$DOC_STATUS · run=$RUN_DIR"

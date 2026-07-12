#!/usr/bin/env bash
# CrowdExpanse Commercial — automated backup (D4).
#
# A backup is "successful" only after all SIX stages complete:
#   Backup → Verify → Restore Test → Report → Retention → Off-site Mirror
#
# Usage:
#   backup.sh [daily|weekly|monthly|adhoc]   # produce + verify + restore-test + retain + mirror
#   backup.sh check                          # freshness gate for monitoring (exit!=0 if stale)
#
# Design notes:
#   - The database dump is read-only against production (pg_dump never writes).
#   - Artifacts are client-side encrypted (gpg AES-256) BEFORE they touch a tier
#     dir or R2. Local perms are 700 dirs / 600 files. R2 adds server-side encryption.
#   - The restore test runs BEFORE retention/mirror: an untrustworthy dump is
#     never retained or shipped off-site.
#
# Exit: 0 = full success (6/6) · 3 = local OK but off-site mirror pending/failed
#       · 1/2 = backup/verify/restore/report/retention failure (NOT trustworthy).

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=./backup-common.sh
source "$HERE/backup-common.sh"

rotate_log
load_env

MODE="${1:-daily}"
case "$MODE" in
  daily|weekly|monthly|adhoc) ;;
  check)
    # Freshness gate: last full success must be recent.
    SENT="$BACKUP_ROOT/last-success"
    MAX_AGE_H="${BACKUP_MAX_AGE_HOURS:-26}"
    [ -f "$SENT" ] || { echo "BACKUP CHECK FAIL: no successful backup recorded ($SENT missing)"; exit 1; }
    age_s=$(( $(date -u +%s) - $(stat -c%Y "$SENT") ))
    if [ "$age_s" -gt $((MAX_AGE_H * 3600)) ]; then
      echo "BACKUP CHECK FAIL: last success ${age_s}s ago (> ${MAX_AGE_H}h)"; exit 1
    fi
    echo "BACKUP CHECK OK: last success $((age_s/3600))h ago"; exit 0 ;;
  *) die "unknown mode '$MODE' (daily|weekly|monthly|adhoc|check)" ;;
esac

require_passphrase

# Which tiers this run produces (mirrors the house pattern).
DOW=$(date -u +%u); DOM=$(date -u +%-d)
TIERS=()
case "$MODE" in
  daily)   TIERS+=("daily"); [ "$DOW" = "7" ] && TIERS+=("weekly"); [ "$DOM" = "1" ] && TIERS+=("monthly") ;;
  weekly)  TIERS+=("weekly") ;;
  monthly) TIERS+=("monthly") ;;
  adhoc)   TIERS+=("adhoc") ;;
esac

STAMP="$(date -u +%Y%m%d-%H%M%SZ)"
STARTED="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
STAGING="$(mktemp -d -t ce-backup-XXXXXX)"
umask 077
cleanup() { rm -rf "$STAGING"; }
trap cleanup EXIT

PROD="$(prod_db)"
log "backup start mode=$MODE tiers='${TIERS[*]}' db=$PROD stamp=$STAMP"

# ============================ Stage 1: Backup =================================
# Database (read-only), custom format for clean/selective restore.
pg_dump -Fc --no-owner --no-privileges -d "$DATABASE_URL" -f "$STAGING/db.dump" 2>>"$BACKUP_LOG" \
  || die "stage Backup: pg_dump failed"

# Dump-time key-table counts (snapshot for the restore-test to compare against).
: > "$STAGING/db-counts.txt"
for t in "${KEY_TABLES[@]}"; do
  c="$(psql "$DATABASE_URL" -tAc "select count(*) from \"$t\"" 2>>"$BACKUP_LOG")" || c="?"
  echo "$t=$c" >> "$STAGING/db-counts.txt"
done

# Documents: archive + manifest (relative to UPLOAD_DIR). Handles empty dir.
UPLOAD_DIR="${UPLOAD_DIR:-$APP_DIR/uploads}"
DOC_COUNT=0
if [ -d "$UPLOAD_DIR" ]; then
  ( cd "$UPLOAD_DIR" && find . -type f -print0 | xargs -0 -r sha256sum ) > "$STAGING/docs-manifest.txt" 2>>"$BACKUP_LOG"
  DOC_COUNT="$(grep -c . "$STAGING/docs-manifest.txt" || true)"
  tar --use-compress-program='zstd -19' -cf "$STAGING/docs.tar.zst" -C "$UPLOAD_DIR" . 2>>"$BACKUP_LOG" \
    || die "stage Backup: document tar failed"
else
  : > "$STAGING/docs-manifest.txt"; tar --use-compress-program='zstd -19' -cf "$STAGING/docs.tar.zst" -T /dev/null
fi

# Client-side encryption of every data artifact.
gpg_encrypt "$STAGING/db.dump"            "$STAGING/db.dump.gpg"            || die "stage Backup: encrypt db"
gpg_encrypt "$STAGING/docs.tar.zst"       "$STAGING/docs.tar.zst.gpg"      || die "stage Backup: encrypt docs"
gpg_encrypt "$STAGING/docs-manifest.txt"  "$STAGING/docs-manifest.txt.gpg" || die "stage Backup: encrypt manifest"
gpg_encrypt "$STAGING/db-counts.txt"      "$STAGING/db-counts.txt.gpg"     || die "stage Backup: encrypt counts"
rm -f "$STAGING/db.dump" "$STAGING/docs.tar.zst" "$STAGING/docs-manifest.txt" "$STAGING/db-counts.txt"
log "stage Backup: OK (docs files=$DOC_COUNT)"

# ============================ Stage 2: Verify ================================
DB_SHA="$(sha256_of "$STAGING/db.dump.gpg")"
DOCS_SHA="$(sha256_of "$STAGING/docs.tar.zst.gpg")"
DB_BYTES="$(stat -c%s "$STAGING/db.dump.gpg")"
DOCS_BYTES="$(stat -c%s "$STAGING/docs.tar.zst.gpg")"
[ "$DB_BYTES" -gt 0 ] || die "stage Verify: empty db artifact"
# Custom-format (-Fc) archives need a seekable file, so decrypt to a temp file
# (not a pipe) before listing the TOC.
gpg_decrypt "$STAGING/db.dump.gpg" "$STAGING/verify.dump" 2>>"$BACKUP_LOG" \
  || die "stage Verify: decrypt failed (passphrase or corrupt artifact)"
pg_restore --list "$STAGING/verify.dump" >/dev/null 2>>"$BACKUP_LOG" \
  || die "stage Verify: db archive not restorable (pg_restore --list failed)"
rm -f "$STAGING/verify.dump"
log "stage Verify: OK db_sha=${DB_SHA:0:16}... db_bytes=$DB_BYTES"

# ========================= Stage 3: Restore Test ============================
# Restore into the isolated verify DB and check integrity + documents.
# (An untrustworthy dump fails here, before it is ever retained or mirrored.)
if ! RESTORE_OUT="$("$HERE/restore-verify.sh" "$STAGING" 2>>"$BACKUP_LOG")"; then
  die "stage Restore Test: restore-verify failed (backup NOT trustworthy)"
fi
log "stage Restore Test: OK — $RESTORE_OUT"

# ============================ Stage 4: Report ===============================
FINISHED="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
cat > "$STAGING/report.json" <<JSON
{
  "app": "commercial",
  "stamp": "$STAMP",
  "mode": "$MODE",
  "tiers": [$(printf '"%s",' "${TIERS[@]}" | sed 's/,$//')],
  "database": { "name": "$PROD", "bytes": $DB_BYTES, "sha256": "$DB_SHA" },
  "documents": { "files": $DOC_COUNT, "bytes": $DOCS_BYTES, "sha256": "$DOCS_SHA" },
  "stages": { "backup": "OK", "verify": "OK", "restore_test": "OK", "report": "OK",
              "retention": "PENDING", "mirror": "PENDING" },
  "startedAt": "$STARTED",
  "finishedAt": "$FINISHED"
}
JSON
log "stage Report: OK"

# ============================ Stage 5: Retention ============================
declare -a TIER_DIRS=()
primary=""
for tier in "${TIERS[@]}"; do
  dest="$BACKUP_ROOT/$tier/$STAMP"
  mkdir -p "$dest"; chmod 700 "$BACKUP_ROOT" "$BACKUP_ROOT/$tier" "$dest"
  if [ -z "$primary" ]; then
    cp -p "$STAGING"/* "$dest"/; primary="$dest"
  else
    for f in "$STAGING"/*; do ln "$primary/$(basename "$f")" "$dest/$(basename "$f")" 2>/dev/null || cp -p "$f" "$dest/"; done
  fi
  chmod 600 "$dest"/*
  TIER_DIRS+=("$tier:$dest")
  # Prune: keep newest N run dirs for this tier.
  case "$tier" in daily) keep=$RETAIN_DAILY;; weekly) keep=$RETAIN_WEEKLY;; monthly) keep=$RETAIN_MONTHLY;; *) keep=0;; esac
  if [ "$keep" -gt 0 ]; then
    mapfile -t RUNS < <(ls -1dt "$BACKUP_ROOT/$tier"/*/ 2>/dev/null || true)
    i=0; for r in "${RUNS[@]}"; do i=$((i+1)); [ "$i" -gt "$keep" ] && rm -rf "$r" && log "pruned $tier/$(basename "$r")"; done
  fi
done
log "stage Retention: OK (${TIER_DIRS[*]})"

# ========================= Stage 6: Off-site Mirror =========================
MIRROR_STATUS="PENDING"
if r2_configured; then
  r2_env
  PREFIX="${R2_PREFIX:-commercial/}"; PREFIX="${PREFIX%/}"
  mirror_ok=1
  for entry in "${TIER_DIRS[@]}"; do
    tier="${entry%%:*}"; dir="${entry#*:}"
    remote="R2:$R2_BUCKET/$PREFIX/$tier/$STAMP"
    if rclone copy "$dir" "$remote" --quiet 2>>"$BACKUP_LOG" \
       && rclone check "$dir" "$remote" --one-way --quiet 2>>"$BACKUP_LOG"; then
      log "mirror: OK $tier → $remote"
    else
      mirror_ok=0; log "mirror: FAILED $tier → $remote"
    fi
  done
  [ "$mirror_ok" = 1 ] && MIRROR_STATUS="OK" || MIRROR_STATUS="FAILED"
else
  MIRROR_STATUS="SKIPPED (R2 not configured)"
  log "stage Off-site Mirror: SKIPPED — set R2_* in .env to enable"
fi

# Finalize report + sentinels.
for entry in "${TIER_DIRS[@]}"; do
  dir="${entry#*:}"
  sed -i "s/\"retention\": \"PENDING\"/\"retention\": \"OK\"/; s/\"mirror\": \"PENDING\"/\"mirror\": \"$MIRROR_STATUS\"/" "$dir/report.json" 2>/dev/null || true
done
date -u +%Y-%m-%dT%H:%M:%SZ > "$BACKUP_ROOT/last-run"

if [ "$MIRROR_STATUS" = "OK" ]; then
  echo "$STAMP" > "$BACKUP_ROOT/last-success"
  log "backup COMPLETE 6/6 mode=$MODE stamp=$STAMP"
  echo "BACKUP OK (6/6): $MODE $STAMP → tiers='${TIERS[*]}' mirror=OK"
  exit 0
else
  log "backup LOCAL-OK 5/6 mirror=$MIRROR_STATUS mode=$MODE stamp=$STAMP"
  echo "BACKUP LOCAL OK (5/6): $MODE $STAMP retained + restore-verified; mirror=$MIRROR_STATUS"
  exit 3
fi

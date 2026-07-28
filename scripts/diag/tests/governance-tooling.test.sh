#!/usr/bin/env bash
# governance-tooling.test.sh — shell-level failure-case tests for the BE-2 governance tools.
#
# No bats/shellcheck on this host, so this is a self-contained bash harness. It builds real
# git fixtures for verify-merge and stubs external commands (prisma status/deploy, curl, pm2,
# psql) for the guard/monitor via their documented env seams. It asserts EXIT CODES — the
# fail-closed contract — for each required failure case, plus a passing baseline per tool.
#
# Run:  bash scripts/diag/tests/governance-tooling.test.sh
# Exit: 0 if all assertions pass, 1 otherwise.
set -uo pipefail

ROOT="$(cd "$(dirname "$0")/../../.." && pwd)"
VERIFY="$ROOT/scripts/diag/verify-merge.sh"
GUARD="$ROOT/scripts/db/migrate-deploy-guarded.sh"
MONITOR="$ROOT/scripts/diag/post-deploy-monitor.sh"

TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT
PASS=0; FAIL=0

# expect_exit <expected-code> <label> -- <command...>
expect_exit() {
  local want="$1" label="$2"; shift 2; [ "$1" = "--" ] && shift
  local out rc
  out="$("$@" 2>&1)"; rc=$?
  if [ "$rc" -eq "$want" ]; then
    echo "  ok   [$label] exit=$rc"; PASS=$((PASS+1))
  else
    echo "  FAIL [$label] expected exit=$want got=$rc"; echo "$out" | sed 's/^/       | /' | tail -8; FAIL=$((FAIL+1))
  fi
}

echo "== verify-merge.sh =="
# Build origin + mirror bare repos and a working clone with a real merged history.
mk_verify_fixture() {
  local d="$TMP/vm"; rm -rf "$d"; mkdir -p "$d"
  git init -q --bare "$d/origin.git"; git init -q --bare "$d/github.git"
  git clone -q "$d/origin.git" "$d/work" 2>/dev/null
  ( cd "$d/work"
    git config user.email t@t; git config user.name t
    git remote add github "$d/github.git"
    echo base > f.txt; mkdir -p docs; echo "BE-2 acceptance record" > docs/ACCEPTANCE.md
    git add -A; git commit -qm "base + acceptance"; git branch -M main
    # a feature branch NOT merged into main
    git checkout -q -b feat/unmerged; echo x >> f.txt; git commit -qam "unmerged work"
    git checkout -q main
    git push -q origin main; git push -q github main; git push -q origin feat/unmerged
  ) >/dev/null 2>&1
  echo "$d"
}
D="$(mk_verify_fixture)"
MAIN_SHA="$(cd "$D/work" && git rev-parse main)"
FEAT_SHA="$(cd "$D/work" && git rev-parse feat/unmerged)"

# Gitea API stub generator: prints canned JSON per subpath. $1 = subpath.
mk_gitea_stub() { # <merged true|false> <mainsha>
  local merged="$1" mainsha="$2"
  local f="$TMP/gitea_stub_${merged}.sh"
  cat > "$f" <<STUB
#!/usr/bin/env bash
case "\$1" in
  pulls*)     echo '[{"number":3,"title":"t","merged":${merged},"merge_commit_sha":"${mainsha}","head":{"ref":"feat/unmerged"},"base":{"ref":"main"}}]';;
  branches/*) echo '{"commit":{"id":"${mainsha}"}}';;
  *)          echo '{}';;
esac
STUB
  chmod +x "$f"; echo "$f"
}
mk_gitea_empty() { # PR list empty -> merge not found
  local f="$TMP/gitea_empty.sh"
  cat > "$f" <<'STUB'
#!/usr/bin/env bash
case "$1" in
  pulls*)     echo '[]';;
  branches/*) echo '{"commit":{"id":"deadbeef"}}';;
  *)          echo '{}';;
esac
STUB
  chmod +x "$f"; echo "$f"
}

STUB_MERGED="$(mk_gitea_stub true "$MAIN_SHA")"
STUB_EMPTY="$(mk_gitea_empty)"

# PASS baseline: expected=main tip, PR merged, mirror agrees, required file present.
expect_exit 0 "verify: happy path" -- \
  env GITEA_GET_CMD="$STUB_MERGED" GIT="git -C $D/work" \
  "$VERIFY" --branch feat/unmerged --expected-commit "$MAIN_SHA" --base main \
    --require-file docs/ACCEPTANCE.md --require-marker 'docs/ACCEPTANCE.md:BE-2' --no-fetch

# FAIL: merge not found (empty PR list)
expect_exit 1 "verify: merge not found" -- \
  env GITEA_GET_CMD="$STUB_EMPTY" GIT="git -C $D/work" \
  "$VERIFY" --branch feat/unmerged --expected-commit "$MAIN_SHA" --base main --no-fetch

# FAIL: branch not merged (expected commit is the unmerged feat tip; PR merged=false)
STUB_UNMERGED="$(mk_gitea_stub false "$MAIN_SHA")"
expect_exit 1 "verify: branch not merged" -- \
  env GITEA_GET_CMD="$STUB_UNMERGED" GIT="git -C $D/work" \
  "$VERIFY" --branch feat/unmerged --expected-commit "$FEAT_SHA" --base main --no-fetch

# FAIL: required file absent on main
expect_exit 1 "verify: required file missing" -- \
  env GITEA_GET_CMD="$STUB_MERGED" GIT="git -C $D/work" \
  "$VERIFY" --branch feat/unmerged --expected-commit "$MAIN_SHA" --base main \
    --require-file docs/NOPE.md --no-fetch

# --- require-file normalization (CR + surrounding whitespace stripped; empty rejected) ---
CRLF_ARG="$(printf 'docs/ACCEPTANCE.md\r')"
expect_exit 0 "verify: require-file CRLF-contaminated is normalized" -- \
  env GITEA_GET_CMD="$STUB_MERGED" GIT="git -C $D/work" \
  "$VERIFY" --branch feat/unmerged --expected-commit "$MAIN_SHA" --base main \
    --require-file "$CRLF_ARG" --no-fetch

expect_exit 0 "verify: require-file surrounding whitespace is trimmed" -- \
  env GITEA_GET_CMD="$STUB_MERGED" GIT="git -C $D/work" \
  "$VERIFY" --branch feat/unmerged --expected-commit "$MAIN_SHA" --base main \
    --require-file "   docs/ACCEPTANCE.md   " --no-fetch

EMPTY_ARG="$(printf '  \r ')"
expect_exit 2 "verify: require-file empty after normalization is rejected" -- \
  env GITEA_GET_CMD="$STUB_MERGED" GIT="git -C $D/work" \
  "$VERIFY" --branch feat/unmerged --expected-commit "$MAIN_SHA" --base main \
    --require-file "$EMPTY_ARG" --no-fetch

# --- mirror modes (exact|ancestor) --------------------------------------------
# Fixture: a work repo with commits C0<-C1<-C2 on main and a sibling CX off C0.
# origin/main is pinned to C1; github/main is set per scenario via update-ref.
MMD="$TMP/mm"; rm -rf "$MMD"; mkdir -p "$MMD"
( cd "$MMD"; git init -q work
  cd work; git config user.email t@t; git config user.name t
  echo a > f; git add -A; git commit -qm c0; git branch -M main
  echo b >> f; git commit -qam c1
  echo c >> f; git commit -qam c2
  git checkout -q -b sib main~2; echo z > g; git add -A; git commit -qm cx
  git checkout -q main
) >/dev/null 2>&1
MMW="$MMD/work"
C0="$(git -C "$MMW" rev-parse main~2)"; C1="$(git -C "$MMW" rev-parse main~1)"
C2="$(git -C "$MMW" rev-parse main)";   CX="$(git -C "$MMW" rev-parse sib)"
MM_STUB="$TMP/gitea_mm.sh"
cat > "$MM_STUB" <<STUB
#!/usr/bin/env bash
case "\$1" in
  pulls*)     echo '[{"number":7,"merged":true,"merge_commit_sha":"${C1}","head":{"ref":"feat"},"base":{"ref":"main"}}]';;
  branches/*) echo '{"commit":{"id":"${C1}"}}';;
  *)          echo '{}';;
esac
STUB
chmod +x "$MM_STUB"
mm_setrefs() { # <origin_sha> <github_sha|"">
  git -C "$MMW" update-ref refs/remotes/origin/main "$1"
  if [ -n "$2" ]; then git -C "$MMW" update-ref refs/remotes/github/main "$2"
  else git -C "$MMW" update-ref -d refs/remotes/github/main 2>/dev/null || true; fi
}
mm_run() { # <mode>
  env GITEA_GET_CMD="$MM_STUB" GIT="git -C $MMW" \
    "$VERIFY" --branch feat --expected-commit "$C1" --base main --no-fetch --mirror-mode "$1"
}

mm_setrefs "$C1" "$C1"; expect_exit 0 "mirror exact: equal -> pass" -- mm_run exact
mm_setrefs "$C1" "$C0"; expect_exit 1 "mirror exact: clean lag -> fail" -- mm_run exact
mm_setrefs "$C1" "$C1"; expect_exit 0 "mirror ancestor: equal -> pass" -- mm_run ancestor
mm_setrefs "$C1" "$C0"; expect_exit 0 "mirror ancestor: clean lag -> pass" -- mm_run ancestor
mm_setrefs "$C1" "$CX"; expect_exit 1 "mirror ancestor: diverged -> fail" -- mm_run ancestor
mm_setrefs "$C1" "$C2"; expect_exit 1 "mirror ancestor: mirror-ahead -> fail" -- mm_run ancestor
mm_setrefs "$C1" "";    expect_exit 1 "mirror ancestor: missing mirror ref -> fail" -- mm_run ancestor

echo "== migrate-deploy-guarded.sh =="
EVID="$TMP/evidence.txt"; echo '{"backup":"ok"}' > "$EVID"
MISSING_EVID="$TMP/nope-evidence.txt"
STATUS_ONE="$TMP/status_one.sh"; cat > "$STATUS_ONE" <<'S'
#!/usr/bin/env bash
printf 'Following migrations have not yet been applied:\n20260728_add_foo\n\nTo apply migrations, run prisma migrate deploy\n'
S
chmod +x "$STATUS_ONE"
STATUS_UPTODATE="$TMP/status_ok.sh"; printf '#!/usr/bin/env bash\necho "Database schema is up to date!"\n' > "$STATUS_UPTODATE"; chmod +x "$STATUS_UPTODATE"
DEPLOY_SENTINEL="$TMP/deployed.flag"
DEPLOY_STUB="$TMP/deploy.sh"; printf '#!/usr/bin/env bash\ntouch "%s"\n' "$DEPLOY_SENTINEL" > "$DEPLOY_STUB"; chmod +x "$DEPLOY_STUB"
# Synthetic, unmistakably non-secret credentials — localhost only, used solely to exercise the
# DB-name parser. The password is a literal phrase so secret scanners do not flag it.
GOOD_URL="postgresql://user:not-a-real-password@localhost:5432/commercial"
WRONG_URL="postgresql://user:not-a-real-password@localhost:5432/wrongdb"

# FAIL: wrong target DB
expect_exit 1 "guard: wrong target DB" -- \
  env DATABASE_URL="$WRONG_URL" MIGRATE_STATUS_CMD="$STATUS_ONE" \
  "$GUARD" --expected-db commercial --allow-migration 20260728_add_foo --backup-evidence "$EVID" --verify-only

# FAIL: unexpected pending migration (not in allow-list)
expect_exit 1 "guard: unexpected pending migration" -- \
  env DATABASE_URL="$GOOD_URL" MIGRATE_STATUS_CMD="$STATUS_ONE" \
  "$GUARD" --expected-db commercial --allow-migration 20260101_other --backup-evidence "$EVID" --verify-only

# FAIL: missing backup evidence
expect_exit 1 "guard: missing backup evidence" -- \
  env DATABASE_URL="$GOOD_URL" MIGRATE_STATUS_CMD="$STATUS_ONE" \
  "$GUARD" --expected-db commercial --allow-migration 20260728_add_foo --backup-evidence "$MISSING_EVID" --verify-only

# FAIL: real deploy without production confirmation
expect_exit 1 "guard: no production confirm" -- \
  env DATABASE_URL="$GOOD_URL" MIGRATE_STATUS_CMD="$STATUS_ONE" MIGRATE_DEPLOY_CMD="$DEPLOY_STUB" \
  "$GUARD" --expected-db commercial --allow-migration 20260728_add_foo --backup-evidence "$EVID"

# PASS: verify-only, everything matches, and deploy must NOT run.
rm -f "$DEPLOY_SENTINEL"
expect_exit 0 "guard: verify-only pass" -- \
  env DATABASE_URL="$GOOD_URL" MIGRATE_STATUS_CMD="$STATUS_ONE" MIGRATE_DEPLOY_CMD="$DEPLOY_STUB" \
  "$GUARD" --expected-db commercial --allow-migration 20260728_add_foo --backup-evidence "$EVID" --verify-only
if [ -e "$DEPLOY_SENTINEL" ]; then echo "  FAIL [guard: verify-only ran deploy!]"; FAIL=$((FAIL+1)); else echo "  ok   [guard: verify-only did not deploy]"; PASS=$((PASS+1)); fi

echo "== post-deploy-monitor.sh =="
CURL_OK="$TMP/curl_ok.sh"; printf '#!/usr/bin/env bash\necho 200\n' > "$CURL_OK"; chmod +x "$CURL_OK"
CURL_BAD="$TMP/curl_bad.sh"; printf '#!/usr/bin/env bash\necho 500\n' > "$CURL_BAD"; chmod +x "$CURL_BAD"
# pm2 stub with an increasing restart_time across calls (restart loop)
PM2_LOOP="$TMP/pm2_loop.sh"; CNT="$TMP/pm2_count"; echo 0 > "$CNT"
cat > "$PM2_LOOP" <<PM
#!/usr/bin/env bash
n=\$(cat "$CNT"); echo \$((n+3)) > "$CNT"
echo "[{\"name\":\"app\",\"pm2_env\":{\"restart_time\":\$n}}]"
PM
chmod +x "$PM2_LOOP"
PSQL_5="$TMP/psql5.sh"; printf '#!/usr/bin/env bash\necho 5\n' > "$PSQL_5"; chmod +x "$PSQL_5"
PSQL_1="$TMP/psql1.sh"; printf '#!/usr/bin/env bash\necho 1\n' > "$PSQL_1"; chmod +x "$PSQL_1"

# FAIL: health failure
expect_exit 1 "monitor: health failure" -- \
  env POST_DEPLOY_CURL="$CURL_BAD" MONITOR_SLEEP=true \
  "$MONITOR" --health-url http://x --expected-status 200 --samples 1

# FAIL: restart loop
expect_exit 1 "monitor: restart loop" -- \
  env POST_DEPLOY_PM2_JLIST="$PM2_LOOP" MONITOR_SLEEP=true \
  "$MONITOR" --pm2-name app --max-restarts 0 --samples 1

# FAIL: unexpected DB rows
expect_exit 1 "monitor: unexpected db rows" -- \
  env POST_DEPLOY_PSQL="$PSQL_5" MONITOR_SLEEP=true \
  "$MONITOR" --db-query "select count(*)" --expected-rows 1 --samples 1

# PASS: healthy + db matches
expect_exit 0 "monitor: healthy pass" -- \
  env POST_DEPLOY_CURL="$CURL_OK" POST_DEPLOY_PSQL="$PSQL_1" MONITOR_SLEEP=true \
  "$MONITOR" --health-url http://x --expected-status 200 --db-query "select 1" --expected-rows 1 --samples 2

echo
echo "TOTAL: $PASS passed, $FAIL failed"
[ "$FAIL" -eq 0 ]

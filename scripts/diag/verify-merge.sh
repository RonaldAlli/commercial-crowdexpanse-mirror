#!/usr/bin/env bash
# verify-merge.sh — reusable, fail-closed merge verification (BE-2 governance tooling).
#
# Purpose: turn the manual "is this branch really merged and live on main?" check that BE-2
# closed by hand into a repeatable control. Verifies BOTH the Gitea PR state AND the Git
# ancestry/agreement of the three main refs (Gitea/origin, GitHub mirror, local), plus the
# presence of expected files/markers on the base branch.
#
# Safety: READ-ONLY. It runs `git fetch` and read-only Gitea GET calls only. It never pushes,
# merges, resets, or mutates repository or production state. It NEVER prints the Gitea token
# or any secret.
#
# Exit: 0 only if every required check passes. Nonzero (1) with a precise failed-check report
# otherwise (fail-closed). 2 = usage error.
#
# Usage:
#   scripts/diag/verify-merge.sh \
#     --branch docs/be-2-operational-closeout \
#     --expected-commit e680b63 \
#     --base main \
#     --require-file docs/business/evolution/be-2/ACCEPTANCE_REPORT.md \
#     --require-marker docs/business/evolution/RELEASE_HISTORY.md:BE-2
#
# Options:
#   --branch <ref>            (required) the merged head branch (PR head).
#   --expected-commit <sha>   (required) commit that MUST be an ancestor of the base branch.
#   --base <ref>              base branch (default: main).
#   --owner <o>               Gitea owner (default: env GITEA_OWNER or "ronald").
#   --repo <r>                Gitea repo  (default: env GITEA_REPO or "commercial-crowdexpanse").
#   --pr <n>                  target a specific PR number instead of auto-discovering by head.
#   --require-file <path>     file that MUST exist on the base branch (repeatable). The value is
#                             normalized (CR + surrounding whitespace stripped); empty is rejected.
#   --require-marker <path:re> file on base whose contents MUST match extended-regex <re> (repeatable).
#   --prod-state-cmd <cmd>    OPTIONAL read-only command whose trimmed stdout is compared to
#   --prod-state-expect <s>   ...<s>; use to assert "production state unchanged" (repeatable pair).
#   --skip-gitea-api          downgrade: skip PR/branch API checks (git-only). Emits a WARN.
#   --strict-untracked        treat untracked working-tree files as a clean-tree failure.
#   --no-fetch                do not run `git fetch` (use already-fetched refs).
#   --mirror-mode <m>         exact|ancestor (default: exact). exact = mirror must EQUAL origin/<base>
#                             (strict synchronization). ancestor = mirror may EQUAL or be a clean
#                             ANCESTOR of origin/<base> (benign lag = observability); divergence,
#                             mirror-ahead, missing ref, and ancestry errors all FAIL. Gitea/origin
#                             is always the authority.
#   -h|--help                 this help.
#
# Testability seams (env overrides; used by the shell tests, safe in prod):
#   GIT            git binary (default: git)
#   GITEA_GET_CMD  command taking one API subpath arg and printing JSON to stdout. Default:
#                  curl with the read-only token sourced from the gitea env file.
#   GITEA_ENV_FILE / ~/.config/crowdexpanse/gitea.env / /root/.config/crowdexpanse/gitea.env
set -euo pipefail

GIT="${GIT:-git}"
# Wrapper so GIT may be a multi-word override (e.g. "git -C /path") in tests; default is `git`.
# shellcheck disable=SC2086
git_c() { $GIT "$@"; }
BASE="main"
BRANCH=""
EXPECTED=""
OWNER="${GITEA_OWNER:-ronald}"
REPO="${GITEA_REPO:-commercial-crowdexpanse}"
PR_NUM=""
SKIP_API=0
STRICT_UNTRACKED=0
DO_FETCH=1
MIRROR_MODE="exact"
REQUIRE_FILES=()
REQUIRE_MARKERS=()
PROD_CMDS=()
PROD_EXPECTS=()

ts() { date -u +%Y-%m-%dT%H:%M:%SZ; }
log()  { echo "[verify-merge] $(ts) $*" >&2; }
warn() { echo "[verify-merge] $(ts) WARN: $*" >&2; }
usage_err() { echo "[verify-merge] usage error: $*" >&2; exit 2; }

# Normalize a path argument: strip ALL carriage returns and surrounding whitespace.
normalize_path_arg() {
  local v="${1-}"
  v="${v//$'\r'/}"
  v="${v#"${v%%[![:space:]]*}"}"
  v="${v%"${v##*[![:space:]]}"}"
  printf '%s' "$v"
}

FAIL_NAMES=()
FAIL_DETAILS=()
PASS_NAMES=()
add_fail() { FAIL_NAMES+=("$1"); FAIL_DETAILS+=("$2"); }
add_pass() { PASS_NAMES+=("$1"); }

while [ $# -gt 0 ]; do
  case "$1" in
    --branch)            BRANCH="${2:-}"; shift 2 ;;
    --expected-commit)   EXPECTED="${2:-}"; shift 2 ;;
    --base)              BASE="${2:-}"; shift 2 ;;
    --owner)             OWNER="${2:-}"; shift 2 ;;
    --repo)              REPO="${2:-}"; shift 2 ;;
    --pr)                PR_NUM="${2:-}"; shift 2 ;;
    --require-file)
      rf="$(normalize_path_arg "${2:-}")"
      [ -n "$rf" ] || usage_err "--require-file received an empty path after normalization"
      REQUIRE_FILES+=("$rf"); shift 2 ;;
    --require-marker)    REQUIRE_MARKERS+=("${2:-}"); shift 2 ;;
    --prod-state-cmd)    PROD_CMDS+=("${2:-}"); shift 2 ;;
    --prod-state-expect) PROD_EXPECTS+=("${2:-}"); shift 2 ;;
    --skip-gitea-api)    SKIP_API=1; shift ;;
    --strict-untracked)  STRICT_UNTRACKED=1; shift ;;
    --no-fetch)          DO_FETCH=0; shift ;;
    --mirror-mode)
      MIRROR_MODE="${2:-}"
      case "$MIRROR_MODE" in exact|ancestor) ;; *) usage_err "--mirror-mode must be exact|ancestor" ;; esac
      shift 2 ;;
    -h|--help)           sed -n '2,60p' "$0"; exit 0 ;;
    *) usage_err "unknown argument: $1" ;;
  esac
done

[ -n "$BRANCH" ]   || usage_err "--branch is required"
[ -n "$EXPECTED" ] || usage_err "--expected-commit is required"
[ -n "$BASE" ]     || usage_err "--base is required"
[ "${#PROD_CMDS[@]}" -eq "${#PROD_EXPECTS[@]}" ] || usage_err "each --prod-state-cmd needs a matching --prod-state-expect"

# --- default Gitea GET (read-only, token never printed) -----------------------
default_gitea_get() {
  local subpath="$1" env_file
  for env_file in "${GITEA_ENV_FILE:-}" "$HOME/.config/crowdexpanse/gitea.env" "/root/.config/crowdexpanse/gitea.env"; do
    if [ -n "$env_file" ] && [ -f "$env_file" ]; then . "$env_file"; break; fi
  done
  : "${GITEA_API:?GITEA_API not set (need gitea env file)}"
  : "${GITEA_TOKEN:?GITEA_TOKEN not set (need gitea env file)}"
  curl -fsSL -H "Authorization: token ${GITEA_TOKEN}" -H 'Accept: application/json' \
    "${GITEA_API%/}/repos/${OWNER}/${REPO}/${subpath}"
}
gitea_get() {
  if [ -n "${GITEA_GET_CMD:-}" ]; then "$GITEA_GET_CMD" "$1"; else default_gitea_get "$1"; fi
}

json_field() { # json_field <key>  — reads stdin, prints top-level scalar via python
  python3 -c "import sys,json;
d=json.load(sys.stdin)
v=d
for k in sys.argv[1].split('.'):
    v = (v or {}).get(k) if isinstance(v, dict) else None
print('' if v is None else v)" "$1"
}

log "verifying branch='$BRANCH' expected='$EXPECTED' base='$BASE' repo='${OWNER}/${REPO}'"

# --- fetch (read-only) --------------------------------------------------------
if [ "$DO_FETCH" -eq 1 ]; then
  if git_c fetch --all --prune >/dev/null 2>&1; then add_pass "git-fetch"; else add_fail "git-fetch" "git fetch --all failed"; fi
fi

# --- resolve expected commit --------------------------------------------------
EXPECTED_FULL=""
if EXPECTED_FULL="$(git_c rev-parse --verify --quiet "${EXPECTED}^{commit}" 2>/dev/null)"; then
  add_pass "expected-commit-resolves"
else
  add_fail "expected-commit-resolves" "cannot resolve --expected-commit '$EXPECTED' to a commit"
fi

# --- Gitea PR checks (unless downgraded) --------------------------------------
if [ "$SKIP_API" -eq 1 ]; then
  warn "Gitea API checks SKIPPED (--skip-gitea-api); PR-merged state is UNVERIFIED"
else
  pr_json=""
  if [ -n "$PR_NUM" ]; then
    pr_json="$(gitea_get "pulls/${PR_NUM}" 2>/dev/null || true)"
  else
    all="$(gitea_get "pulls?state=all&limit=50" 2>/dev/null || true)"
    pr_json="$(printf '%s' "$all" | python3 -c "import sys,json
try: arr=json.load(sys.stdin)
except Exception: arr=[]
br=sys.argv[1]; base=sys.argv[2]
m=[p for p in arr if (p.get('head') or {}).get('ref')==br and (p.get('base') or {}).get('ref')==base]
m.sort(key=lambda p: (1 if p.get('merged') else 0, p.get('number') or 0), reverse=True)
print(json.dumps(m[0]) if m else '')" "$BRANCH" "$BASE" 2>/dev/null || true)"
  fi
  if [ -z "$pr_json" ] || [ "$pr_json" = "null" ]; then
    add_fail "gitea-pr-exists" "no Gitea PR found for head='$BRANCH' base='$BASE'${PR_NUM:+ (#$PR_NUM)}"
  else
    add_pass "gitea-pr-exists"
    merged="$(printf '%s' "$pr_json" | json_field merged)"
    prno="$(printf '%s' "$pr_json" | json_field number)"
    mergesha="$(printf '%s' "$pr_json" | json_field merge_commit_sha)"
    if [ "$merged" = "True" ] || [ "$merged" = "true" ]; then
      add_pass "gitea-pr-merged (#$prno)"
    else
      add_fail "gitea-pr-merged" "PR #${prno:-?} for '$BRANCH' is not merged (merged=$merged)"
    fi
    # cross-check the PR merge commit against the expected commit's presence, if provided
    if [ -n "$mergesha" ] && [ -n "$EXPECTED_FULL" ]; then
      if git_c merge-base --is-ancestor "$EXPECTED_FULL" "$mergesha" 2>/dev/null; then
        add_pass "expected-in-pr-mergecommit"
      else
        add_fail "expected-in-pr-mergecommit" "expected commit not contained by PR merge commit ${mergesha:0:12}"
      fi
    fi
  fi
fi

# --- expected commit is an ancestor of the base -------------------------------
if [ -n "$EXPECTED_FULL" ]; then
  if git_c merge-base --is-ancestor "$EXPECTED_FULL" "origin/${BASE}" 2>/dev/null; then
    add_pass "expected-ancestor-of-origin/$BASE"
  else
    add_fail "expected-ancestor-of-origin/$BASE" "commit ${EXPECTED_FULL:0:12} is NOT an ancestor of origin/${BASE}"
  fi
fi

# --- three main refs agree ----------------------------------------------------
origin_sha="$(git_c rev-parse --verify --quiet "origin/${BASE}" 2>/dev/null || echo "")"
github_sha="$(git_c rev-parse --verify --quiet "github/${BASE}" 2>/dev/null || echo "")"
[ -n "$origin_sha" ] || add_fail "origin-base-resolves" "origin/${BASE} does not resolve"
[ -n "$github_sha" ] || add_fail "github-base-resolves" "github/${BASE} (mirror) does not resolve"
if [ -n "$origin_sha" ] && [ -n "$github_sha" ]; then
  # Determine the mirror↔origin relationship. Gitea/origin is authoritative.
  rel="unknown"
  if [ "$github_sha" = "$origin_sha" ]; then
    rel="equal"
  elif git_c merge-base --is-ancestor "$github_sha" "$origin_sha" 2>/dev/null; then
    rel="mirror-behind"        # clean lag: mirror is an ancestor of origin
  elif git_c merge-base --is-ancestor "$origin_sha" "$github_sha" 2>/dev/null; then
    rel="mirror-ahead"         # mirror carries commits origin does not
  elif git_c merge-base "$github_sha" "$origin_sha" >/dev/null 2>&1; then
    rel="diverged"            # a common ancestor exists but neither contains the other
  else
    rel="ancestry-error"     # unrelated histories / unresolved refs
  fi
  log "mirror-mode=${MIRROR_MODE}; github/${BASE} vs origin/${BASE}: ${rel} (github ${github_sha:0:12}, origin ${origin_sha:0:12})"
  case "$MIRROR_MODE" in
    exact)
      if [ "$rel" = "equal" ]; then add_pass "mirror exact (github==origin ${BASE})"
      else add_fail "mirror exact (${BASE})" "not in sync: ${rel} (github ${github_sha:0:12} != origin ${origin_sha:0:12})"; fi
      ;;
    ancestor)
      if [ "$rel" = "equal" ] || [ "$rel" = "mirror-behind" ]; then
        add_pass "mirror ancestor (${rel}) ${BASE}"
      else
        add_fail "mirror ancestor (${BASE})" "not equal/clean-ancestor: ${rel} (github ${github_sha:0:12}, origin ${origin_sha:0:12})"
      fi
      ;;
  esac
fi
if [ "$SKIP_API" -eq 0 ] && [ -n "$origin_sha" ]; then
  api_sha="$(gitea_get "branches/${BASE}" 2>/dev/null | json_field commit.id || true)"
  if [ -z "$api_sha" ]; then
    add_fail "gitea-api-base-head" "could not read Gitea API head of branch '${BASE}'"
  elif [ "$api_sha" = "$origin_sha" ]; then
    add_pass "gitea-api==origin ${BASE}"
  else
    add_fail "gitea-api==origin ${BASE}" "Gitea API ${api_sha:0:12} != origin/${BASE} ${origin_sha:0:12} (fetch stale or divergence)"
  fi
fi

# --- required files present on base ------------------------------------------
for f in "${REQUIRE_FILES[@]:-}"; do
  [ -n "$f" ] || continue
  if git_c cat-file -e "origin/${BASE}:${f}" 2>/dev/null; then
    add_pass "file:${f}"
  else
    add_fail "file:${f}" "required file '${f}' not present on origin/${BASE}"
  fi
done

# --- required markers present on base ----------------------------------------
for m in "${REQUIRE_MARKERS[@]:-}"; do
  [ -n "$m" ] || continue
  local_path="${m%%:*}"; regex="${m#*:}"
  if ! git_c cat-file -e "origin/${BASE}:${local_path}" 2>/dev/null; then
    add_fail "marker:${local_path}" "file for marker not present on origin/${BASE}"
  elif git_c show "origin/${BASE}:${local_path}" 2>/dev/null | grep -Eq -- "$regex"; then
    add_pass "marker:${local_path}~/${regex}/"
  else
    add_fail "marker:${local_path}" "marker /${regex}/ not found in '${local_path}' on origin/${BASE}"
  fi
done

# --- working tree clean -------------------------------------------------------
tracked_dirty="$(git_c status --porcelain=v1 --untracked-files=no 2>/dev/null || echo "ERR")"
if [ "$tracked_dirty" = "ERR" ]; then
  add_fail "clean-tree" "git status failed"
elif [ -n "$tracked_dirty" ]; then
  add_fail "clean-tree" "tracked working-tree modifications present"
else
  add_pass "clean-tree (tracked)"
fi
if [ "$STRICT_UNTRACKED" -eq 1 ]; then
  untracked="$(git_c ls-files --others --exclude-standard 2>/dev/null || echo "")"
  if [ -n "$untracked" ]; then add_fail "clean-tree-untracked" "untracked files present (--strict-untracked)"; else add_pass "clean-tree-untracked"; fi
fi

# --- optional production-state assertions ("remain unchanged") ----------------
i=0
while [ "$i" -lt "${#PROD_CMDS[@]}" ]; do
  cmd="${PROD_CMDS[$i]}"; expect="${PROD_EXPECTS[$i]}"
  got="$(bash -c "$cmd" 2>/dev/null | tr -d '\r' | sed -e 's/[[:space:]]*$//' -e 's/^[[:space:]]*//' || true)"
  if [ "$got" = "$expect" ]; then add_pass "prod-state[$i]"; else add_fail "prod-state[$i]" "assertion changed: got '$got' expected '$expect'"; fi
  i=$((i+1))
done

# --- report -------------------------------------------------------------------
echo
echo "verify-merge report — ${OWNER}/${REPO}  branch=${BRANCH}  base=${BASE}"
for p in "${PASS_NAMES[@]:-}"; do [ -n "$p" ] && echo "  PASS  $p"; done
rc=0
if [ "${#FAIL_NAMES[@]}" -gt 0 ]; then
  rc=1
  i=0
  while [ "$i" -lt "${#FAIL_NAMES[@]}" ]; do
    echo "  FAIL  ${FAIL_NAMES[$i]} — ${FAIL_DETAILS[$i]}"; i=$((i+1))
  done
fi
echo
if [ "$rc" -eq 0 ]; then echo "VERDICT: PASS (all ${#PASS_NAMES[@]} checks)"; else echo "VERDICT: FAIL (${#FAIL_NAMES[@]} failed / ${#PASS_NAMES[@]} passed)"; fi
exit "$rc"

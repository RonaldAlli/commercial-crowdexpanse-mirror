# Operational Backlog

Standalone operational fixes recorded for scheduling as their own changes. These are **not**
implemented here and are **not** part of any business-evolution initiative (e.g. BE-3). Each is a
distinct ops task with its own branch, gate, and prod-verification when picked up.

Opened alongside the BE-2 governance operational tooling (`chore/governance-operational-tooling`),
2026-07-28.

| # | Item | Why | Notes / acceptance |
|---|------|-----|--------------------|
| OPS-1 | Configure off-site R2 backup | Current restore-verified backups are local to the host; an off-site copy removes single-host loss risk. | Wire `scripts/backup.sh` R2 target (keys already namespaced `R2_*` in `.env`); verify an off-site object is written and restorable. Do not print credentials. |
| OPS-2 | Resolve or document stale `.next` / types noise on the production host | The prod working tree carries `.next`, `.next.premigration`, and `.next.rollback-*` dirs plus untracked `_ctx_lean.mjs` / `_seller_ctx_val.mjs`. They are harmless build/rollback artifacts but make `--strict-untracked` and manual `git status` noisy. | Decide: gitignore-cover + prune policy, or document as expected. Relates to [[crowdexpanse-next-ownership]] (the earlier `.next` chown incident). |
| OPS-3 | Provide safe test credentials/configuration for the env-gated E2E suite | Parts of the E2E/governance-tool live paths need real endpoints/DB; without a sanctioned non-prod config they can only be stubbed. | Supply a `.env.test`-style non-prod config (test DB + safe creds) so `npm test` and live-path smokes run against a real non-production target. Never against prod. |
| OPS-4 | GitHub mirror synchronization and lag monitoring | The GitHub mirror (`github/main`) chronically lags authoritative `origin/main` (Gitea); surfaced during BE-3 tag verification. Lag must not block work, but divergence must. | **Standard: Gitea/origin is authoritative.** A clean-ancestor lag is **observational and non-blocking**; **divergence is blocking** (enforced by `verify-merge.sh --mirror-mode ancestor`). Provide an operator **resync path** (re-trigger Gitea push-mirror, or a fast-forward push of `origin/main` → `github/main`) and a **diagnostic** (`git rev-list --count github/main..origin/main`; ancestor check). Never print tokens/credentials. |
| OPS-5 | Repository ownership normalization | Privileged (root-run) sessions created `root`-owned Git metadata (e.g. `.git/logs/refs/remotes/...`) and build artifacts in the deploy-owned repo, so the `deploy` user cannot update local tracking refs (same class as the earlier `.next` chown incident). | **Detect and correct** root-owned `.git` metadata + build artifacts (chown to `deploy`); **preserve repository integrity** (no history rewrite); **do not expose secrets**; and **prevent recurrence** (privileged sessions must not run Git in the deploy repo, or must restore ownership afterward). Relates to [[crowdexpanse-next-ownership]]. |

These map to the "keep 4–6 as separate ops fixes" direction and are deliberately decoupled from the
governance-tooling PR so that PR stays reviewable and single-purpose.

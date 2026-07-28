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

These map to the "keep 4–6 as separate ops fixes" direction and are deliberately decoupled from the
governance-tooling PR so that PR stays reviewable and single-purpose.

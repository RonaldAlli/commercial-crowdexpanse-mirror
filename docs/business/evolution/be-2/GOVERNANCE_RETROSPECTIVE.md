# BE-2 — Governance-Process Retrospective

> Guiding question: **What did BE-2 teach us about the governance *process* itself?** (Not about the
> Deal model — about how we govern.) This feedback improves the governance framework **without**
> changing the Business Architecture.

## Which evidence package was most valuable?
**Repository verification (Git + Gitea API).** It rejected **three** plausible-but-false "I merged it"
claims before any operational action — the single highest-leverage risk-prevention control of the whole
initiative. Runner-up: the **migration pre-flight guard** (verify target DB + exactly one pending
migration) immediately before mutating production.

## Which approval gate caught the most risk?
- **Repository Authority gate** — blocked operations three times on an unmerged `main`.
- **Architecture gate** — earlier blocked implementation before v1.0 was ratified.
- **Migration pre-flight** — would have caught a wrong-target or multi-migration surprise before `deploy`.

## Which verification should become automatic?
1. **Merge verification** — the 7-check (Gitea PR merged · commit on `main` · ancestor · origin/Gitea/mirror agree · files present · tree clean · prod untouched) → a single `scripts/diag/verify-merge.sh`.
2. **Migration pre-flight guard** — refuse to run `migrate deploy` unless target = expected prod DB **and** exactly the expected migration(s) pending → wrap `db:migrate:deploy`.
3. **Post-deploy monitor** — the health/pm2/rowcount/error-log sampler → a reusable `scripts/diag/post-deploy-monitor.sh`.
4. **Diff-scope check** — "changes limited to the initiative's files" as a PR check.

## Which manual steps could be standardized?
- The **Operational Execution checklist** (Backup → verify → migrate-guard → migrate → verify → deploy →
  verify → monitor → accept) → a runbook + the scripts above, preserving the stop-points.
- The **evidence packages** (Readiness, Acceptance, Production Acceptance) → templates in `evolution/`,
  reused per BE.

## Friction found (process/tooling improvements — not architecture)
- **`.next/types` stale stubs on the prod host** made `build:isolated`'s type-check noisy (it type-checks
  the live release's stale route stubs via `tsconfig.include`). Consider excluding `.next/types` from the
  isolated typecheck, or documenting it as expected. The definitive build gate is CI (fresh runner).
- **Off-site backup (R2) not configured** — the one real operational gap; schedule as a standalone
  improvement (does not block additive migrations, but should exist before larger changes).
- **Full E2E `npm test`** is blocked in this shell by an env-gated auth test (`ADMIN_ID`/`SESSION_SECRET`);
  provide those in the test env so the suite runs end-to-end rather than fail-fast.

## Net
The governance framework carried a production deployment cleanly. The improvements above are **tooling
and standardization** — codifying what we did manually — not changes to the Business Architecture.

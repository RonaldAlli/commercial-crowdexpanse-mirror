# Volume 7 — Technical Debt

> Known issues, refactors, and scaling/security/infra limits. Each item: what, why it matters, and the trigger to fix it. Add to this list whenever a change knowingly leaves debt; clear items when resolved.

## Known Issues

| # | Item | Impact | Trigger to fix |
|---|---|---|---|
| D1 | ✅ **Resolved — Prisma Migrate adopted** (baseline `0_init` captures the pre-existing schema; test tooling + CI run `migrate deploy`) | Schema evolution is now auditable and versioned | Resolved (Slice 3a-i) |
| D2 | **Org scoping by convention, not RLS** | A missed `organizationId` filter could leak data | When adding contributors / before scale; add cross-org tests now |
| D3 | **Local filesystem document storage** | Doesn't scale past one VPS; no redundancy | Documents growth / 1.4 Closing |
| D4 | **Backups implemented** (`scripts/backup.sh`, six-stage, encrypted, verified restore) — **not yet scheduled; R2 creds not provisioned** | Off-host DR incomplete until R2 + cron enabled | Provision R2 bucket/creds + enable cron/timers (operational step) |
| D5 | **`.next` nested files root-owned on host** | Plain `npm run build` fails on host; must use `build:isolated` | One-time `sudo chown`; low urgency |
| D6 | **Email transport shipped + first consumer live** — `MessageService`/`EmailMessage` outbox, Console + SMTP, closed typed registry with per-kind retry policy; **invitation email delivery** wired (Slice 3d-ii, `inline-only`). **Deferred:** cron-scheduled drain (drainable kinds), bounce/complaint webhooks + admin failed-send view, Resend/API transport, notification digests | Invitations now emailed (copy-link retained); digests/campaigns pending | Password reset 3e; schedule drain + webhooks operationally; campaigns 2.0 |
| D7 | ✅ **Resolved — RBAC enforced across all write actions** (Slice 1 + 2) | Policy in `lib/permissions.ts`, enforced + audited in `lib/authorize.ts`; every create/update/delete/move/manage checks it. Field-level limited to opportunity stage by decision | Resolved (Slice 2) |
| D8 | ✅ **Resolved (PQ-1) — unit tests on pure logic** | `node:test`+`tsx` suite under `tests/unit/**`; branch-gated ≥90% critical (analysis/matching/list-params/task-sort/permissions) / ≥80% overall; wired into `test:ci` + CI | Resolved 1.1; 1.3 adds worked-example formula tests |
| D11 | **Unit coverage gate is a custom branch-% proxy** | Node 20's `node:test` line coverage is unreliable under `tsx`; the gate parses the report instead of using native thresholds | Low — replace `scripts/run-unit-tests.mjs` gate with native `--test-coverage-lines`/`--test-coverage-include` after a Node 22+ upgrade |
| D9 | **Gitea Actions unconfirmed** | CI runs only on the GitHub mirror | When a Gitea runner is confirmed |
| D10 | **Password reset absent; session policy partial** | No self-serve password reset; session lifetime is a fixed 8h TTL. Per-user immediate invalidation now exists (`sessionsValidAfter` epoch, added in 3a for deactivation) | **Slice 3e** — password reset builds on the 3d-i email infrastructure (D6) |

## Future Refactors
- **Migrations:** ✅ done (D1). `prisma migrate` adopted with a `0_init` baseline of the pre-existing schema; `scripts/test-db.mjs` and CI use `migrate deploy`. Author new migrations via the no-shadow path (`migrate diff` → `migrate deploy`) since the app role lacks CREATEDB.
- **Storage abstraction:** put an interface in front of `lib/storage.ts` so local↔object storage is swappable (D3).
- **Authorization layer:** ✅ done (D7). Centralized in `lib/permissions.ts` (pure policy) + `lib/authorize.ts` (enforcement + audit); all write actions checked, denials audited, ADMIN denial report at `/settings/security`. Future (post-1.1): field-level financial permissions and RLS backstop only if a business need appears.
- **List relation search:** generalize `lib/list-params.ts` to support relation filters cleanly (deferred across Better Lists slices).

## Performance
- ✅ **p95 budgets set + measured (PQ-3 baseline, PQ-4 optimization).** Board < 300 ms, Search < 250 ms, lists < 200 ms; all met with large headroom at 1k opps / 2k props / 5k tasks. Board optimized (PQ-4a — dedicated `select`, p95 ~109 → ~43 ms). Re-measure via `npm run perf:measure` / `npm run perf:explain`.
- Global Search is a linear scan pattern — fast at current volume (p95 ~13 ms) but **needs indexing/ranking (e.g. `pg_trgm`) at larger volume**; deferred by design until a baseline shows it approaching budget.
- Review indexes for new list search/sort columns as row counts grow (none needed today — `EXPLAIN`-confirmed).

## Scaling
- Single VPS: app + DB + documents co-located — a single failure domain.
- Board view loads all opportunities (by design), now with a **narrowed payload** (PQ-4a) — well within budget at current scale. **Pagination/virtualization are documented future scalability options** ([Performance](./PERFORMANCE.md#pq-4--complete)), to be added only if a future baseline breaches the board budget at large pipelines.
- No caching layer; every page is `force-dynamic` (out of scope for 1.1 by decision — a future option, not current debt).

## Security
- Add cross-org access tests (enforce D2 invariant).
- Rate-limit auth endpoints; add login throttling.
- Upload hardening: content-type validation + virus scanning (beyond the existing size/path guard).
- Audit-log coverage review for sensitive actions (role changes, deletes).

## Infrastructure
- No staging environment (release verification happens against local + CI only).
- In-place host build risks brief disruption — move toward staged/rolling deploys.
- Backups/monitoring/alerting gaps tracked in [Operations](./OPERATIONS_ROADMAP.md).

## Debt policy
- A change may add debt **only** with an entry here and a trigger.
- Release checklists review this list; no release ships with an open **release-blocking** item. (D4 backups are now implemented + restore-verified locally; the remaining release-blocking piece is enabling the **off-host mirror** — provision R2 creds — and scheduling.)

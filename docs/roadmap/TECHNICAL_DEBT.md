# Volume 7 — Technical Debt

> Known issues, refactors, and scaling/security/infra limits. Each item: what, why it matters, and the trigger to fix it. Add to this list whenever a change knowingly leaves debt; clear items when resolved.

## Known Issues

| # | Item | Impact | Trigger to fix |
|---|---|---|---|
| D1 | **No Prisma migration history** — schema managed by `db push` | No auditable schema evolution; risky for prod changes | **Before 1.2** (first real schema growth) |
| D2 | **Org scoping by convention, not RLS** | A missed `organizationId` filter could leak data | When adding contributors / before scale; add cross-org tests now |
| D3 | **Local filesystem document storage** | Doesn't scale past one VPS; no redundancy | Documents growth / 1.4 Closing |
| D4 | **No automated DB/document backups** | Data-loss risk; no verified restore | **Immediate** (Ops top priority) |
| D5 | **`.next` nested files root-owned on host** | Plain `npm run build` fails on host; must use `build:isolated` | One-time `sudo chown`; low urgency |
| D6 | **No email transport** | Invitations can't deliver; no notifications/campaigns | 1.1 (invitations) / 2.0 (campaigns) |
| D7 | **Roles defined but not fully enforced** | Any authed user can do most actions | 1.1 permission matrix |
| D8 | **No unit tests on pure logic** | Underwriting/matching math unguarded | 1.1 (lib), 1.3 (formulas) |
| D9 | **Gitea Actions unconfirmed** | CI runs only on the GitHub mirror | When a Gitea runner is confirmed |
| D10 | **Password reset / session policy absent** | Operational friction; unclear session lifetime | 1.1 hardening |

## Future Refactors
- **Migrations:** adopt `prisma migrate` with a baseline from current schema (resolves D1); wire into deploy + CI.
- **Storage abstraction:** put an interface in front of `lib/storage.ts` so local↔object storage is swappable (D3).
- **Authorization layer:** centralize the permission matrix so server actions check one policy module (D7).
- **List relation search:** generalize `lib/list-params.ts` to support relation filters cleanly (deferred across Better Lists slices).

## Performance
- p95 budgets unset for the heaviest paths (Opportunities board, Global Search).
- Global Search is a linear scan pattern — needs indexing/ranking at volume.
- Review indexes for new list search/sort columns as row counts grow.

## Scaling
- Single VPS: app + DB + documents co-located — a single failure domain.
- Board view loads all opportunities (by design) — revisit at large pipelines.
- No caching layer; every page is `force-dynamic`.

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
- Release checklists review this list; no release ships with an open **release-blocking** item (currently: D4 backups before relying on prod data further).

# BE-2 Step 1 — Implementation Log

> Factual milestones (complements, does not replace, git history). Branch `align/be-2-deal`.

## Gate closure
- **M1 declared** — Business Architecture v1.0 ratified; merge commit `8b73426` on `origin/main`;
  verified via Git + Gitea API (PR #1 `merged=True`; main/Gitea/mirror synced; tag → `4a82d1f`).
- Rebased `align/be-2-deal` onto merged `main`.

## Implementation (additive; nothing wired to a live path)
- `prisma/schema.prisma` — added `model Deal` (org-scoped; `opportunityId @unique`; `controlFactId`,
  `controlledAt`, `controlInstrumentType?`, `controlInstrumentReference?`, `businessArchitectureVersion?`);
  added back-relations `Opportunity.deal Deal?` and `Organization.deals Deal[]`. No existing field changed.
- `prisma/migrations/20260727130556_add_deals/migration.sql` — additive `CREATE TABLE "deals"` + unique
  index on `opportunityId` + `organizationId` index + two FKs (Cascade). No `ALTER` on existing tables.
- `lib/deal.ts` — pure rules: `selectControlFact` (active, non-withdrawn `CONTRACT_EXECUTED` DECISION),
  `controlledAtOf`, constants.
- `lib/deal-service.ts` — `ensureDeal` (org-scoped, idempotent get-or-create + P2002; refuses without an
  active control fact; best-effort `deal.controlled` ActivityLog), `getDeal`, `activeControlFact`.
- Tests: `tests/unit/deal/select-control-fact.test.ts` (pure) · `scripts/e2e-deal.mjs` (23 assertions).

## Validation (all isolated from production)
| Gate | Result |
|---|---|
| `prisma generate` | ✅ |
| Migration → **`_test`** DB (guarded) | ✅ applied cleanly |
| `tsc --noEmit` (source) | ✅ clean (only pre-existing `.next/types` release-stub noise) |
| `next lint` | ✅ no warnings/errors |
| `test:unit` | ✅ branch 93% (incl. Deal pure tests) |
| `scripts/e2e-deal.mjs` | ✅ 23/23 |
| Adjacent regression (pipeline-facts/projection/tenant-scope/stage-policy/property-projection) | ✅ all green |
| `build:isolated` | ⚠ app **compiled successfully**; type-check tripped only on the **live prod release's stale `.next/types` stubs** (`.next` → `releases/r1029…`; unrelated to BE-2). Definitive build gate = CI (fresh runner). |
| Full `npm test` (fail-fast) | ⏸ blocked by pre-existing env-gated `e2e-ai-admin-save` (needs `ADMIN_ID`/`SESSION_SECRET`), which runs before `e2e-deal` — unrelated to BE-2 |

## Explicitly NOT done (by design / deferred)
- **Not applied to the production database** and **not deployed** — that is a separate, backup-gated
  operator step (`scripts/backup.sh adhoc` → `prisma migrate deploy` → deploy via D25). This host is the
  production instance; `.env` targets the prod DB, so all validation used `_test` only.
- No re-parenting, no backfill, no UI, no live wiring, no Opportunity behavior change. Stopped before Step 2.

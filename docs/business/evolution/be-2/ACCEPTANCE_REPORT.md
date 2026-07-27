# BE-2 Step 1 — Acceptance Report

## Implementation
A first-class, organization-scoped **`Deal`** aggregate now exists, derived deterministically from the
canonical "Deal Controlled" event (implemented today as the `CONTRACT_EXECUTED` decision fact). It is
**additive and inert**: no existing table, route, screen, report, or Opportunity behavior changed.

- **Schema:** `model Deal` — `id`, `organizationId`, `opportunityId @unique`, `controlFactId`,
  `controlledAt`, `controlInstrumentType?`, `controlInstrumentReference?`, `businessArchitectureVersion?`,
  timestamps. Back-relations on Opportunity (`deal Deal?`) and Organization (`deals Deal[]`).
- **Migration:** `20260727130556_add_deals` — additive `CREATE TABLE` + unique(`opportunityId`) + FK Cascade.
- **Service:** `ensureDeal(org, opportunity, actor?)` — org-scoped (validates the Opportunity in-org),
  idempotent (get-or-create + P2002), **refuses without an active control fact**, best-effort audit.
- **Boundary honored (D-2):** the Deal owns legal control only; escrow/financing/assignment/closing/
  settlement/revenue remain on the Opportunity today and re-parent to **Transaction (BE-5)**, never Deal.

## Validation
| Gate | Result |
|---|---|
| Migration on `_test` | ✅ applied cleanly |
| Typecheck (source) | ✅ clean |
| Lint | ✅ clean |
| Unit (pure Deal rules) | ✅ branch 93% |
| E2E `e2e-deal` | ✅ 23/23 — create-from-fact, idempotency, concurrency (P2002), org isolation, uniqueness, refuse-without-control, retracted-control-refused, no-Opportunity-regression, audit |
| Adjacent regression | ✅ pipeline/projection/tenant-scope/stage-policy green |
| Build | ⚠ app compiled; type-check tripped only on the running release's stale `.next/types` (pre-existing; CI is the fresh-build gate) |

## Alignment movement
**Deal: 10% → ~25%** — see `DASHBOARD_DELTA.md`. Structural existence with a deterministic, org-safe,
idempotent creation path; **not yet load-bearing** and **inert in production**.

## What remains unsupported (honest)
- **Production value = 0 until control-fact emission is decided** (O-2): the pipeline write path is
  dormant, so no `CONTRACT_EXECUTED` facts are produced live; `ensureDeal` would create no Deals in prod.
- No re-parenting (→ BE-5), no Deal Workspace, no reporting authority, no backfill.
- **Not deployed / not applied to the prod DB** — separate backup-gated operator step, not performed here.

## Verdict
**Step 1 accepted on the branch** (`align/be-2-deal`), gated and prod-verified in isolation. Stops before
Step 2. Production application/deploy awaits explicit authorization with a backup, on the prod host.

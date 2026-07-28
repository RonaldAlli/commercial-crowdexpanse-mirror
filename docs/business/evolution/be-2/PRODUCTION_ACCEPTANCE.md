# BE-2 Step 1 — Production Acceptance Evidence Package

> **🏛️ M3 — Production Acceptance (2026-07-28).** BE-2 Step 1 operationally accepted and closed.
> Verdict: **PRODUCTION ACCEPTED WITH OBSERVATIONS.** Executed under stage-gated Operational
> Execution (Backup → Migration → Deploy → Monitor), each stage stopped for explicit approval.

## Deployment
| Item | Value |
|---|---|
| Deployed commit | `ca76c0f` (BE-2, PR #2) — prior running commit `913f0f0` |
| Deployed release | `releases/r1137725878952438-1613504` · BUILD_ID `jkdX1_0tSC1CEX_d6sdSB` |
| D25 dry-run | ✅ validated build + swap/rollback targets + single-active; live server unchanged |
| D25 deployment | ✅ PRECHECK → BUILD → VERIFY_BUILD → SWAP → RESTART → VERIFY_RUNTIME → SMOKE → COMPLETE |

## Runtime
| Check | Result |
|---|---|
| `/api/health` | ✅ `{"status":"ok"}`, dbMs ~3–5 |
| PM2 | ✅ `crowdexpanse-commercial` online; pid + restart count constant (no loop) |
| Log summary | ✅ clean — only a **stale** pre-deploy error entry (23:29 prior night, unrelated); no new errors |

## Database
| Check | Result |
|---|---|
| Migration status | ✅ `20260727130556_add_deals` applied; "schema up to date" |
| `deals` table | ✅ exists — unique `deals_opportunityId_key`, index `deals_organizationId_idx`, FKs → `opportunities`/`organizations` |
| Row count | ✅ **0** (expected — Step 1 inert) |
| Backup (pre-migration) | ✅ `20260728-055746Z`, restore-verified (restore-test PASS, counts MATCH); local-only (R2 off-site not configured) |

## Business verification
- **Opportunity workflow unaffected** — the change added only the `Deal` model + a nullable
  `Opportunity.deal` back-relation; no Opportunity code/query path was touched; routes 200, build +
  runtime green.
- **Existing functionality unaffected** — health stable; migration invisible to the running release
  until the code deploy (additive).
- **No Deal creation** — 0 rows, as expected (no control facts emitted live; O-2 pending).

## Monitoring
| Item | Value |
|---|---|
| Duration | 06:14:27 → 06:17:31 UTC (~3 min) |
| Samples | 6 @ 30s |
| Restart-count delta | **0** (pid `1620112`, restarts `137` constant) |
| Health failures | 0 |
| New error entries | 0 (error-log mtime unchanged) |
| Incidents | **None** |

## Final verdict — PRODUCTION ACCEPTED WITH OBSERVATIONS
Observations (known/accepted, non-blocking): (1) Step 1 is **inert by design** — `deals` stays 0 until
the O-2 control-fact-emission decision; (2) **off-site backup (R2) not configured** — a separate
operational improvement; (3) the stale pre-deploy error-log entry is unrelated to this rollout.

**BE-2 Step 1 lifecycle:** Architecture approved (M1) → Implementation merged (M2) → Database migrated
→ Code deployed → Runtime verified → Monitoring completed → **Production accepted (M3).**

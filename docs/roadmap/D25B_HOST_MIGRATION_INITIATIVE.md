# D25b — Production Host Migration · Operational Initiative

> **Status: NOT STARTED — separate operational approval required. No host changes yet.**
> D25a (the [Deployment Engine](./D25_DEPLOYMENT_ENGINE_DESIGN.md)) is code, merged, and self-tested.
> D25b is the **one-time operational cutover** of the production host to the model the engine expects.
> This is no longer a software-engineering problem — it is an **operations exercise** with its own
> runbook, its own approval, and a mandatory staging rehearsal before any production change.

---

## 1. What D25b does (and does not)

**Does:** convert the live `.next` on production (`/opt/crowdexpanse/commercial`, currently a **173 MB
real directory**) into a **symlink** into a `releases/` history, so the Deployment Engine's atomic swap
applies. The current live build becomes **release #1** (backfilled with a `.release-id` + `release.json`).

**Does not:** change application behavior, schema, or the running build. It is a filesystem-layout
cutover. Automation (D19) and the 512 MB memory policy (D24) are untouched.

**Boundary:** D25a = code (done). D25b = host cutover (this doc). The engine is never *executed* against
production until the migration is complete **and** the staging rehearsal below has passed.

---

## 2. Preconditions (all must hold before scheduling)

1. D25a reviewed + merged to `main` (✅ `766ff50`).
2. A **staging-like environment** available for the full rehearsal (§4).
3. A **restore-verified DB backup** taken immediately before (code-only cutover touches no DB, but the
   standing discipline applies).
4. A **quiet window** (low traffic; graceful pm2 memory-recycles per D24 are expected background noise).
5. Explicit **operator authorization** for this specific migration (separate from D25a approval).
6. Runs as `deploy` (never root); the D5/D23 ownership guard stays in force.

---

## 3. Migration runbook (reversible)

The migration is designed to be **revertible to a plain `.next` directory** at every step.

```
0. PRE     backup (restore-verified) + record current BUILD_ID + `readlink .next` (expect: not a link yet)
1. STAGE   mkdir -p releases/
           cp -a .next releases/<init-stamp>        # current live build becomes release #1 (copy, not move)
           write releases/<init-stamp>/.release-id  (= current git HEAD short)
           write releases/<init-stamp>/release.json (backfilled manifest)
2. VERIFY  releases/<init-stamp>/BUILD_ID == current live BUILD_ID; manifests present
3. CUTOVER (the single one-time non-atomic step — done in the quiet window):
           pm2 stop crowdexpanse-commercial
           mv .next .next.premigration            # keep the real dir as an immediate revert artifact
           ln -s releases/<init-stamp> .next       # .next is now a symlink
           pm2 start crowdexpanse-commercial
4. ASSERT  single-active invariant holds (.next is a symlink → exactly one valid release)
           pm2 online + /api/health ok + BUILD_ID unchanged + key routes 200/redirect
5. SETTLE  short observation vs the Operations Baseline (health, restart character, error log clean)
```

**Revert (at any point):**
```
pm2 stop → rm .next (symlink) → mv .next.premigration .next → pm2 start → verify
```
Because step 1 **copies** (not moves) and step 3 keeps `.next.premigration`, the original real directory
survives the whole procedure; revert is a symlink removal + rename.

**Retention after success:** once the symlink model is proven live, `.next.premigration` and the legacy
`.next.rollback-*` snapshots are pruned by the engine's retention (bounded to last N).

---

## 4. Acceptance gate — mandatory staging rehearsal (BEFORE any production migration)

The engine must be exercised **end-to-end on a staging-like host** in exactly this sequence, all passing,
before production migration is requested:

```
Dry Run → Forced Failure → Rollback → Recovery → Second Dry Run → Normal Deployment → Smoke
```

| Step | Action | Pass criteria |
|---|---|---|
| **Dry Run** | `deploy --dry-run` | build + swap-target + rollback-target + single-active + disk/retention validated; **live symlink unchanged**; history record written |
| **Forced Failure** | deploy with an injected post-swap failure (e.g. restart/smoke) | engine **auto-rolls-back**: symlink → previous release, previous BUILD_ID restored, process restarted, **no manual intervention**; history record shows `SWAP:ok → …:error → ROLLBACK:done` |
| **Rollback** | (the above) | previous release serving; health ok; single-active invariant holds |
| **Recovery** | corrected deploy | new release swapped, restarted, verified, smoke ok |
| **Second Dry Run** | `deploy --dry-run` again | still non-mutating; idempotent; validates cleanly |
| **Normal Deployment** | `deploy` (no flags) | atomic swap; **zero** "Could not find a production build" errors; `restart_time` +1; `unstable_restarts` 0 |
| **Smoke** | health + key routes + BUILD_ID + migrations | all green; serving the new release |

Only after this rehearsal passes end-to-end is the **production** migration (§3) authorized.

---

## 5. Risks (migration-specific) + mitigations

| Risk | Mitigation |
|---|---|
| The one-time non-atomic cutover (step 3) has a brief stop window | done under `pm2 stop/start` in a quiet window; seconds, not a build; the real dir is retained for instant revert |
| Wrong/broken symlink target | step 4 asserts the single-active invariant + BUILD_ID before declaring success; else revert |
| `releases/` on a different filesystem than `.next` | verify same filesystem so future swaps are `rename(2)`-atomic (pre-cutover check) |
| Disk pressure from the copy (173 MB) | pre-cutover disk check (engine already enforces headroom); prune legacy `.next.rollback-*` first |
| Operator error mid-procedure | every step reversible; `.next.premigration` retained; runbook is copy-paste explicit |

---

## 6. Exit — when D25b is complete

- Production `.next` is a symlink into `releases/`; the current build is release #1.
- The Deployment Engine has performed at least one **real** atomic deploy on production with a clean
  error log and `restart_time` +1.
- The deploy runbook + [Operations Baseline](./OPERATIONS_BASELINE.md) are updated (the transient
  "Could not find a production build" note is removed).
- D25 is then fully closed (D25a code + D25b cutover).

---
*Stop point: this initiative is defined but NOT started. It requires its own operator authorization, and
the §4 staging rehearsal must pass before any production host change. Nothing here executes until then.*

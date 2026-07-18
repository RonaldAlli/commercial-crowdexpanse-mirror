# Version 2.0 · Phase 2.0.1 — Stability Decision Package

> **Status: PENDING FOUNDER REVIEW.** Companion to the [Stabilization
> Audit](./V2_0_1_STABILIZATION_AUDIT.md) and [Change Inventory](./V2_0_1_CHANGE_INVENTORY.md).
> This package presents options **neutrally**. It does **not** make the decision. The automation
> rollout stays PAUSED until you choose.
>
> **UPDATE 2026-07-17:** Decision 1 has been advanced along the **1a (adopt & reconcile)** path —
> the live CRM work is now captured on `stabilize/crm-production-reconciliation` (faithful,
> isolated-tested, pushed) and awaits your review/acceptance before merge. Decisions 2 (automation
> launch fix) and 3 (sequencing) remain open. See [CRM Reconciliation
> Acceptance](./CRM_PRODUCTION_RECONCILIATION_ACCEPTANCE.md).

---

## The situation in one paragraph

Production is **healthy** and the frozen V1.3/V1.4 engine + the accepted automation spine are
**intact and inert**. However, an unrelated CRM feature set (contacts / outreach / opportunity
diligence / lead import) was built and deployed **directly in the production checkout** — it is
**live with ~6,900 rows** but **entirely uncommitted, unpushed, unreviewed, and undocumented**,
and it applied **3 migrations to the prod DB that git `main` does not contain**. Separately, the
automation dark start is still blocked by the `tsx` runtime-launch issue. Nothing here is
automation-unsafe, but git `main` no longer represents production, so we should stabilize the
repository ⇄ production relationship before resuming the rollout.

---

## What is NOT in question (established by the audit)

- Production web is healthy; no 500s; error log clean.
- Frozen underwriting/closing engine byte-unchanged; D15 untouched.
- Automation spine byte-unchanged; migration 27 checksum-verified; automation **inert** (0/0/0);
  executor **never started**.
- All concurrent migrations are **additive** (no destructive op); no drift; nothing rolled back.

---

## The decisions you need to make

### Decision 1 — What to do with the concurrent CRM work (it is already live)

| Option | What it means | Trade-off |
|---|---|---|
| **1a. Adopt & reconcile (recommended)** | Its author commits the feature set + 3 migrations to a branch, pushes, opens it for review; we make `main` represent production again | Keeps the shipped value; requires retroactive review; correct end state |
| **1b. Adopt code, gate the risky parts** | Commit everything, but hold `xlsx`/lead-import behind review before further use | Same, with tighter control on the security surface |
| **1c. Revert in production** | Roll production back to the accepted `07add1e` build + reverse the 3 migrations | **Destructive** (drops 6,897 live rows + additive columns); high blast radius; **not recommended** |

> Because the work is **additive and live with real data**, reverting is costly and risky. The
> audit recommends **1a/1b** (adopt + reconcile + review), not revert.

### Decision 2 — The automation runtime-launch blocker

| Option | What it means | Trade-off |
|---|---|---|
| **2a. Focused fix (recommended)** | Promote `tsx` → `dependencies` and add `--import tsx` to the `crowdexpanse-automation` PM2 app; re-gate; commit; then the dark start can proceed | Small, proven, behavior-neutral; unblocks the rollout |
| **2b. Compile the runtime to JS** | Build `automation-runtime` to plain `.js` so no loader is needed | Larger change; new build step; more surface |
| **2c. Defer** | Leave automation dark until later | Rollout stays paused; no risk |

### Decision 3 — Sequencing of the automation rollout vs. the concurrent work

| Option | What it means | Trade-off |
|---|---|---|
| **3a. Stabilize first, then resume (recommended)** | Reconcile + review the concurrent work and fix the launch blocker **before** any dark start | Cleanest; `main` represents prod before we add runtime behavior |
| **3b. Resume automation in parallel** | Fix the launch blocker and dark-start now, reconciling CRM work separately | Faster, but adds a running process while `main` still misrepresents prod |
| **3c. Hold everything** | Keep both paused pending broader planning | Maximum caution; no progress |

---

## Recommended path (for your approval — not executed)

1. **Author reconciles** the concurrent CRM work: commit the 14 modified + 24 untracked paths +
   3 migrations to a review branch; push to Gitea + GitHub. (**Decision 1a/1b**)
2. **Review** the CRM work — code review, org-scoping check on the new server actions, and a
   **security review of `xlsx`** + the lead-import file-parsing path; wire the bundled unit test
   into the gate; decide on the two loose root scripts.
3. **Reconcile migrations** — ensure git contains exactly the 30 applied migrations; never
   re-apply them.
4. **Fix the automation launch blocker** (`tsx` → deps + `--import tsx`), re-run the full gate.
   (**Decision 2a**)
5. **Restore worktree isolation** (dedicated `node_modules`) so audits/tests are reproducible.
6. **Resume Phase 2.0.1** dark start → observing → production acceptance. (**Decision 3a**)

Each step is a separate, reviewable action. **None is executed by this document.**

---

## What stays true regardless of your choice

- The automation executor remains **stopped**; no scheduler, no proof job, no domain effect.
- The additive automation schema (migration 27) **stays in place** (no safety reason to remove).
- Frozen V1.3/V1.4 refs and D15 remain untouched.
- No release tag or frozen branch is created.
- No production restart, migration, or deploy is performed without your explicit authorization.

---

## Open questions for you

1. Who owns the concurrent CRM work, and should it be committed under its own branch/PR for
   review before we treat it as part of the accepted baseline?
2. Do you approve the focused automation launch-blocker fix (Decision 2a)?
3. Do you want the automation rollout to **wait** for CRM reconciliation (3a) or proceed in
   parallel (3b)?
4. Should the `xlsx` dependency + lead-import parsing get a dedicated security review before it
   processes any further uploads?

*Awaiting your decision. Nothing proceeds until you choose.*

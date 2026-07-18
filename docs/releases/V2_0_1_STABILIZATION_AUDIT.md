# Version 2.0 · Phase 2.0.1 — Stabilization Audit

> **Status: PENDING FOUNDER REVIEW.** Read-only audit conducted 2026-07-17. No code was
> changed, no migration applied, no process started, no executor launched. The Phase 2.0.1
> automation rollout remains **PAUSED** at the dark-start step. Production is **healthy**.
>
> **Companions:** [Change Inventory](./V2_0_1_CHANGE_INVENTORY.md) · [Stability Decision
> Package](./V2_0_1_STABILITY_DECISION_PACKAGE.md) · [Implementation Acceptance](./V2_0_1_IMPLEMENTATION_ACCEPTANCE.md) ·
> [Architecture Traceability](./V2_0_1_ARCHITECTURE_TRACEABILITY.md).

---

## 0. Executive summary

Between the accepted Phase 2.0.1 checkpoint (`07add1e`, migration 27) and this audit, **a
separate, unrelated body of CRM feature work was developed directly in the production checkout
by the shared deploy identity** — owner contacts, contact operations/outreach, opportunity
diligence, and DealAutomator lead import. It is **live in production with real data** (6,897
`owner_contacts`, 6,897 `sellers` with new columns, 24 `opportunity_diligence_items`) but is
**entirely uncommitted and unpushed** (0 new commits; 14 modified + 24 untracked paths,
including 3 already-applied migrations).

**The good news is strong and specific:**
- The **frozen V1.3/V1.4 underwriting + closing engine is byte-unchanged** (`lib/analysis.ts`,
  `lib/closing.ts`, escrow/financing/assignment, transaction-dashboard/timeline, underwriting/,
  offer-memo — all identical to `v1.4.0`).
- The **automation spine is byte-unchanged** vs the accepted `07add1e` (`lib/automation/*`,
  `ecosystem.config.js`, `app/api/automation`, the runtime, and **migration 27**).
- **Automation is completely inert** — `automation_jobs`, `automation_executions`, and
  `AUTOMATION`-attributed `ActivityLog` rows are all **0**; the executor was **never started**.
- Migration 27's checksum in the DB **matches** the repo file (not edited post-apply); **no
  drift**, **0 rolled-back**, **0 unfinished** migrations; **all concurrent migrations are
  additive** (no destructive op).
- Production is **healthy** — web `status:ok`, all routes (incl. the new ones) return 307/200
  with no 500s, error log clean.

**The concerns are governance/process, not automation-safety:**
1. **Repo ⇄ production divergence** — prod DB is at **30 migrations**; git `main` is at **27**.
   The 3 concurrent migrations and all concurrent code are uncommitted/unpushed. A clean deploy
   from `main` today would be missing schema the DB already has (drift on a fresh checkout).
2. **Unreviewed live feature work** — the concurrent CRM work has no review, no docs, no tests
   in the accepted suite, yet serves ~6,900 rows in production.
3. **Automation runtime launch blocker (unchanged)** — `crowdexpanse-automation` is configured
   to run under plain `node`, which cannot import the runtime's `.ts` modules; `tsx` remains a
   **devDependency**. The dark start cannot proceed until this is corrected.
4. **New `xlsx ^0.18.5` production dependency** (SheetJS) added for lead import — a security
   surface (SheetJS has a history of prototype-pollution/ReDoS advisories) that has had no review.
5. **Worktree test isolation was broken** — the audit's own E2E re-run failed **because** the
   shared `node_modules` Prisma client was regenerated against the concurrent schema while the
   worktree test DB is still at 27 (details in §6). This is an **environment defect, not an
   application defect**.

**No production-harming defect was found. No emergency correction was required.**

---

## 1. Exact starting state (Step 1)

| Item | Value |
|---|---|
| Prod checkout (`/opt/crowdexpanse/commercial`) branch / HEAD | `main` / `07add1e` |
| Worktrees | `/opt/crowdexpanse/commercial` → `07add1e [main]`; `/opt/crowdexpanse/wt-v201` → `07add1e [feature/v2.0.1-automation-foundation]` |
| `main` local / Gitea / GitHub | `07add1e` / `07add1e` / `07add1e` (all match) |
| Unpushed commits on `main` | none |
| Feature/hotfix branches | only `feature/v2.0.1-automation-foundation` (local + both remotes, at `07add1e`) |
| Stashes | none |
| Tags | `v1.0.0`, `v1.1.0`, `v1.2.0-slice.1`, `v1.2.0-slice.2`, `v1.3.0`, `v1.4.0` (no v2.0.1 tag) |
| Working tree | **14 modified + 24 untracked, 0 staged, 0 commits** (all concurrent work uncommitted) |
| Prod build ID (`.next/BUILD_ID`) | `fWqzJm1Ca_-dscQZVtMP5` (rebuilt 2026-07-17 15:08 from combined code — **not** the `Xf0kRt2fLR8RqFJgcYidU` deployed by the rollout) |
| Prod migration count | **30** |
| PM2 | `crowdexpanse-commercial` online (55 restarts, ~0.4% CPU, 127 MB); `crowdexpanse-automation` **absent** |
| Web health | `{"status":"ok"}` |
| Automation executor | **never started** |

**Explicit confirmations:**
- `release/1.3` = `d341c0a` · `release/1.4` = `ece38aa` · `v1.3.0` = `bca39f4` · `v1.4.0` =
  `c1133ad` — **all unchanged**.
- **D15 untouched** — `model DealAnalysis` still present (not removed).
- Migration 27 is **no longer the latest** — three additive migrations dated 2026-07-17 follow it.
- Automation tables **empty** (0 jobs / 0 executions / 0 AUTOMATION ActivityLog rows).
- `crowdexpanse-automation` has **never** been started.

---

## 2. Changes since the accepted checkpoint (Step 2)

Comparison base: accepted Phase 2.0.1 `main` (`07add1e`), production build
`Xf0kRt2fLR8RqFJgcYidU`, migration count 27, executor stopped (TS runtime-loader issue).

- **New commits since `07add1e`:** none. All change is uncommitted working-tree state.
- **Changed files:** 14 modified (`app/(workspace)/{analyzer,dashboard,opportunities,owners,
  properties,sellers}` pages, `owners/actions.ts`, `components/{stat-card,workspace-shell}.tsx`,
  `lib/auth.ts`, `package.json`, `package-lock.json`, `prisma/schema.prisma`) + 24 untracked
  (contacts, atm-wholesale calculator, opportunity-diligence, lead-import, 3 migrations, loose
  scripts). Full enumeration in the [Change Inventory](./V2_0_1_CHANGE_INVENTORY.md).
- **Schema/migration differences:** +3 models (`OwnerContact`, `ContactTouch`,
  `OpportunityDiligenceItem`), +4 enums, additive nullable/defaulted columns on `sellers`/`buyers`;
  +3 additive migrations (26→…→30 relative to prod).
- **Dependency changes:** `+xlsx ^0.18.5`; one new npm script. `tsx` remains devDependency.
- **PM2 / runtime config:** `ecosystem.config.js` **unchanged** (automation app still declared,
  kill-switch `0`, not started).
- **Env expectations:** `xlsx` now required at runtime for lead import.
- **Direct production edits not in Git:** the entire concurrent body (uncommitted) + 3 migrations
  applied to the prod DB.
- **Generated/runtime files tracked:** none newly tracked; two ad-hoc root scripts
  (`ce_counts_records.js`, `ce_verify_records.js`) are untracked working-tree artifacts.

**Provenance classification:** the concurrent work is **intentional but undocumented** feature
development (author: shared "BreadBasket Deploy" identity), **unrelated** to Phase 2.0.1,
currently **incomplete from a governance standpoint** (uncommitted/unpushed/unreviewed). No
change of **unknown provenance** or **accidental** nature was found beyond the two loose root
scripts (unknown-provenance, low-risk).

---

## 3. Architecture-boundary impact (Step 3)

| Boundary | Result |
|---|---|
| `lib/analysis.ts` (underwriting kernel) | **unchanged** vs `v1.4.0` |
| Scenario/findings/decisions/snapshots/Offer-Memo/`UNDERWRITING_APPROVAL` | modules unchanged vs `v1.4.0`; no deterministic calc altered; no AI/automation calc input |
| Closing checklist / PAID gate / Escrow / Financing / Assignment | `lib/closing.ts`, `lib/escrow.ts`, `lib/financing.ts`, `lib/assignment.ts` **unchanged**; composed PAID gate intact |
| Transaction Dashboard / Timeline / badges / shared projections | `lib/transaction-dashboard.ts`, `lib/transaction-timeline.ts` **unchanged**; no readiness/blocker/badge logic duplicated |
| Automation spine (Job/Execution/lifecycle/idempotency/policy/job-service/executor/scheduler/reaper/registry/proof-observer/health/ActivityLog/PM2/runtime) | **byte-unchanged** vs `07add1e` |
| Migration 27 | present; DB checksum **matches** repo file |

**Automation invariants (re-confirmed by inspection + inert state):** automation owns no
authoritative state; every execution path is still policy-gated (code unchanged); registry still
contains **exactly one** approved type; `producedDomainEffect` cannot be true in the proof
observer (unchanged); no external-comms or AI path exists; no executor path bypasses org scoping;
no fake automation `User` (0 rows matching); completed attempts remain immutable (insert-only
service unchanged). All confirmed against **unchanged** code and **0/0/0** live state.

The concurrent changes touch only the **sourcing/CRM side** (sellers/buyers/owners/opportunity
pages + new contacts/diligence/import modules) and `lib/auth.ts` (a benign additive
`organizationSlug` field on the session user — no change to auth/session/org-scoping logic).

---

## 4. Database & migration impact (Step 4)

- **Applied migrations:** 30, all `finished`, **0 rolled back**, **0 unfinished**.
- **Drift:** none (`prisma migrate status` = "Database schema is up to date!" against the
  working-tree schema, which includes the 3 concurrent migrations).
- **Migration 27 integrity:** DB checksum `8f2603c9…d7e2e` **==** `sha256(migration.sql)` — not
  edited after application.
- **Concurrent migrations:** `20260717113000_add_owner_contacts`,
  `20260717123000_add_contact_operations`, `20260717134500_add_opportunity_diligence` — all
  **additive** (new tables + `ADD COLUMN` on `sellers`/`buyers`, each nullable or `NOT NULL
  DEFAULT`; new FKs `ON DELETE CASCADE/SET NULL`). **No** `DROP`/`ALTER COLUMN`/`RENAME`/`DELETE`.
- **Untouched:** no deterministic underwriting table, immutable-snapshot field, Closing
  terminal-state record, or PAID-gate structure was modified.
- **Automation tables:** `automation_jobs` 0, `automation_executions` 0.
- **⚠ Repo divergence:** the 3 concurrent migrations exist only in the **working tree** (untracked)
  and the **prod DB** — **not** in git `main`. A clean `main` checkout would show 3 DB migrations
  absent from the repo (drift). **These must not be applied anywhere else and must be committed by
  their author to reconcile.**

---

## 5. Dependency & runtime impact (Step 5)

- `package.json`: `+xlsx ^0.18.5` (SheetJS, lead import) + `import:dealautomator-leads` script.
  **`xlsx` is a security-relevant dependency** (historical prototype-pollution / ReDoS advisories)
  and has had **no review**.
- **`tsx` remains a devDependency** (`^4.19.2`). Both the automation runtime **and** the new
  `import:dealautomator-leads` script rely on `tsx` at runtime — a `--omit=dev` production install
  would break both.
- **Automation runtime-launch blocker (unchanged):** `ecosystem.config.js` runs
  `crowdexpanse-automation` via plain `node scripts/automation-runtime.mjs`; that entrypoint
  imports `.ts` modules → `ERR_UNKNOWN_FILE_EXTENSION` on Node 20 → the process would crash-loop.
  Proven fix (in the worktree): `node --import tsx …` boots cleanly and stops gracefully. **Not
  applied** — awaiting authorization. The concurrent work neither fixed nor worsened this.
- Web process starts independently of automation; importing `lib/automation/*` has no side
  effects; the automation process remains inert; no undocumented env setting is required for the
  web app.

---

## 6. Tests (Step 6) — logs retained in the audit directory

Run against the **test** DB only.

| Check | Result |
|---|---|
| `prisma validate` (worktree/accepted) | valid |
| `prisma migrate status` (test DB) | 27 migrations, up to date |
| `tsc --noEmit` (worktree/accepted `07add1e`) | **0 errors** |
| `tsc --noEmit` (prod checkout, **combined running code**) | **0 errors** |
| Unit suite (accepted) | **PASS** — 54 files, all critical ≥90% branch, overall **93.0%** |
| Full E2E suite (worktree/test DB) | **FAILED (exit 1)** at `e2e-assignment.mjs` — **root cause = environment contamination, not an application defect** (see below) |

**E2E failure root cause (evidence-proven):** `P2022 — column "outreachStatus" does not exist`
on `prisma.seller.create()`. The worktree's `node_modules` is **symlinked to the prod checkout's**;
the concurrent dev ran `prisma generate`, **regenerating the shared `@prisma/client` against their
schema** (which adds `outreachStatus` to `sellers`). The worktree's **schema (`07add1e`) does not
define `outreachStatus`** and its **test DB is still at 27** (no such column). So the shared client
emits SQL for a column the test DB lacks → failure. This is a **test-environment defect** (shared
`node_modules` + concurrent `generate`), **not** a defect in the accepted automation code.
Corroborating evidence: the **unit suite passes**, the **combined prod-code typecheck is clean**,
and the **automation surface is byte-unchanged** vs the `07add1e` that passed 39/39 last cycle.
The audit deliberately did **not** regenerate the client (that would disturb prod + the concurrent
work).

**Failure classification:** environment defect (1). No real application defect, no test defect in
the accepted suite, no D16-style SIGSEGV (this was a Prisma `P2022`, deterministic).

---

## 7. Production stability (Step 7) — read-only

| Check | Result |
|---|---|
| Web health | `{"status":"ok"}`, uptime stable (~35 min at audit) |
| `/login` | 200 |
| `/dashboard`, `/opportunities`, `/closing`, `/contacts`, `/settings/imports` | 307 (auth redirect, **no 500**) — incl. new concurrent routes |
| `/api/automation/health` | 307 (auth-gated) |
| Build ID | `fWqzJm1Ca_-dscQZVtMP5` |
| PM2 restart count | 55 (elevated vs the rollout's 21 — the concurrent dev rebuilt/restarted; currently stable, uptime > 30 min) |
| CPU / memory | ~0.4% / 127 MB (normal) |
| Recent error log | empty |
| DB connection | stable (`dbMs` 6–38 ms) |
| Migration count / drift | 30 / none |
| Automation tables / executor / scheduler / AUTOMATION ActivityLog | 0 / absent / none / 0 |

No restart was performed. Production is functioning normally.

---

## 8. Repository ⇄ production reconciliation (Step 8)

| Component | Repository (`main` `07add1e`) | Production | Expected (post-accept) | Status |
|---|---|---|---|---|
| Source checkout | 27-migration automation state | `07add1e` **+ uncommitted concurrent CRM work** | `07add1e` | **Prod ahead (uncommitted)** |
| Prisma schema | automation schema | + 3 concurrent models/4 enums/added columns | automation schema | **Prod ahead (uncommitted)** |
| Migrations | 27 | **30** (3 concurrent, additive, applied) | 27 | **Prod ahead — DB has migrations absent from `main`** |
| Web build | (built on demand) | `fWqzJm1Ca_-dscQZVtMP5` (combined code) | `Xf0kRt2fLR8RqFJgcYidU` (accepted rollout build) | **Prod serving a different, combined build** |
| PM2 config | automation app declared, inert | identical | identical | **Match** |
| Automation runtime | present, launch-blocked (tsx) | present, **not running** | present, dark-start-ready | **Match (blocked)** |
| Env expectations | automation env only | + `xlsx` runtime dep | automation env only | **Prod ahead (uncommitted dep)** |
| Documentation | acceptance + traceability + runbook | same (no docs for concurrent work) | + this audit | **Concurrent work undocumented** |

**Central gap:** production (code + DB + build + deps) is **ahead of git `main`** by an entire
uncommitted feature set, including **3 migrations the repo does not contain**. Git `main` is **not
a faithful representation of production**.

---

## 9. Discrepancies, defects, risks

| # | Finding | Severity | Type |
|---|---|---|---|
| A | Prod DB (30) ahead of git `main` (27); concurrent code + 3 migrations uncommitted/unpushed | **High** (process/DR) | Governance |
| B | Live, unreviewed, undocumented CRM feature work serving ~6,900 rows in prod | **High** | Governance |
| C | Automation runtime launch blocker (`tsx` devDep + plain-node `.ts` import) — blocks dark start | **Medium** | Defect (bounded, known, fix proven) |
| D | New `xlsx ^0.18.5` prod dependency unreviewed (security history) | **Medium** | Security |
| E | Worktree test isolation broken by shared `node_modules` + concurrent `prisma generate` | **Medium** | Environment/CI |
| F | Two loose untracked root scripts (`ce_counts_records.js`, `ce_verify_records.js`) | **Low** | Hygiene |
| G | PM2 restart count elevated (55) from concurrent rebuild/restart cycles | **Low** (currently stable) | Operational |

**No** finding is an active production-harming defect (no 500s, no data loss, no cross-org
exposure, no underwriting/closing mutation, no unauthorized comms, no crash loop). The automation
executor is inert and safe.

---

## 10. Recommended corrective sequence (for Founder decision)

Neutral ordering; the Founder chooses in the [Decision Package](./V2_0_1_STABILITY_DECISION_PACKAGE.md).

1. **Reconcile the concurrent work into Git** — its author commits the CRM feature set + the 3
   migrations to a branch and pushes, so `main` (or an integration branch) once again represents
   production. Nothing else should proceed while `main` misrepresents prod.
2. **Review the concurrent work** — code review, tests, and a security review of `xlsx` — before
   it is considered "accepted." (It is already live; this is retroactive but necessary.)
3. **Reconcile migrations** — ensure git contains exactly the 30 applied migrations, in order,
   with no re-application anywhere.
4. **Resolve the automation runtime launch blocker** — promote `tsx` to `dependencies` and add
   `--import tsx` to the automation PM2 app (a focused, proven, behavior-neutral fix), re-gate.
5. **Re-establish worktree isolation** — a dedicated `node_modules` (or a generate/build
   discipline) so audits/tests are reproducible.
6. **Only then resume** the Phase 2.0.1 dark start → observing → production acceptance.

---

## 11. Final status

**PHASE 2.0.1 ROLLOUT PAUSED — STABILIZATION AUDIT PENDING FOUNDER REVIEW.**

- **What changed:** an unrelated, uncommitted CRM feature set (contacts / outreach / diligence /
  lead-import) + 3 additive migrations, developed and deployed directly in the production checkout.
- **Production health:** **healthy** (no 500s, stable, error log clean).
- **Frozen architecture:** **intact** (V1.3/V1.4 engine byte-unchanged).
- **Migration 27:** **healthy** (present, checksum-verified, no drift).
- **Automation:** **inactive and safe** (0/0/0, executor never started, spine byte-unchanged).
- **Must be corrected before rollout resumes:** commit/review/reconcile the concurrent work and
  its migrations into Git; resolve the automation runtime launch blocker; review the `xlsx`
  dependency; restore worktree isolation.

*Awaiting Founder review and explicit authorization of a stabilization plan before any
runtime-launch work or observing mode resumes.*

# Engineering Playbook

> **Status:** Living engineering standard. **This is how we build software in this repository.**
> **Audience:** Anyone (human or AI) implementing a change in CrowdExpanse Commercial.
> **Authority:** This is the *process* contract. The *architecture* contract is the [Engineering Master Plan](../roadmap/ENGINEERING_MASTER_PLAN.md) and, for the intelligence domain, [Volume 12](../roadmap/COMMERCIAL_INTELLIGENCE_ARCHITECTURE.md). Where process and architecture meet, architecture wins.
> **Provenance:** Distilled from [Slice 1](../roadmap/SLICE_1_RETROSPECTIVE.md) (Version 1.2, Commits 1a → 1d-3b), the first body of work built end-to-end under this process.
> **Maintenance:** Update this document **only when a better engineering practice is proven** (in a real slice, not in the abstract). Each completed slice also gets its own point-in-time retrospective under `docs/roadmap/`. Keep this file lean — it is a standard, not a history.

---

## 1. Development Lifecycle

Every non-trivial change follows this sequence. Nothing skips a step.

```
Architecture / Decision-lock
        ↓
Planning Brief            ── STOP for review
        ↓
Implementation Plan       ── STOP for review
        ↓
Feature Branch (local)
        ↓
Implementation
        ↓
Verification Gate         (typecheck · lint · unit · e2e · build · migration fidelity)
        ↓
Commit                    ── STOP for review
        ↓
Fast-forward Merge  +  Dual-push (both remotes)
        ↓
Production Verification   (migrate deploy only if schema changed · backup+restore · smoke check)
        ↓
Documentation Synchronization  (Volume 12 / EMP / Version doc / Dashboard / Tech Debt)
        ↓
Next planning brief
```

**Rules of the lifecycle**
- **Stops are load-bearing.** The review stops exist to catch defects before cost is sunk. In Slice 1 the most expensive defect (a non-atomic transaction) was caught at the *planning* stop, before any code.
- **Feature branches are local only.** They are never pushed. Only `main` is dual-pushed.
- **Merges are fast-forward only.** No merge commits. If `main` moved, rebase/reconcile — never force a merge commit.
- **One commit = one cohesive, reviewable boundary.** Split only when the pieces are independently reviewable; keep together what forms one reversible workflow.
- **Migrate production only when the schema changed**, and only through the [migration procedure](#4-testing--verification-standards).
- **Docs are synchronized in the same effort as the code** — never left for "later."

## 2. Architectural Principles

1. **Protect the architecture before writing code.** Lock the decision and the invariants first. The design document is the contract; code conforms to it, not the reverse.
2. **Expand by slices.** Build the one approved roadmap item. Do not solve future roadmap problems today.
3. **Never redesign completed architecture.** Consume proven engines; do not rewrite them. When new needs arise (e.g. a shared transaction), **parameterize**, don't replace.
4. **Domain first; UI consumes domains.** All business logic lives in `lib/`. The UI is a thin, stateless consumer that never bypasses a domain service.
5. **Strict separation of concerns.** Each domain has exactly one responsibility and never reaches into another's. (In the intelligence domain: Linking ≠ Candidate Review ≠ Merge ≠ Projection ≠ Refresh.)
6. **Additive and org-scoped by default.** New data is additive columns/tables, scoped to `organizationId` by construction. No query crosses tenants.
7. **Deterministic behavior; no hidden state.** Given the same inputs, the same outputs. No inference, no ambient mutation, no surprise side effects.
8. **Invariants are named and documented.** A rule worth enforcing is worth writing down (Volume 12 §13). A named invariant ends future re-litigation.

## 3. Coding Standards

- **Pure-core libraries.** Put decision logic in pure, dependency-free functions (no Prisma, no framework) so it is unit-testable in isolation. Examples: `permissions.ts`, `projection-precedence.ts`, `owner-duplicates.ts`, `owner-merge-suggest.ts`.
- **Thin UI.** Pages/components render state and dispatch to server actions. They never write projected/derived state directly.
- **Standard server-action shape:**
  `requireUser()` → `checkAuthorized(user, action, resource)` (or `authorize()` to throw) → domain lib call → `activityLog` (unless a domain record is already the authoritative audit) → `revalidatePath` → `redirect`.
  `checkAuthorized` takes a plain `Principal {id, role, organizationId}` so the authorization path is headless-testable.
- **Transaction orchestration.** Any operation that must be all-or-nothing runs in **one** `prisma.$transaction`. To compose two proven engines atomically, extract each engine's body into a `…Tx(tx, …)` form (logic unchanged) and call both inside one transaction. Guard the second write conditionally (e.g. `updateMany where { …, resolvedAt: null }` + assert count) so concurrent duplicates roll back.
- **Canonical validators.** Security-sensitive parsing has exactly one implementation, reused everywhere (e.g. `lib/safe-redirect.ts` for internal-redirect validation). Do not re-implement.
- **Server-authoritative inputs.** Never trust client-submitted derived state (counts, reasons, winner/loser ids, "current" status). Recompute from the database at execution time.
- **No silent caps.** If a read bounds coverage (top-N, no pagination), surface it in the UI/log — silent truncation reads as "complete" when it isn't.
- **Deterministic env only.** No `Math.random()`/`Date.now()` where reproducibility matters; pass timestamps in.

## 4. Testing & Verification Standards

**The gate (all must pass before commit):**
- **Typecheck** — `tsc --noEmit`, zero errors.
- **Lint** — zero warnings/errors.
- **Unit** — CRITICAL pure modules each ≥ **90% branch**; TRACKED overall ≥ **80% branch**. Line coverage is informational only (unreliable under tsx). Add every new pure decision module to the CRITICAL list.
- **E2E** — all scripts pass against the dedicated `*_test` DB (guarded, no override), with throwaway cascade-cleaned orgs.
- **Build** — production build succeeds (isolated distDir while D5 is open).
- **Migration fidelity** — after generating a migration, re-diff must print `-- This is an empty migration.`

**Reusable testing patterns (proven in Slice 1):**
- **Reversibility golden** — snapshot a semantic graph, perform the operation, reverse it, assert byte-for-byte equality.
- **Forced-rollback E2E** — for any multi-write transaction, run the engine body in a `$transaction` that then throws, and assert nothing persisted — in **both** directions where applicable.
- **Idempotency / duplicate-submit** — run the operation twice; assert no duplicate side effects.
- **Cross-org scoping** — every domain test proves org B cannot see or touch org A.
- **Permission denial** — assert non-authorized roles are denied by the server-side path (and audited where applicable).

**No-shadow migration procedure** (the app role lacks CREATEDB):
```
set -a && . ./.env.test && set +a
npx prisma migrate diff --from-schema-datasource prisma/schema.prisma \
  --to-schema-datamodel prisma/schema.prisma --script  > prisma/migrations/<TS>_name/migration.sql
node scripts/test-db.mjs setup            # apply to the test DB
npx prisma generate
# fidelity re-diff (with .env.test loaded) MUST print "-- This is an empty migration."
```
Production migration is a **release step**: confirm the target is prod (not test), take a **fresh restore-verified backup**, confirm **exactly one** expected pending migration with no drift, then `prisma migrate deploy`, then verify columns/indexes on the live schema.

**Production smoke check** (no real data mutation): confirm the live app is healthy; boot the *current* build on a **scratch port** read-only; prove new routes exist from the **served build's manifest** (not runtime status — blanket auth middleware makes status codes ambiguous); confirm no 500s; confirm server-side authz denials hold. **Kill any stale scratch process first**; verify against a known-fresh instance; tear it down after.

## 5. Review Checklist

Every change must be able to answer **yes** to each:

- [ ] **Architecture** — Does it fit the domain model and violate no locked decision?
- [ ] **Invariants** — Does it preserve every relevant Volume 12 / EMP invariant?
- [ ] **Separation** — Does the logic live in the *one* domain that owns it?
- [ ] **Reversibility** — If it changes structure/state, can it be reversed (or is irreversibility explicitly justified)?
- [ ] **Determinism** — Same inputs → same outputs; no hidden state?
- [ ] **Permissions** — Enforced server-side at the call-site, with the right resource/role?
- [ ] **Atomicity** — Are multi-write operations all-or-nothing in one transaction?
- [ ] **Server-authoritative** — Is no client-submitted derived state trusted?
- [ ] **Tests** — Is the hard behavior *proven*, not argued (rollback, reversibility, scoping, denial)?
- [ ] **Operational risk** — Migration needed? Production impact? Backup + rollback path?
- [ ] **Documentation** — Do Volume 12 / EMP / Version doc / Dashboard / Tech Debt stay in sync?
- [ ] **Release state** — Is "done vs merged vs live" described precisely?

## 6. Anti-patterns (do not do these)

- **Architecture drift** — implementing something the plan/invariants don't sanction. Re-plan instead.
- **Mixing domains** — letting one domain (e.g. Linking) do another's job (e.g. identity change).
- **Silent mutation** — writing derived/projected state directly, or side effects the caller can't see.
- **Redesigning proven engines** — rewriting instead of parameterizing/reusing.
- **Non-atomic multi-write** — sequential writes that can leave inconsistent state on partial failure.
- **Trusting client state** — using submitted counts/ids/status instead of recomputing.
- **Over-engineering** — building for a future slice's problem today.
- **Under-planning** — jumping to code before the decision and invariants are locked.
- **Silent truncation** — capping results without surfacing it.
- **Stale scratch processes / ambient verification** — trusting a leftover process or an old build instead of a known-fresh artifact.
- **Documentation drift** — merging code while the roadmap/dashboard/invariants fall out of date.
- **"Done" mislabeled as "live"** — calling merged/migrated work user-accessible before the running frontend is verified.

## 7. Engineering Decision Framework

When proposing or evaluating any change, reason through these gates **in order**. A "no" at a gate stops the proposal until it is resolved — do not skip ahead.

1. **Architecture** — Does it fit the domain model? Which domain does it belong to? (If it doesn't fit, the design is wrong, not the model.)
2. **Invariants** — Does it preserve the architectural guarantees (Volume 12 §13 / EMP)? If it appears to require breaking one, escalate to the architecture owner and lock a corrected rule *before* proceeding.
3. **Separation of concerns** — Does this responsibility belong in this domain, or is it leaking across a boundary?
4. **Operational risk** — Does it require a migration? Does it touch production? Can it be rolled back? What is the backup/restore path? Prefer additive, reversible, migration-free where possible.
5. **Testing** — Can the behavior be *proven*? What is the specific test that demonstrates correctness (and, for structural/transactional changes, rollback and reversibility)?
6. **Documentation** — Which architectural documents change? A change that alters an invariant or a domain boundary is not done until Volume 12 / EMP say so.
7. **Roadmap** — Is this the next approved slice/item? If it belongs to a later slice, record it and stop — do not build ahead of the roadmap.

This ordering encodes the priority the project runs on: **architecture and invariants before convenience; proof before belief; the approved slice before anything else.**

---

*This Playbook is a living standard. Amend it only when a real slice proves a better practice, and note what changed and why. Its companion is the permanent per-slice retrospective under `docs/roadmap/` (start: [Slice 1](../roadmap/SLICE_1_RETROSPECTIVE.md)).*

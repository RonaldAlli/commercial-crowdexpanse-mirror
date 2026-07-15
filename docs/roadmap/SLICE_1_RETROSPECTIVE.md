# Version 1.2 · Slice 1 — Retrospective

> **Status:** Permanent historical record. Written 2026-07-15, immediately after Commit 1d-3b.
> **Scope:** Version 1.2 (Commercial Intelligence), **Slice 1 — Intelligence Spine + Owner foundation** (Commits 1a → 1d-3b).
> **Nature:** Narrative and historical. This document is **not rewritten** — it captures what happened and what we learned while the details were fresh. Enduring practices distilled from it live in the living [Engineering Playbook](../architecture/ENGINEERING_PLAYBOOK.md); the governing design remains [Volume 12 — Commercial Intelligence Architecture](./COMMERCIAL_INTELLIGENCE_ARCHITECTURE.md).

---

## 1. Goals of Slice 1

Slice 1 was the **shared spine** of Version 1.2: build the canonical **Owner** domain and the provenance machinery every later intelligence layer (Property, Market, Portfolio, Scoring) would reuse — without changing any core 1.1 workflow. Concretely:

- A **first-class `Owner` entity** — the durable title-holder — *distinct from* `Seller` (the transaction counterparty). Not an enrichment of `Seller` in place.
- A **provenance spine**: `Observation → Signal → Projection`, so `Owner` columns are disposable projections of a sourced, append-only ledger rather than bare values.
- **Canonical identity**: deterministic resolution, reversible merge, provider crosswalk — stable across changing data providers.
- An **ingestion path** (manual/on-demand refresh) general enough that every future source is "just another adapter."
- A **thin UI** that consumes the domain without ever bypassing it.
- All **additive, org-scoped, permission-gated** — deterministic enrichment only, **no AI**.

The meta-goal, stated by the founder up front, was process: **enforce architectural governance over AI-assisted development** — plan before implementing, review at every boundary, never let the session devolve into ad-hoc code.

## 2. What was built

The pipeline, end to end:

```
Owner ──▶ Observation ──▶ Signal ──▶ Projection ──▶ Owner UI
             (append-only ledger)   (deterministic
                                      precedence)
```

Supported by five distinct, deliberately separated domains:

| Domain | Responsibility | Key modules |
|---|---|---|
| **Identity** | Canonical Owner, aliases, external-id crosswalk, deterministic candidate proposal | `lib/intelligence/owner-identity.ts`, `lib/owners.ts` |
| **Provenance** | Immutable `Observation → Signal` ledger; projection under total-order precedence | `lib/intelligence/provenance.ts`, `projection.ts`, `projection-precedence.ts` |
| **Ingestion** | Pure `SourceAdapter` contract + `runRefresh` orchestrator; durable `RefreshJob` | `lib/intelligence/refresh.ts`, `sources/` |
| **Linking** | Operational FK only (`Seller/Property.ownerId`) — never identity | `lib/owners.ts` (link/move/unlink) |
| **Candidate Review** | Human duplicate decisions (`OwnerMatchDecision`) — never merges | `lib/owner-duplicates.ts`, `lib/owner-match.ts` |
| **Merge** | The **only** structural-identity writer; reversible; ADMIN-only | `lib/owners.ts` (merge/unmerge), `lib/owner-merge.ts` |

Plus the cross-cutting guarantees: **reversible merges** (byte-for-byte restore), **provenance on every field**, **audit** (`RefreshJob`, `OwnerMergeRecord`, `ActivityLog`), and **permissions** enforced at first UI call-sites.

## 3. Timeline of commits (1a → 1d-3b)

Every commit followed the same lifecycle (§Development Lifecycle in the Playbook) and stopped for review at each architectural boundary. Migrations were taken **only** when the schema genuinely changed.

| Commit | Delivered | Migration |
|---|---|---|
| **1a** | `Owner`/`OwnerAlias`/`OwnerExternalIdentifier`; nullable `Seller/Property.ownerId`; deterministic proposal-only identity library; the six identity invariants | ✅ schema |
| **1a-2** | Reversible, structural-only, ADMIN-only **merge/unmerge**; `OwnerMergeRecord` + typed `mergeReason`; reversibility golden invariant | ✅ schema |
| **1b-1** | Append-only **provenance ledger** (`Observation → Signal`); version-stamped, superseded-not-mutated; idempotent genesis backfill | ✅ schema |
| **1b-2** | **Projection engine** — ledger-backed `Owner` columns under total-order precedence (pin → asOf → confidence → source-category → id); sticky overrides; reconstruction invariant | — migration-free |
| **1c** | Pure `SourceAdapter` contract + `manualAdapter` + `runRefresh` orchestrator; durable `RefreshJob` (audit + idempotency); `adapterVersion` on every observation | ✅ schema |
| **1d-1** | **Core Owner UI** — nav/list/detail/create/edit as a thin consumer; provenance shown Projected Value → Winning Signal → Signal History; `OWNER` policy enforced | — migration-free |
| **1d-2a** | **Linking** — Seller/Property ↔ Owner link, atomic move (A→B), unlink; the `safe-redirect` open-redirect guard | — migration-free |
| **1d-2b** | **Standalone candidate review** — duplicate queue (exact matchKey + alias overlap, no fuzzy); `OwnerMatchDecision` (CONFIRMED/DISMISSED, ADMIN reopen) | ✅ schema |
| **1d-3a** | **Manual refresh controls** — source-attributed trigger + inline `RefreshJob` history on Owner detail; `REFRESH` policy | — migration-free |
| **1d-3b** | **Merge/unmerge controls** — ADMIN workspace over the reversible engine; **atomic merge+resolution / unmerge+unresolution**; deterministic advisory winner | ✅ schema |

Production reached **8 migrations** at 1c, **9** at 1d-2b, **10** at 1d-3b. The four migration-free commits (1b-2, 1d-1, 1d-2a, 1d-3a) are a signal of discipline, not omission: UI and projection logic that reused existing schema were shipped without touching the migration history.

## 4. Major architectural decisions

1. **New `Owner`, not `Seller`-in-place.** The title-holder and the transaction counterparty are different lifecycles. Conflating them would have poisoned both. This decision made every later domain cleaner.
2. **Hybrid provenance** — typed projection columns *and* an append-only ledger, with the ledger as source of truth. Fast reads, full lineage, byte-for-byte reconstruction.
3. **Total-order precedence** for projection (pin → asOf → confidence → source-category → signal-id). A *total* order means projection is deterministic and testable — no ambiguity about which signal wins.
4. **Five-domain separation.** Linking ≠ Candidate Review ≠ Merge ≠ Projection ≠ Refresh. Each has one job; none reaches into another's. The invariants that enforce this (below) are the backbone of the whole slice.
5. **Merge is the only structural-identity writer** — and it is reversible, structural-only (never reconciles business data), and ADMIN-only. Everything else (linking, candidate review, refresh) is forbidden from changing identity structure.
6. **Adapters are pure; refresh is observational, replayable, atomic.** The orchestrator, ledger, and projection engine are fixed; every future source is just another `fetch`+`map` adapter.
7. **UI is a stateless, thin consumer.** It never writes projections directly; every mutation flows through a domain service. Each page reflects current projection/provenance/permissions.

These were captured as **named invariants in Volume 12 §13** as they were locked — that document, not the code, is the contract.

## 5. Problems encountered & how they were solved

- **Sequential writes weren't atomic (1d-3b, caught in review).** The first plan called `mergeOwners()` then `resolveDecision()` as two writes — a crash between them would leave an owner merged with its decision still "awaiting merge." **Fix:** parameterize the merge/unmerge engines into transaction-body form (`mergeOwnersTx`/`unmergeOwnersTx`, logic unchanged) so the orchestration runs the structural change *and* the decision-resolution write in **one** transaction. Proven by forced-rollback E2E in **both** directions. This was the single most important correction of the slice.
- **USER_ENTERED refresh superseding a USER_ENTERED pin (1c).** A manual refresh superseded a prior manual override because they share a lineage. I flagged it as a deviation from my plan's wording; the founder judged it the *cleaner* architecture and locked the corrected rule. **Lesson:** surface deviations explicitly; let the architecture owner decide.
- **"Clear pin" with no fallback signal (1d-1).** Clearing the only accepted signal in a lineage leaves the column at its last value (same-lineage supersession). The E2E first mis-asserted a fallback; **fix** was to seed a lower-precedence PUBLIC signal so clear had somewhere to fall back to. The behavior was approved and a future UI refinement (disable "Clear pin" when no fallback) was recorded.
- **`downlevelIteration` TS2802.** Iterating a `Set`/`Map` directly failed to compile; **fix:** `Array.from(...)`. Recurred in `refresh.ts` and `owner-duplicates.ts`.
- **Control chars in a redirect regex (1d-2a).** A literal control-char range in a regex was mangled by the editor; **fix:** an explicit `hasControlChars` charCode check. That validator (`lib/safe-redirect.ts`) became the **canonical** redirect guard.
- **Coverage gap on a new CRITICAL module (1d-3b).** `owner-merge-suggest` landed at 85.7% branch (< 90%); a missing branch was the "first arg is the older one on a count tie." **Fix:** one targeted test → 92.9%. The gate did its job.
- **Stale scratch process on a shared port (1d-3b smoke check).** A leftover `next start` on port 3099 from a *prior session* answered the smoke check, and blanket auth middleware made every route return 307 — so route existence couldn't be inferred from status codes. **Fix:** force-kill the stale process, boot one genuinely fresh instance, and prove route existence from the **served build's manifest** (`.next-isolated/server/app-paths-manifest.json`) rather than runtime status. **Lesson:** verify against a known-fresh artifact; never trust an ambient process.

## 6. Review gates that caught issues

The stop-for-review boundaries were not ceremony — they caught real defects **before** merge:

- The **planning-brief review** for 1d-3b caught the non-atomic merge/resolve — the highest-value catch of the slice — before a line was written.
- The **implementation review** locked the corrected supersession rule (1c) and the clear-pin behavior (1d-1).
- The **verification gate** (CRITICAL ≥90% branch) caught the `owner-merge-suggest` coverage gap.
- The **production smoke check** discovered **D5** — the entire UI was merged/built/migrated but not being served — turning a silent gap into a tracked blocker instead of a surprise.

## 7. The D5 deployment blocker

The single open item at the end of Slice 1 is **operational, not architectural**. The host's `.next` build directory has **root-owned nested files** dated 2026-07-11, so a plain `next build` cannot overwrite it. The PM2 app (`next start` from `.next`) therefore still serves the **pre-1.2 frontend**. Consequently:

- Slice 1 code is **complete, merged, tested, built, and production-database-current (10 migrations)**.
- Slice 1 is **not yet user-accessible** — the running frontend lags.
- Backend and migrations deploy fine (additive, backward-compatible); only the served frontend is stale.

Correct handling: it was **surfaced, elevated (Tech Debt D5), and not improvised around** — no chown or PM2 repoint was done without an operator. The disciplined rule that emerged: **do not describe the 1.2 UI as "live" until the current build is deployed to PM2 and verified.** Resolution requires an operator with sudo (chown `.next` + rebuild + `pm2 restart`, or repoint PM2 to `.next-isolated`).

## 8. Lessons learned

1. **Plan-first with hard stops works.** The most expensive defect (non-atomic merge) was caught in a planning review, at zero implementation cost.
2. **Invariants are cheaper than re-litigation.** Naming a rule in Volume 12 once ended every future debate about it. The document is the contract.
3. **Parameterize, don't redesign.** When atomicity demanded a shared transaction, extracting a `…Tx` body preserved a proven engine untouched. Reuse beat rewrite.
4. **Prove the hard behavior; don't argue it.** Reversibility and rollback were *demonstrated* (snapshot equality, forced-rollback E2E), not reasoned about.
5. **Migrations are a privilege, not a default.** Four of ten commits shipped migration-free. Schema churn was proportional to real need.
6. **Verify against fresh artifacts.** Ambient processes and stale builds lie. The manifest of the thing you actually built does not.
7. **Separate "done" from "live."** Merged + migrated ≠ user-accessible. Precise release-state language prevented a false "shipped."

## 9. Recommendations for future slices

- **Keep the lifecycle intact** for every slice (2 → 7). It scaled from a one-file identity library to a cross-transaction workflow without change.
- **Resolve D5 before Slice 2** so completed work is actually serving users before more is stacked on it.
- **Reuse the proven testing patterns**: CRITICAL ≥90% branch, reversibility golden, forced-rollback E2E for any multi-write transaction, no-shadow migration + fidelity re-diff, isolated-build scratch-port smoke check.
- **Each slice gets its own retrospective**; the [Engineering Playbook](../architecture/ENGINEERING_PLAYBOOK.md) is updated only when a *better* practice is proven.
- **When a source is added** (Property in Slice 2), it should be a new adapter behind the fixed orchestrator/ledger/projection — resist widening the core.
- **Add the deployment-verification step to the definition of done** for any UI-bearing slice, so "not live" is never discovered late again.

---

*Companion documents: the living [Engineering Playbook](../architecture/ENGINEERING_PLAYBOOK.md) (how we build here) and [Volume 12](./COMMERCIAL_INTELLIGENCE_ARCHITECTURE.md) (the domain contract). This retrospective is the permanent record of Slice 1; it should not be edited except to fix factual errors.*

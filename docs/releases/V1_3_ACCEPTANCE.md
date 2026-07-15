# Version 1.3 — Commercial Underwriting · Production Acceptance Record

> **Purpose:** the formal production sign-off for **Version 1.3 — Commercial Underwriting**, the release that deepened the Analyzer into a full, deterministic financial-modeling engine and shipped offer-memo generation. It answers *"what constitutes a successful production release of Version 1.3?"*
> **Status:** ✅ **ACCEPTED — live in production and formally closed.**
> **Milestone:** Version 1.3 — Commercial Underwriting.
> **Acceptance date:** 2026-07-15.
> **Final `main` commit:** the closeout commit this record lands in (annotated tag **`v1.3.0`**, frozen branch **`release/1.3`**). The final feature code was complete at **`5629e8a`** (offer-memo generation), with doc sync at **`7071330`**/**`7a35863`**.
> **Accepted production build ID:** `OuE0HfLIzVy6LsKqzp3ct` (superseding `-UDpzvinJSPXahRVzUmsL`).
> **Production migrations:** **22** (`prisma migrate status` = up to date, no drift).
> **Production URL:** `https://commercial.crowdexpanse.com`.

---

## 1. Acceptance criteria & result

| # | Criterion | Result |
|---|---|---|
| 1 | Architecture approved (Underwriting + Calculation Principles + Offer-Memo locks) | ✅ [§2](#2-architecture-accepted) |
| 2 | Code merged to `main`, both remotes | ✅ [§3](#3-merged-commit-state) |
| 3 | Typecheck · lint · unit (coverage gate) · full E2E all green | ✅ [§4](#4-verification-evidence) |
| 4 | Production build succeeds; no schema drift | ✅ [§4](#4-verification-evidence) |
| 5 | Production DB migrations current (**22**) | ✅ [§4](#4-verification-evidence) |
| 6 | Frontend deployed & serving the new build | ✅ [§4](#4-verification-evidence) |
| 7 | Global DoD + V1.3-specific DoD satisfied | ✅ [§6](#6-definition-of-done-evidence) |
| 8 | Org-isolation + RBAC enforced server-side | ✅ [§4](#4-verification-evidence) |
| 9 | Release tagged + frozen release branch | ✅ [§9](#9-final-acceptance-decision) / this closeout |

**Final decision: [§9](#9-final-acceptance-decision) — ACCEPTED.**

---

## 2. Architecture accepted

Version 1.3 is governed by three locked design authorities, all upheld with zero deviation:

- **[Underwriting Architecture Lock](../architecture/UNDERWRITING_ARCHITECTURE_LOCK.md)** — decisions U-A…U-L; invariants **UW-1…UW-9**, **DS-1…DS-4** (debt sizing), **IS-1…IS-3** (schedules), **CF-1…CF-5** (financing cases + cash flow), **EX-1…EX-6** (exit + waterfall), **SE-1…SE-7** (sensitivity), **FR-1…FR-6** (findings/recommendation + R-A fingerprint separation), **AP-1…AP-6** (decided recommendation + approval).
- **[Underwriting Calculation Principles](../architecture/UNDERWRITING_CALCULATION_PRINCIPLES.md)** — the 11 principles the engine must obey (one-way projection stack; consumers never feed back into calculations; comparing scenarios is a read, never an entangling computation).
- **[Offer-Memo Architecture Lock](../architecture/OFFER_MEMO_ARCHITECTURE_LOCK.md)** — invariants **OM-1…OM-12** (Documents-owned generated artifact; LOCKED-only; read-over-settled-outputs; immutable canonical snapshot + versions + SHA-256; append-only; one-way Documents→Underwriting seam; distinct suggestion/decision; org-scoped, authorized, path-safe, audited).

The accepted release **preserves every ownership boundary**:

- **`lib/analysis.ts` remained unchanged** across the entire version — the pure kernel was extended only by *pure sibling modules*.
- **Suggested recommendations and human decisions never became calculation inputs** (UW-4/UW-7/AP-3/FR-5, Principle 7).
- **Human decisions remained terminal** — append-only, immutable, LOCKED-only operational records with no lineage/fingerprint/version (AP-1…AP-6).
- **Generated documents remained Documents-owned** — Underwriting exposes a single narrow read seam and imports nothing from Documents (OM-10).
- **The deterministic financial engine remained pure and reproducible** — every derived surface is a content-idempotent, rebuildable function of exactly one Scenario's frozen assumptions + model lineage.

## 3. Merged commit state

- Branch `main`, synchronized to both remotes (`gitea` = origin, `github` mirror).
- Version 1.3 commit sequence: **3a → 3b-i → 3b-ii → 3b-iii → 3b-iv → 3b-v → 3b-vi → 3d → 3e → offer-memo** (final feature code `5629e8a`; doc syncs `7071330`, `7a35863`; this closeout commit).
- Migrations were taken only when schema changed: prod **13→14** (3a) → **15/16** (3b-i/ii) → **17** (3b-iii reshape) → **18** (3b-iv) → **19** (3b-v) → **20** (3b-vi) → **21** (3d) → **22** (offer-memo). Slices 3e and the doc syncs were code/docs-only (migration-free).

## 4. Verification evidence

Full CI suite on the isolated `_test` database (`commercial_crowdexpanse_test`; the E2E guard refuses any non-`*_test` target — production can never be a test target):

| Gate | Result |
|---|---|
| **Typecheck** (`tsc --noEmit`) | ✅ pass (0 errors) |
| **Lint** (`next lint`) | ✅ pass (0 warnings/errors) |
| **Unit** (`node:test` + `tsx`, branch-coverage gate) | ✅ pass — **all CRITICAL modules ≥ 90% branch** (incl. `lib/documents/offer-memo.ts` 93.5%, and every `lib/underwriting/*` pure module); overall branch 92.3% (≥80) |
| **Full E2E** (`npm test`) | ✅ **all 31 scripts passed**; `e2e-underwriting.mjs` = **166 assertions** (sections [1]–[18b]) |
| **Isolated build** (`npm run build`) | ✅ succeeds under the deploy user |
| **Migration fidelity** (`migrate diff` schema ⇄ `_test`) | ✅ empty (in sync) |
| **Production schema drift** (`migrate status` + re-diff) | ✅ up to date at **22 migrations**, drift NONE |
| **Backup restore-verification** (`scripts/backup.sh adhoc`) | ✅ RESTORE-VERIFY PASS (tables=13, counts=MATCH, docs=OK); off-site mirror SKIPPED (D4) |
| **Local health** | ✅ `/login` 200 · `/` 307 |
| **External HTTPS health** | ✅ `https://commercial.crowdexpanse.com/login` 200 |
| **Production build-ID flip** | ✅ new `OuE0HfLIzVy6LsKqzp3ct` → 200; prior `-UDpzvinJSPXahRVzUmsL` + transient gate build → 404 |

**Deterministic-engine + offer-memo verification** (proven on the schema-identical `_test` DB per the established process — production holds 0 underwriting rows, and the release process does not permit seeding real production underwriting data):

- **Organization isolation** — cross-org `getScenarioForMemo` / generation rejected; every read and write is org-scoped (E2E [18] OM-12).
- **RBAC** — offer-memo generation requires **both** `UNDERWRITING` read **and** `DOCUMENT` write, never `UNDERWRITING_APPROVAL` (OM-K); decision authoring vs deciding separated (`UNDERWRITING_APPROVAL`, AP-5); unit `can` tests + separation-of-duties test green.
- **Offer-memo determinism + SHA-256** — the same canonical snapshot renders byte-identical output (unit); the stored file's SHA-256 matches the recorded hash (E2E [18] OM-6); the artifact is self-contained (no external scripts/styles/fonts/images/URLs) and HTML-escaped (injection blocked, unit).
- **Append-only decisions & documents** — decisions append a higher per-scenario `sequence`; memos append a higher `generationSequence`; a later scenario version or human decision never mutates an earlier memo (E2E [18] OM-7/OM-8, AP-4).
- **Failure-cleanup** — a live concurrent **sequence conflict** was exercised: losing attempts fail cleanly with compensating file cleanup, files-on-disk == committed rows, and no artifact is overwritten; an unreferenced file has no Document row and is unreachable (E2E [18b] OM-L).

## 5. Production database

`prisma migrate status` against production (`commercial_crowdexpanse`): **22 migrations found, "Database schema is up to date!"** The offer-memo migration `20260715220000_add_offer_memo_generation` (prod 21→22) is applied. It is **additive** (a `DocumentOrigin` enum + nullable generation-provenance columns on `documents` + one unique index) with **0 destructive statements**, verified against **0 production Document and 0 production Scenario rows**. Every Version 1.3 migration is additive/backward-compatible (the one sanctioned reshape, 3b-iii, was performed while production held 0 underwriting rows).

## 6. Definition-of-Done evidence

**Global DoD** ([EMP](../roadmap/ENGINEERING_MASTER_PLAN.md#definition-of-done)) — all 8:

| Item | Evidence |
|---|---|
| Scoped with written acceptance criteria | Every slice ratified against its architecture lock; offer-memo scope + DoD in the Offer-Memo Lock |
| Org-scoped; no cross-tenant leakage; roles enforced | §4 org-isolation + RBAC |
| `typecheck` clean | §4 |
| Focused E2E + `npm test` green on `_test` | §4 (31 scripts) |
| Build passes | §4 |
| No unrelated files; no unintended drift | Additive migration reviewed; drift NONE |
| Module Roadmap + Executive Dashboard updated; debt logged | [MODULE_ROADMAPS](../roadmap/MODULE_ROADMAPS.md), [Executive Dashboard](../roadmap/EXECUTIVE_DASHBOARD.md), [Tech Debt](../roadmap/TECHNICAL_DEBT.md) |
| Merged to `main` + Gitea + GitHub | §3 |

**Version 1.3-specific DoD** ("Global DoD *plus*"):

| Item | Evidence |
|---|---|
| Every formula has unit tests with worked examples | `lib/analysis.ts` + every `lib/underwriting/*` module are CRITICAL-gated ≥90% branch with worked-example unit tests |
| Scenarios are versioned and comparable | `scenarioVersion` fingerprint + `DRAFT→LOCKED→SUPERSEDED` versioning (3a); read-only comparison at `/analyzer/[id]/compare` (3e) |
| An offer memo can be generated from a model | Offer-memo generation LIVE from a LOCKED scenario (this release) |

## 7. Scope accepted

Every Version 1.3 capability shipped and live:

- Underwriting ownership model (`Underwriting → Scenario → Assumption → ScenarioResult`)
- Scenario lifecycle and versioning (`DRAFT → LOCKED → SUPERSEDED`, `scenarioVersion`)
- ScenarioSeed snapshot behavior (one-way; a Property change never mutates a Scenario)
- Deterministic, content-idempotent, rebuildable `ScenarioResult`
- Debt sizing (LTV/LTC/DSCR → binding constraint)
- Income and expense schedules (line-item roll-up → effective NOI)
- Financing cases (capital structures under a Scenario)
- Multi-year cash flows (financing-independent NOI trajectory + per-case levered CF)
- Exit valuation, debt payoff (true amortization), equity cash-flow series, basic equity waterfall
- Levered IRR, equity multiple
- Sensitivity matrices (pure consumer; ≤11/axis, ≤121 cells)
- Findings and risks + suggested recommendation (fixed versioned ruleset)
- Human-decided recommendation + `UNDERWRITING_APPROVAL` (terminal, append-only)
- Scenario comparison (read-only side-by-side)
- Offer-Memo Generation (Documents-owned deterministic self-contained HTML)

## 8. Deferred scope (explicitly NOT part of the accepted 1.3 DoD)

LOI generation · native PDF output · refinance modeling · tax modeling · preferred-return & promote waterfalls · market-signal risks · AI narrative · email sending · e-signatures · workflow automation · multi-step approval · Version 1.4 Closing Center work. Each is separately gated by its lock/roadmap; none was a Version 1.3 DoD item.

## 9. Final acceptance decision

**✅ ACCEPTED — Version 1.3 (Commercial Underwriting) is live in production and formally closed.** All release-gating criteria are met: the three architecture locks are upheld with `lib/analysis.ts` unchanged; code is merged to both remotes; typecheck/lint/unit/E2E are green with all CRITICAL coverage ≥90%; production is current at 22 migrations with no drift; the frontend build `OuE0HfLIzVy6LsKqzp3ct` is confirmed serving locally and externally; org-isolation and RBAC are enforced server-side; and the offer-memo determinism, immutability, and failure-safe guarantees are proven. This release is tagged **`v1.3.0`** and frozen on **`release/1.3`**.

## 10. Rollback reference

- **Pre-migration restore-verified backup:** `adhoc` stamp **`20260715-214525Z`** (`/opt/crowdexpanse/backups/commercial/adhoc/20260715-214525Z`), restore-verified (tables=13, counts=MATCH, docs=OK) before the migration was applied.
- **Code rollback reference:** the pre-offer-memo `main` commit **`7071330`** (or any prior tagged release).
- **Migration nature:** **additive only** — `DocumentOrigin` enum + nullable generation-provenance columns + one unique index; 0 destructive statements.
- **Why prior code stays compatible:** every added `documents` column is **nullable** (or defaults `UPLOADED`), and no pre-existing column changed type or nullability. Prior production code neither reads nor writes the new columns, so a code-only rollback to `7071330` runs unchanged against the 22-migration schema; a full rollback can additionally restore `20260715-214525Z`.

## 11. Remaining operational caveats (non-blocking)

- **Off-site backup / R2 (Tech-Debt [D4](../roadmap/TECHNICAL_DEBT.md)):** the six-stage encrypted backup tooling is complete and restore-verified locally, but the off-site R2 mirror is unprovisioned and the cron is not installed — runs report 5/6. Production has **no guaranteed off-host DR copy**. An accepted standing operational caveat, unchanged since V1.1/V1.2.
- **Deprecated `DealAnalysis` (Tech-Debt [D15](../roadmap/TECHNICAL_DEBT.md)):** retained (0 prod rows). Version 1.3 acceptance **satisfies its removal trigger**; the drop is scheduled as a separately-reviewed post-acceptance cleanup (explicit plan + data verification + migration review required before removal). Not an acceptance blocker.
- **Denied privileged Owner-action audit gap (Tech-Debt [D12](../roadmap/TECHNICAL_DEBT.md)):** Low; unrelated to 1.3.

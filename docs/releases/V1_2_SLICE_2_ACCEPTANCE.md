# Version 1.2 · Slice 2 — Production Acceptance Record

> **Purpose:** the formal production sign-off for **Version 1.2, Slice 2 — Property Intelligence** (shared substrate → deterministic identity → deterministic resolution → human review UI). It answers *"what constitutes a successful production release?"* — distinct from a retrospective's *"what did we learn?"* Companion to the [Slice 1 Acceptance Record](./V1_2_SLICE_1_ACCEPTANCE.md).
> **Status:** ✅ **ACCEPTED — live in production.**
> **Acceptance date:** 2026-07-15.
> **Accepted build ID:** `8vRFYwF-JHfHalfXSAoSy` (superseding `4A-bszK-FtpZr-w48yTP_`).
> **Accepted commit:** the commit this record lands in on `main` (tagged — see [§11](#11-release-tag)). Slice 2 code was complete at **2c-iii** (`06b1a28` UI · `3680cdf` UI invariants · `414465b` release doc-sync).

---

## 1. Acceptance criteria & result

| # | Criterion | Result |
|---|---|---|
| 1 | Architecture approved (locks + matrix + review principles) | ✅ [§2](#2-architecture-approval) |
| 2 | Code merged to `main`, both remotes | ✅ [§3](#3-merged-commit-state) |
| 3 | Typecheck · unit (coverage gate) · E2E all green | ✅ [§4](#4-test--build-results) |
| 4 | Production build succeeds; no schema drift | ✅ [§4](#4-test--build-results) |
| 5 | Production DB migrations current (**13**) | ✅ [§5](#5-production-database) |
| 6 | Frontend deployed & serving the new build | ✅ [§6](#6-frontend-deployment--live-verification) |
| 7 | Deterministic engine invariants verified | ✅ [§7](#7-deterministic-invariants) |
| 8 | UI governance invariants upheld | ✅ [§8](#8-ui-governance-invariants) |
| 9 | `PROPERTY_IDENTITY` authorization enforced server-side | ✅ [§9](#9-authorization) |
| 10 | Tech-Debt D13 + D14 closed | ✅ [§10](#10-d13--d14-closure) |
| 11 | Release tagged | ✅ [§11](#11-release-tag) `v1.2.0-slice.2` |

**Final decision: [§12](#12-final-acceptance-decision).**

---

## 2. Architecture approval

The governing design is **[Volume 12 — Commercial Intelligence Architecture](../roadmap/COMMERCIAL_INTELLIGENCE_ARCHITECTURE.md)**, extended for Property by three purpose-built authorities, each approved before its implementation:

- **[Property Identity Lock](../architecture/PROPERTY_IDENTITY_LOCK.md)** — PI-A…PI-H, the guarded tiered resolve rule, the 2c-i refinements (R1–R6), the 2c-ii Resolution refinements (RES-1…RES-7), and the 15 locked invariants.
- **[Property Identity Decision Matrix](../architecture/PROPERTY_IDENTITY_DECISION_MATRIX.md)** — the finite, deterministic input-pattern → tier → basis → outcome table (mirrors `classifyResolution`).
- **[Human Review Principles](../architecture/HUMAN_REVIEW_PRINCIPLES.md)** — the governing constraint (*the review UI is never a second decision engine*), five review principles, and the two UI invariants (UI-1, UI-2).

Slice 2 proved the shared `Observation → Signal → Projection` spine supports a **second canonical entity** and a full **decision architecture** on top of it — Identity (derived, rebuildable, fingerprinted) → Crosswalk (immutable) → Resolution (pure deterministic classification) → Human Review (governed UI) — all additive, org-scoped, permission-gated, and deterministic (no AI, scoring, fuzzy matching, geocoding, external sources, or structural merge; those stay separately gated).

## 3. Merged commit state

- Branch: `main`, synchronized to both remotes (`gitea` = origin, `github` mirror).
- Slice 2 commit sequence: **2a → 2b → 2c-i → 2c-ii → 2c-iii**.
  - 2a — Property on the shared spine (entity-projector registry; `yearBuilt`/`squareFeet` ledger-backed) — headless, prod 10→11.
  - 2b — Property provenance UI + manual refresh (generalized `FieldProvenanceCard`) — deployed, migration-free, closed [D13](../roadmap/TECHNICAL_DEBT.md).
  - 2c-i — Property identity anchors + normalizers + derived `PropertyIdentity` index + immutable crosswalk — headless, prod 11→12.
  - 2c-ii — the Resolution engine (pure classifier + guarded resolve-before-create + append-only `PropertyResolution` audit/reversal + `PropertyMatchDecision` candidate store) — headless, prod 12→13.
  - 2c-iii — the review & resolution UI — deployed, migration-free, closed [D14](../roadmap/TECHNICAL_DEBT.md).
- Migrations taken only when schema changed (2b and 2c-iii were migration-free). All Slice 2 migrations are additive and backward-compatible.

## 4. Test & build results

Full suite on the isolated `_test` database (`commercial_crowdexpanse_test`; the E2E guard refuses any non-`*_test` target — production can never be a test target):

- **Typecheck** (`tsc --noEmit`): ✅ 0 errors.
- **Unit** (`node:test` + `tsx`, branch-coverage gate): ✅ pass — all CRITICAL modules ≥ 90% branch, overall **92.1%**. Slice 2 CRITICAL logic: `lib/intelligence/property-fields.ts` 95.7% · `property-normalizers.ts` 97.3% · **`property-resolution.ts` (the pure classifier) 95.7%**.
- **E2E** (`npm test`): ✅ **all 30 scripts passed**, including the Slice 2 surfaces: `e2e-property-identity` (28 assertions — anchor projection/reconstruction, derived-index determinism, xmin zero-write idempotency, fingerprint evolution, crosswalk supersession), `e2e-property-resolution` (46 assertions — every classifier tier, guards, enrichment provenance, suppression/resurfacing, confirm-decision-only, replay idempotency, first-class reversal, evidence-immutability, org-scoping, Owner-untouched), `e2e-property-review-ui` (15 assertions — the page/action data contracts).
- **Production build**: ✅ succeeds under the deploy user (predeploy guard clean, no `sudo`). **No schema drift** — `prisma migrate status` reports the DB up to date at 13 migrations; migration fidelity re-diff was empty at authoring time.

## 5. Production database

`prisma migrate status` against production (`commercial_crowdexpanse`): **13 migrations found, "Database schema is up to date!"** Slice 2's schema-bearing migrations are all deployed: `…_add_property_entity_type` (2a, 10→11), `20260715120000_add_property_identity` (2c-i, 11→12), `20260715130000_add_property_resolution` (2c-ii, 12→13 — `PropertyResolution`, `PropertyMatchDecision`, the `ResolutionBasis`/`ResolutionEventKind`/`PropertyMatchStatus` enums, and the crosswalk `revokedByResolutionId` column). Read-only production state at acceptance: **1 org, 0 properties** and 0 rows across identities/crosswalk/resolutions/candidates; Owner tables and the ledger unchanged (0/0).

## 6. Frontend deployment & live verification

The redeploy that made the 2c stack live is confirmed serving, locally and externally:

| Check | Result |
|---|---|
| `.next/BUILD_ID` on host | `8vRFYwF-JHfHalfXSAoSy` |
| Served build (local, app port) | assets under `/_next/static/8vRFYwF-JHfHalfXSAoSy/` |
| Served build (external, `https://commercial.crowdexpanse.com/login`) | HTTP 200 |
| Prior stale build | `4A-bszK-FtpZr-w48yTP_` (no longer served) |
| App health (`/api/health`) | `{"status":"ok", ...}` |
| Process manager | app process **online** (uptime reset on restart) |
| New routes gated | `/properties/candidates` and `/properties/[id]/identity` → `307 → /login` unauthenticated |
| `.next` ownership | built as `deploy`; predeploy guard clean (no foreign-owned files) |

The build-ID flip on disk **and** the matching served assets, plus the external 200 and the middleware redirect on the new routes, are the decisive proof that the process manager and the production `.next` are aligned on the current build.

## 7. Deterministic invariants

Verified behaviorally by the guarded test-DB E2E (prod has 0 properties, so — per the no-artificial-production-data policy — the engine invariants are proven on the schema-identical `_test` DB and corroborated by read-only production checks):

| Invariant | Evidence |
|---|---|
| **Reconstruction (R2/R4)** — `PropertyIdentity` rebuilds byte-for-byte from the ledger; a re-run performs zero writes (proven via Postgres `xmin`) | `e2e-property-identity` |
| **Identity fingerprint (R5/R6)** — deterministic `identityVersion` over algorithm + winning anchors + normalizer versions | `e2e-property-identity` |
| **Classification is pure (RES-1)** — identical evidence + lookup ⇒ identical outcome; no DB/clock/randomness/side-effects | `property-resolution` unit tests |
| **Resolution never modifies evidence (RES-5)** — resolve + reverse mutate no prior Observation/Signal | `e2e-property-resolution` §12 |
| **Replay is deterministic (RES-6)** — same requestKey+evidence ⇒ same target/basis/audit/candidate; one RESOLVE event | `e2e-property-resolution` §10 |
| **Reversal never rewrites history (RES-7)** — REVERSAL appended (actor+reason), original RESOLVE + basis unchanged, attachment revoked | `e2e-property-resolution` §11 |
| **Crosswalk append-only (R3)** — supersession/revocation only; never rewritten | `e2e-property-identity`, `e2e-property-resolution` |
| **Owner unchanged** — property work writes no Owner rows; Owner ledger byte-for-byte unchanged | `e2e-property-resolution` §13 + read-only prod |

## 8. UI governance invariants

The 2c-iii UI is a thin consumer — read paths + thin action wrappers over the domain services; it changed no Evidence/Identity/Resolution logic. It upholds the [Human Review Principles](../architecture/HUMAN_REVIEW_PRINCIPLES.md):

- **Governing constraint** — the UI is never a second decision engine: every action maps to an existing engine/governance call (`pairContextProperty` + `recordPropertyMatchDecision` / `reopenPropertyMatchDecision` / `reversePropertyResolution`); no new outcome, heuristic, scoring, or evidence-edit path.
- **UI-1** — the UI derives no facts the engine hasn't: it filters/paginates/sorts and renders the engine's `basis`, competing candidates, and audit as-is; it never reinterprets evidence, infers a different basis, collapses candidates, or hides conflicts.
- **UI-2** — every conclusion is traceable: the identity detail page links a resolution's basis → the resolution audit → the identity anchors → their field provenance (projected → winning signal → signal history) → competing candidates.
- Confirm/dismiss/reopen record decisions only (no merge/create/delete/repoint, no Signal); reversal appends a REVERSAL event (RES-7). Structural merge is deferred and stated as such in the UI.

## 9. Authorization

Server-side role enforcement, confirmed by code audit and the auth-gate probes (§6):

| Surface / action | Required | Enforced at |
|---|---|---|
| Identity review + resolution detail (view) | ADMIN, ACQUISITIONS | page `notFound()` on `can(READ, PROPERTY_IDENTITY)` |
| Candidate confirm / dismiss | ADMIN, ACQUISITIONS | action `checkAuthorized(…, "MANAGE", "PROPERTY_IDENTITY")` (audited) |
| Candidate **reopen** | **ADMIN only** | action `canReopenMatchDecision` |
| Resolution **reverse** | ADMIN, ACQUISITIONS | action `checkAuthorized(…, "MANAGE", "PROPERTY_IDENTITY")` (audited) |

`ANALYST`/`DISPOSITIONS` have neither read nor write on `PROPERTY_IDENTITY` (identity review is governance, not operational reporting). Display-time `can(...)` flags are backed by independent server guards; no mutation is protected by UI-hiding alone.

## 10. D13 & D14 closure

- **[D13](../roadmap/TECHNICAL_DEBT.md)** — resolved at the 2b redeploy (Property ledger write-path made live).
- **[D14](../roadmap/TECHNICAL_DEBT.md)** — ✅ resolved at the 2c-iii redeploy: the headless 2c-i + 2c-ii stack is now live (build flip `4A-bszK-FtpZr-w48yTP_` → `8vRFYwF-JHfHalfXSAoSy`); `rebuildAllPropertyIdentities` was re-run across all orgs (**0 properties reindexed** — clean no-op, path live); Owner byte-for-byte unchanged.

## 11. Release tag

Annotated tag **`v1.2.0-slice.2`** on the accepted commit, pushed to both remotes — extending the established history: `v1.1.0` → `v1.2.0-slice.1` → **`v1.2.0-slice.2`** → (future) `v1.2.0`.

## 12. Final acceptance decision

**✅ ACCEPTED — Version 1.2 Slice 2 (Property Intelligence) is live in production and formally closed.** All release-gating criteria are met: architecture approved (locks + decision matrix + review principles); code merged to both remotes; typecheck/unit/E2E green with CRITICAL coverage ≥ 90% (overall 92.1%); production DB current at 13 migrations with no drift; the new build `8vRFYwF-JHfHalfXSAoSy` is confirmed serving locally and externally with the new routes auth-gated; the deterministic engine invariants (reconstruction, replay, evidence-immutability, first-class reversal) and the UI governance invariants (never a second decision engine, UI-1, UI-2, traceability) are upheld; `PROPERTY_IDENTITY` authorization is enforced server-side; and D13 + D14 are closed.

## 13. Remaining operational caveats (non-blocking)

- **Off-site backup / R2 (Tech-Debt D4):** the six-stage encrypted backup is complete and restore-verified (the pre-migration acceptance backup `20260715-122959Z` restored with `counts=MATCH`), but the **off-site mirror is not yet active** (R2 unprovisioned; cron not installed) — runs report 5/6. No guaranteed off-host DR copy. Operational, tracked in [D4](../roadmap/TECHNICAL_DEBT.md).
- **Denied privileged actions not fully audited (D12 pattern extends to Property):** denied candidate **reopen** throws via the raw `canReopenMatchDecision` predicate and **bypasses the `authorization.denied` audit log** (as with the Owner ADMIN-only guards). Confirm/dismiss/reverse *are* audited via `checkAuthorized`. Enforcement is correct; only the reopen-denial audit record is missing. Tracked as [D12](../roadmap/TECHNICAL_DEBT.md).
- **Optional human UI smoke:** an interactive ADMIN + non-ADMIN click-through of the live site remains a recommended (non-blocking) final confirmation; acceptance rests on E2E + server-side code audit + read-only production probes. Note prod has 0 properties, so the review surfaces currently render empty states (correct).
- **No staging environment:** verification is local + CI + read-only production probes; in-place host builds still risk brief disruption (Infrastructure debt).

---

*Companion records: [Slice 1 Acceptance](./V1_2_SLICE_1_ACCEPTANCE.md) · [Property Identity Lock](../architecture/PROPERTY_IDENTITY_LOCK.md) · [Property Identity Decision Matrix](../architecture/PROPERTY_IDENTITY_DECISION_MATRIX.md) · [Human Review Principles](../architecture/HUMAN_REVIEW_PRINCIPLES.md) · [Volume 12](../roadmap/COMMERCIAL_INTELLIGENCE_ARCHITECTURE.md) · [Technical Debt](../roadmap/TECHNICAL_DEBT.md) · [Executive Dashboard](../roadmap/EXECUTIVE_DASHBOARD.md).*
*Host-specific operational details (addresses, ports, credentials) are intentionally excluded from this record and kept in protected operations documentation.*

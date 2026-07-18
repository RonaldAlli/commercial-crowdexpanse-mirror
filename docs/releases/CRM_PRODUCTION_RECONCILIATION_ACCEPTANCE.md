# CRM Production Reconciliation — Acceptance Package

> **Status: FOUNDER ACCEPTED — 2026-07-18** (Founder: Ronald Delroy Anthony Allicock; accepted branch tip `32f3704`). This branch captures the live
> production CRM work (contacts / outreach / diligence / lead-import / ATM-wholesale) faithfully
> in Git so that `main` can once again represent production, **plus two bounded security
> remediations** applied on top of the faithful-capture commits. **Nothing is merged or
> deployed.** The Phase 2.0.1 Automation rollout **remains paused**.
>
> **Branch:** `stabilize/crm-production-reconciliation` (from `main` `ee7bfc9`).
> **Companions:** [CRM Operations Boundary](../architecture/CRM_OPERATIONS_BOUNDARY.md) ·
> [ADR-0006 Import File Parser](../architecture/adr/ADR-0006-CRM-IMPORT-FILE-PARSER.md) ·
> [Stabilization Audit](./V2_0_1_STABILIZATION_AUDIT.md) · [Change Inventory](./V2_0_1_CHANGE_INVENTORY.md).

---

## 0. Remediation (2026-07-18) — applied before acceptance

Two review findings were corrected in **separate remediation commits** (the 7 faithful-capture
commits are unchanged):

**R1 — Import-job organization isolation.** `listLeadImportJobs` no longer reads all jobs
globally. The read surface was extracted to a pure, testable `lib/lead-import-jobs-core.ts` and
is now **organization-scoped and fail-closed**: `listLeadImportJobs(organizationId)` returns only
the caller's jobs; `getLeadImportJob(organizationId, jobId)` validates job-id shape **and** org
ownership, returning a **uniform `null`** on mismatch/missing-org (no cross-org existence
disclosure); records without an `organizationId` are suppressed; the public projection **never
returns absolute server paths** (only a basename display name). `page.tsx` now passes
`user.organizationId`; the UI no longer renders `sourceFile`/`logFile` paths. Every job record now
records `organizationId`.

**R2 — Safe import parsing (ADR-0006, Option A: CSV-only).** The SheetJS `xlsx` untrusted-file
parser was **removed entirely** (`npm ls xlsx` → empty; dependency + lockfile + source). Intake is
CSV/TSV/TXT/JSON via the existing bounded parser, with a **pre-parse file-size cap** (15 MB, via
`stat` before read) and **row/column/cell-length limits** enforced during parsing (50,000 / 200 /
20,000). `.xlsx`/`.xls` are rejected explicitly; the upload allowlist dropped Excel.

**Tests added (20, all pass):** `tests/unit/crm/lead-import-jobs-core.test.ts` (10 — A/B
isolation, cross-org read denial, missing-org fail-closed, malformed metadata, id-traversal
rejection, no-path-leak) + `tests/unit/crm/lead-import-parse.test.ts` (10 — Excel/oversized/row/
column/cell rejection, valid CSV).

---

## 1. Objective & method

Production contained a live CRM feature set that was **uncommitted, unpushed, and applied 3
migrations the repo did not have** (prod DB at 30, `main` at 27). This branch makes that work
**reproducible, reviewable, tested, and represented in Git without changing its production
behavior**.

**Preservation (non-destructive):** before any branch operation — recorded `git status`,
`git diff --stat`, the full file list; created a checksummed backup archive of all 42
modified+untracked files (`sha256 3f8adaf2…`); checksummed the 3 migrations; recorded the prod
build (`fWqzJm1Ca_-dscQZVtMP5`) and migration count (30). No `git clean`/`reset`/`checkout -f`/
destructive `stash` was used; the production checkout was **not** reset or overwritten.

**Isolation repair (fixes audit D21):** a dedicated worktree `/opt/crowdexpanse/wt-crm` with its
**own copied `node_modules`** (not symlinked to prod), its own generated Prisma client, and a
test DB brought to **all 30 migrations** — so tests are reproducible and do not mutate prod's
dependency tree.

---

## 2. Source provenance

All work authored by the shared "BreadBasket Deploy" identity in a concurrent session; unrelated
to Phase 2.0.1. Five additive feature areas — Owner Contacts, Seller Outreach, Opportunity
Diligence, DealAutomator Lead Import, ATM Wholesale Calculator — plus cross-cutting UI. Full
file-level provenance in the [Change Inventory](./V2_0_1_CHANGE_INVENTORY.md) §B.

**Excluded (documented, not application source):** `ce_counts_records.js`, `ce_verify_records.js`
— ad-hoc verification scripts at repo root, of unknown one-off purpose. Left out of the branch
(preserved in the backup archive + the prod working tree). **Recommend removal** from the prod
checkout after confirming they are throwaway.

---

## 3. Commit list (7 feature commits + this documentation commit)

| # | Commit | Scope |
|---|---|---|
| 1 | `ac2c271` | Schema + **3 exact production-applied migrations** (checksum-verified) + session `organizationSlug` |
| 2 | `f15f048` | Owner Contacts + contact operations (UI/actions/backfill) |
| 3 | `90f3441` | Seller outreach + operational fields |
| 4 | `b74a0c8` | Opportunity pre-contract diligence tracker |
| 5 | `c47e5cc` | ATM wholesale calculator (+ unit test → gate) |
| 6 | `d6f397a` | DealAutomator lead import (xlsx/CSV) + `xlsx` dep + **security decision** |
| 7 | `43265f7` | Shared UI integration (nav, dashboard, stat-card, property detail) |

Each commit keeps files whole; schema-first so references resolve; shared UI last so all routes
exist. Commit 6 was made **after** the xlsx security decision was documented (§7).

---

## 4. Exact changed-file inventory & production comparison

- **40 files** changed on the branch vs `main`; **every one byte-identical to the production
  checkout** (0 mismatches, verified file-by-file). No required production source is missing; no
  accidental production file is included; no generated artifact is committed; **no behavior was
  changed during preservation**.
- 14 modified + 26 captured-untracked; 2 loose root scripts intentionally excluded (§2).

| Production file class | Branch | Match | Action |
|---|---|---|---|
| 40 CRM app/source/migration files | present, identical | ✓ byte-match | keep |
| `ce_counts_records.js`, `ce_verify_records.js` | absent | intentional difference | remove from prod after review |
| generated `.next` / `node_modules` | not tracked | n/a | n/a |

---

## 5. Migration reconciliation

- Repo migration count is now **30** (was 27); production is **30**; `prisma migrate status` =
  "up to date", **no drift**.
- The 3 CRM migrations are captured **exactly as applied** — file `sha256` == DB `checksum` for
  all three (`owner_contacts e3755758…`, `contact_operations d6b93165…`, `opportunity_diligence
  d3da49b3…`). They are additive (new tables + nullable/defaulted `sellers`/`buyers` columns +
  FKs); **no** destructive SQL; **no** historical migration edited; **no** frozen
  underwriting/closing table altered. **Must not be re-applied** anywhere.

---

## 6. Production data counts (live, unchanged by this branch)

`owner_contacts` **6,897** · `sellers` **6,897** (with new outreach columns) ·
`opportunity_diligence_items` **24** · `contact_touches` 0 · `buyers` 0. Automation tables 0/0.

---

## 7. Security review — SheetJS / `xlsx`

**Decision: capture-as-live, do NOT silently replace, flag for remediation, do NOT broaden
access.** (See D20.)

- **Version:** `xlsx@0.18.5` (npm/SheetJS). Known advisories relevant to this version:
  **CVE-2023-30533 (prototype pollution)** and **CVE-2024-22363 (ReDoS)**; SheetJS distributes
  fixes via their own CDN for newer versions, not npm.
- **Parsing:** `XLSX.read(buffer, { type:"buffer", cellDates:false })` with **no `sheetRows` or
  file-size guard** → memory-exhaustion / decompression-bomb exposure on large/malicious
  workbooks; only the first sheet is consumed; `--limit` is applied **post-parse**, so it does
  not bound parsing cost.
- **Cross-org metadata:** `listLeadImportJobs` reads all `/tmp` job files with **no
  `organizationId` filter** → an admin could see another org's import-job metadata (sourceFile,
  actorEmail, counts). Domain writes are unaffected.
- **Sound controls:** the runner **verifies actor↔org membership** (`actor.organizationId ===
  resolved org`, else throws) → no cross-org data import; `assertSafeImportPath` blocks path
  traversal; `spawn` uses **array args** (no shell injection); the importer runs **detached** so
  a parse crash cannot take down the web process; the feature is **admin-only**.

**Recommended remediation (before broadening upload access or formats):** pin/patch or replace
SheetJS (or restrict to CSV intake); add a pre-parse **file-size + `sheetRows`** cap; org-scope
`listLeadImportJobs`; make `--limit` a parse bound. **Until then: do not enable additional upload
access and do not broaden accepted formats.**

---

## 8. Organization-isolation review

- New models (`OwnerContact`, `ContactTouch`, `OpportunityDiligenceItem`) carry `organizationId`
  with cascade org relations; `getLeadImportCounts` and the import runner are org-scoped; contact
  and diligence services reference `organizationId`.
- **Follow-up items:** confirm every new server action (`contacts/actions.ts`,
  `owners/actions.ts`, `diligence-actions.ts`, `settings/imports/actions.ts`) enforces the
  caller's `organizationId` on both reads and writes during code review; fix the
  `listLeadImportJobs` cross-org metadata gap.

---

## 9. Tests & verification (isolated worktree, test DB @ 30)

| Check | Result |
|---|---|
| `prisma validate` | valid |
| `prisma migrate status` | 30 migrations, up to date, no drift |
| `tsc --noEmit` (final committed tree) | **0 errors** |
| Unit suite | **PASS** — **57 files** (incl. ATM-calculator + 2 new CRM security tests), all critical ≥90% branch, overall **93.0%** |
| Full E2E suite | **39/39 scripts pass** (also clears the D21 contamination that failed the shared-env run) |
| Dependency audit | `xlsx` **removed** from the tree (untrusted-file parser risk eliminated). Remaining `npm audit` findings are **pre-existing platform-dependency** advisories (Next.js image opt., etc.) present at `v1.4.0` — out of scope, tracked separately. |
| Isolated production build | passes |
| Frozen kernel vs `v1.4.0` | `lib/analysis.ts`, `lib/closing.ts`, `lib/transaction-dashboard.ts` **unchanged** |
| Automation spine vs `07add1e` | **byte-unchanged**; automation still inert |

**Not yet done (honest scope):** dedicated CRM feature E2E (malformed/oversized workbook,
duplicate/partial-import rollback, per-action cross-org attempts, diligence lifecycle) — the CRM
work shipped without E2E in the accepted suite; writing that coverage is recommended follow-up
before the branch is treated as fully verified.

---

## 10. Frozen-architecture verification

`lib/analysis.ts` and the V1.3/V1.4 underwriting + closing engine are **byte-unchanged**; D15
untouched; the automation spine + migration 27 are byte-unchanged; frozen refs
(`release/1.3`/`release/1.4`/`v1.3.0`/`v1.4.0`) unmoved.

---

## 10b. Production exposure assessment (read-only, 2026-07-18)

- **Who can access:** the import UI/action is **ADMIN-only** (`requireRole(UserRole.ADMIN)`) — not
  publicly accessible.
- **Has it been used:** yes — 2 historical job files exist in prod `/tmp/commercial-import-jobs`
  (2026-07-16). They were written by the pre-fix code and **lack `organizationId`**, so the
  remediated read code fails them closed (they will not list) — safe by design.
- **Unsafe files retained:** **none** — no `.xlsx`/`.xls` found in the job dir, `uploads/`, or
  `imports/`; no lingering lead-import upload files.
- **Immediate risk:** **none** (admin-only, no retained unsafe files, feature not publicly
  exposed). **No emergency production change was made.** The remediation reaches production only
  through the normal, Founder-gated merge + deploy of this branch.

## 11. Known risks & rollback considerations

- **Risks:** xlsx security surface (§7); `listLeadImportJobs` cross-org metadata; absence of CRM
  E2E; the two loose root scripts; per-action org-scoping needs confirmation in review.
- **Rollback:** the branch changes **no production state** — it only captures what is already
  live. Merging it does **not** deploy or migrate. If the CRM work were ever to be reverted, that
  is a **separate destructive decision** (drops ~6,900 live rows) and is **not** recommended
  given the additive, in-use nature; a code-only rollback would leave the additive schema in place.

---

## 12. Recommended merge path (for Founder decision)

1. Founder reviews this branch (code review + the org-scoping follow-ups + xlsx remediation plan).
2. On acceptance, merge `stabilize/crm-production-reconciliation` → `main` so **Git represents
   production** (this makes `main` include the 3 already-applied migrations; **do not re-apply**
   them — production is already at 30).
3. Then, separately: remediate xlsx (§7), add CRM E2E (§9), resolve the two loose scripts, and
   restore worktree isolation as the standing dev practice.
4. Only after Git⇄production is reconciled: resume the paused Phase 2.0.1 Automation rollout
   (runtime-launch fix → dark start → observing → production acceptance).

**Do not deploy this branch during reconciliation. Do not merge without Founder acceptance.**

---

*Status: CRM PRODUCTION RECONCILIATION — FOUNDER ACCEPTED 2026-07-18 (tip 32f3704). Production deployment tracked separately in CRM_PRODUCTION_RECONCILIATION_PRODUCTION_ACCEPTANCE.md.*

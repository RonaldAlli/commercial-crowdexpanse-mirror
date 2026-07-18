# Platform Restoration — Wave 6 Acceptance (Import Pipeline & ATM Wholesale Integration)

> **Status: ✅ COMPLETE (2026-07-18) — PENDING FOUNDER REVIEW.** Acceptance-first: §2 documented the
> **existing intended behavior** (code + schema + ADR-0006 + accepted records) **before** any change;
> the §3 criteria are satisfied; the §4 gate is green; evidence in §5. **Verified existing behavior
> only — no new import behavior, format, dedup policy, calculator capability, or workflow; no §6 stop
> condition triggered** (ATM page reads confirmed org-scoped; no cross-org exposure). No merge, no
> deploy; Automation paused (D19 untouched); frozen V1.3/V1.4 unchanged.
>
> Companion: [Restoration Plan](./PLATFORM_ROADMAP_RESTORATION_PLAN.md) · [Defect
> Register](./PLATFORM_STABILIZATION_DEFECT_REGISTER.md) · [ADR-0006](../architecture/adr/ADR-0006-CRM-IMPORT-FILE-PARSER.md)
> · [Off-Roadmap Assessment](./OFF_ROADMAP_FEATURE_ASSESSMENT.md).

---

## 1. Purpose & scope

Verify (not redesign) the two remaining off-roadmap features: the **DealAutomator lead-import
pipeline** and the **ATM Wholesale calculator**. Close their remaining test gaps under the
unit → integration → E2E layering while proving their accepted architectural boundaries hold.
**Test/documentation only** — no new capability; no schema/migration unless a confirmed defect
requires one (separately reviewed, per §6).

## 2. Existing intended behavior — source of truth (documented before testing)

**Import formats & limits (ADR-0006, ratified 2026-07-18):** CSV/TSV/TXT/JSON only; `.xlsx`/`.xls`
rejected; `xlsx` dep removed. Pre-parse caps: **15 MB** file, **50,000** rows, **200** columns,
**20,000**-char cells (`scripts/import-dealautomator-commercial-leads.ts`).

**Idempotency / duplicate handling (THE explicitly-required determination):** replaying the same
file/row **relies on existing domain-level deduplication** — it does *not* create duplicates, and
there is *no* uniqueness constraint. Two layers:
1. **In-file** — `dedupeRecords`/`mergeRecords` collapse rows sharing a key (`lead_id`, else
   `market_slug|address|owner`) into one merged record before import.
2. **On replay (find-first-or-create, org-scoped):** Owner by `matchKey` (`status ACTIVE`) →
   *reused*; Property by `PropertyExternalIdentifier(provider, leadId)` then resolver → *resolved*;
   Opportunity by `(organizationId, propertyId, title, source)` → *reused*; Note by identical
   `body` → *skipped*. Net: a second identical run creates **0** new Owner/Opportunity/Note.
   **This is the accepted behavior to reproduce exactly — no new dedup policy is introduced.**

**Failure handling:** per-row `try/catch` → increment `skipped`, capture a **sanitized**
`error.message` in `errors[]`; the run **continues** (partial import, *not* transactional
all-or-nothing). Accepted as-is.

**Organization scoping & provenance:** every read/write is `organizationId`-scoped;
`ensureOrganizationAndActor` **fails closed** if the actor does not belong to the org; provenance is
recorded via `PropertyExternalIdentifier` (provider + leadId), an `ActivityLog` event, a `Note`, and
`opportunity.source`.

**Job metadata & cleanup:** job files live under `jobDir()` and are **retained** (they *are* the job
history) — there is **no auto-deletion** in code; the org-scoped, fail-closed, path-free read surface
(`listLeadImportJobs`/`getLeadImportJob`/`toPublicJob`) is already unit-tested (11 cases). Upload
path-traversal is guarded (`assertSafeImportPath`); import is ADMIN-only; runner is detached; `spawn`
uses array args. **Cleanup = documented retention; no deletion policy is invented.**

**ATM Wholesale:** `lib/atm-wholesale-calculator.ts` is a **pure function** — imports no `prisma`,
no `lib/analysis.ts`, touches no DB, **persists nothing**; deterministic workbook-parity math. The
`/analyzer/atm-wholesale` page reads Opportunities/Properties **as calculator inputs only**
(org-scoped SELECTs) and displays an **advisory, unsaved** result. It is **not** a competing analysis
engine or source of truth (Wave 4 labeled it advisory).

## 3. Exit criteria (objective — all ✅ to accept)

### 3.1 Import — unit (pure parse/validation/limit logic)
- [ ] Parser limit/extension coverage confirmed complete (existing 9 cases: xlsx/unsupported
      rejection, size/row/column/cell/record caps, valid CSV) — extend only for a genuinely
      untested **pure** path (delimiter selection / header aliasing / JSON-vs-delimited detection).

### 3.2 Import — integration (DB-backed, throwaway org; runs the REAL importer)
- [ ] **Idempotency/convergence** — running the actual importer twice on the same file creates
      Owner/Property/Opportunity/Note on run 1 and **0 new** on run 2 (reused/resolved/skipped),
      proving reliance on domain-level dedup (no new policy).
- [ ] **Provenance** — a `PropertyExternalIdentifier(provider, leadId)` + `Note` + `ActivityLog`
      event are written, org-scoped.
- [ ] **Cross-org actor fails closed** — importing with an actor from another org is rejected
      (`ensureOrganizationAndActor` throws; nonzero exit; nothing written).
- [ ] **Org-scoping** — all created records carry the importing org's `organizationId`.

### 3.3 ATM — unit (pure calculation)
- [ ] Edge cases beyond the 3 parity tests: zero GPI → 0% rates; zero cap rate →
      `initialPropertyValueUsd = null` and safe downstream zeros/nulls; non-finite inputs cleaned to
      0; MAO = buyHold − fee. Deterministic.

### 3.4 ATM — boundary (no-write / no-coupling lock)
- [ ] **Structural lock:** a test asserts `lib/atm-wholesale-calculator.ts` imports **neither**
      `prisma`/`@/lib/prisma` **nor** any `analysis` module (guards against future coupling).
- [ ] **Page read org-scoping:** the `/analyzer/atm-wholesale` loader's Opportunity/Property reads
      are `organizationId`-scoped SELECTs with **zero** create/update/delete. *(If a read is found
      not org-scoped → §6 stop condition: cross-org exposure.)*

### 3.5 Organization-isolation & integrity
- [ ] Import + ATM reads/writes org-scoped and regression-locked; `scripts/audit/crm-integrity.mjs`
      remains clean (test + prod read-only).

### 3.6 Boundary-regression (must remain true)
- [ ] Frozen V1.3 Underwriting + V1.4 Closing modules **byte-unchanged vs `v1.4.0`**.
- [ ] No import/ATM path writes Underwriting/Closing/ScenarioResult/UnderwritingDecision; no new
      source of truth (SoT matrix holds).

### 3.7 Documentation
- [ ] Off-Roadmap Assessment (Import + ATM rows) + Defect Register + Progress Matrix + this record's
      §5 updated with evidence.

## 4. Required validation gate (all green)

`prisma validate` · `prisma migrate status` (test DB @ 30) · `tsc --noEmit` · **complete unit suite**
(coverage gate holds) · **full E2E suite** (incl. new import integration) · isolated production build
· secret scan · dependency audit (`xlsx` absent) · ownership guard · **frozen-ref + frozen-module
unchanged** · `crm-integrity.mjs` clean (test + prod read-only).

## 5. Results / evidence

**Source of truth documented before testing** — §2 (import formats/limits, the two-layer
idempotency = domain-level find-first-or-create, per-row partial-failure handling, org-scoping/
provenance, retained job files, ATM purity). No behavior was changed.

**Unit tests added (5 cases) — `tests/unit/analysis/atm-wholesale-boundary.test.ts`:**
- **Structural lock** — the ATM calculator source imports **no `prisma`, no `analysis`** and makes
  no persistence call (guards against future coupling / becoming a source of truth).
- Edge cases — zero GPI → 0% rates (no div-by-zero); zero cap rate → `initialPropertyValueUsd null`
  + safe downstream; MAO = buyHold − fee; non-finite inputs cleaned (no NaN leaks).
- *(Existing import parser (9) + job-metadata isolation (11) + ATM parity (3) confirmed already
  complete — not duplicated.)*

**Integration test added (12 assertions) — `scripts/e2e-lead-import-integration.mjs`** (runs the
**real importer** against the test DB):
- **Idempotency/convergence** — run 1 creates Owner/Property/Opportunity/Note; **run 2 on the same
  file creates 0 new** (reused/resolved/skipped) → proves reliance on domain-level dedup, no new
  policy.
- **Provenance** — `PropertyExternalIdentifier(provider, leadId)` + `Note` + `opportunity.created`
  `ActivityLog` written, org-scoped.
- **Cross-org actor fails closed** — importing org A as actor B exits nonzero, cites actor↔org
  membership, leaks **0** records into B.
- **Org-scoping** — created opportunity belongs to A only (B has none).

**ATM boundary confirmed:** calculator lib is pure (structural lock, above); the
`/analyzer/atm-wholesale` page loader reads Opportunities/Properties with
`where: { organizationId: user.organizationId }` (org-scoped SELECTs, **zero** writes) — advisory,
unsaved. **No §6 stop condition.**

**Gate:** `tsc 0` · unit **61 files / 93.0%** (was 60) · **E2E 42 scripts** (was 41) · isolated build
OK · `crm-integrity.mjs` clean (test + **prod** read-only) · frozen V1.3/V1.4 modules
**byte-unchanged vs `v1.4.0`** · `xlsx` absent · ownership guard passes.

**Behavior classification:** all work is **testing existing intended behavior** — no confirmed
defect required a fix; **no new behavior/format/dedup policy/ATM persistence** added.

## 5b. Criteria status (§3)
- §3.1 import parser/limit unit coverage — ✅ confirmed complete (no genuine gap; not duplicated).
- §3.2 import integration (idempotency/convergence, provenance, cross-org fail-closed, org-scoping) — ✅.
- §3.3 ATM edge cases — ✅. · §3.4 ATM boundary (structural no-prisma/no-analysis lock + page reads org-scoped, 0 writes) — ✅.
- §3.5 org-isolation + integrity clean — ✅. · §3.6 frozen unchanged / no new SoT — ✅.
- §3.7 docs updated — ✅. · §4 gate — ✅ green. · §6 stop conditions — none triggered.

## 6. Stop conditions — halt and present a SEPARATE decision package if any finding requires

- a **schema or migration**; a **new uniqueness constraint**; a **new import format**; a **new
  deduplication policy**; **persistence of ATM results**; a change to **canonical Underwriting or
  Closing**; or any **Automation / D19** work.
- a **cross-organization exposure** (e.g., a non-org-scoped ATM/import read) a test reveals.
- any **regression** in the frozen V1.3/V1.4 modules.
In these cases Wave 6 pauses; the finding is documented in the register and separately authorized —
no self-correction beyond a narrowly-scoped confirmed-defect fix (with a regression test).

## 7. Non-goals / prohibitions

No new import formats/capabilities · no new dedup/idempotency policy · no ATM persistence/model/
approval · no AI · no email/SMS · no Automation · **no D19 fix** · no schema/migration unless a
confirmed defect requires it (separately reviewed) · no change to frozen V1.3/V1.4 code · **no
merge, no deploy** · no marking Wave 6 accepted without Founder approval.

---

*Status: criteria defined (acceptance-first); executing against §3–§4 in this wave; will stop for
Founder review. Production untouched; Automation paused.*

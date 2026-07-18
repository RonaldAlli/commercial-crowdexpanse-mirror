# Platform Restoration — Wave 2 Acceptance (V1.3 Underwriting Verification)

> **Status: PENDING FOUNDER REVIEW.** Wave 2 of the roadmap-restoration program (2026-07-18),
> executed after Waves 1 & 4. **Verification-only** — it proves the frozen V1.3 Commercial
> Underwriting architecture and its guarantees are intact in current `main`. **No code, schema, or
> migration changed; nothing deployed; Automation paused (D19 untouched).**

---

## 1. Frozen-module verification — all byte-identical to `v1.4.0`

`git diff v1.4.0 -- <path>` empty for every V1.3 module:

- **Kernel:** `lib/analysis.ts` — **unchanged**.
- **Engine (pure siblings):** `lib/underwriting/{model-version, assumptions, debt-sizing, schedule,
  cash-flow, exit, sensitivity, findings, scenario-result, financing}.ts`, `lib/underwriting.ts` —
  **all unchanged**.
- **Generated documents:** `lib/documents/offer-memo.ts`, `offer-memo-service.ts` — **unchanged**.
- **Analyzer server-side:** `app/(workspace)/analyzer/actions.ts` and `[opportunityId]` routes —
  **unchanged**.

## 2. Guarantee verification (via the passing suite + unchanged code)

| V1.3 guarantee | Evidence | Verdict |
|---|---|---|
| **Deterministic calculations** around an unchanged kernel | `analysis.ts` byte-unchanged; unit tests for debt-sizing/schedule/cash-flow/exit/sensitivity pass | ✅ intact |
| **Scenario lineage + fingerprints** (a later version never alters a prior version's metrics — Calc Principle 5) | `model-version.ts`/`scenario-result.ts` unchanged; `e2e-underwriting` lineage/version assertions | ✅ intact |
| **Findings/recommendation** (engine suggests, humans decide; R-A `findingsVersion` separation) | `findings.ts` unchanged; unit + e2e | ✅ intact |
| **Decision + `UNDERWRITING_APPROVAL`** (terminal, append-only, immutable `UnderwritingDecision`; outside the engine; never a calc input; separate RBAC) | e2e decision assertions; `permissions.ts` `UNDERWRITING_APPROVAL` present + tested | ✅ intact |
| **Scenario comparison** (read-only, per-version metrics from own results) | `/analyzer/[opportunityId]/compare` route unchanged | ✅ intact |
| **Offer-Memo generation** (Documents-owned GENERATED artifact from a LOCKED scenario; immutable canonical snapshot + SHA-256; append-only sequence; one-way Documents→Underwriting seam) | `offer-memo*.ts` unchanged; unit + e2e | ✅ intact |

## 3. Test evidence (isolated worktree, test DB @ 30)

- **Underwriting unit tests:** `tests/unit/underwriting/*` + `tests/unit/analysis/*` → **145 tests,
  145 pass, 0 fail** (the CRITICAL modules are gated ≥90% branch in the standing unit suite).
- **`scripts/e2e-underwriting.mjs`:** **166 assertions, 0 failed.**
- Full standing gate this session: `tsc 0 · unit 58 files/93.0% · E2E 40 scripts`.

## 4. CRM / off-roadmap coupling — none

No CRM/off-roadmap module imports or mutates any underwriting module (re-confirmed in Wave 1). ATM
Wholesale does **not** import `lib/analysis.ts` and persists nothing; it is advisory-only and now
labeled as such in-product (Wave 4).

## 5. Defects

**None.** V1.3 Commercial Underwriting is verified intact and un-regressed. No correction required;
no defect to document or isolate.

## 6. Files changed · architecture impact

- **None** (verification-only) except this acceptance record + a discovery-doc status note.
- Frozen V1.3 modules **byte-unchanged**; production untouched.

*Status: Wave 2 complete → PENDING FOUNDER REVIEW. Proceeding to Wave 3 (Closing verification). No
merge, no deploy, Automation paused.*

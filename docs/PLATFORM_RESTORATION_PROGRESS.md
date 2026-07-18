# Platform Roadmap Restoration — Progress Matrix

> **The single high-level "where are we?" view** of the roadmap-restoration program. Answers
> *progress* (this doc), complementing the [Architecture Index](./PLATFORM_ARCHITECTURE_INDEX.md)
> (*navigation*) and [Current Platform Status](./CURRENT_PLATFORM_STATUS.md) (*live operational
> state*). Documentation-only. **As of 2026-07-18.**
>
> **Status: ✅ FOUNDER-ACCEPTED + MERGED to `main` `d5998a3` (strict fast-forward, 2026-07-18).** The
> restoration branch history is preserved (the branch is an ancestor of `main`). **Deployment is a
> separate, not-yet-authorized Founder decision** — production still serves the prior build; nothing
> was deployed. Automation stays paused (D19 open).

---

## Progress matrix

| Phase / Wave | Purpose | Status | Founder review | Merge | Deploy |
|---|---|---|---|---|---|
| **Discovery** | Reconstruct roadmap; inventory; defect register; source-of-truth; off-roadmap assessment; restoration plan (6 docs) | ✅ Complete | ✅ Accepted | ✅ merged | ⏸ pending |
| **Wave 1** | Security · organization isolation · data integrity (CRM isolation + diligence↔Closing boundary E2E; read-only integrity audit) | ✅ Complete | ✅ **Accepted** | ✅ merged | ⏸ pending |
| **Wave 2** | V1.3 Underwriting integrity — verification (byte-identical modules; 145 unit + 166 e2e) | ✅ Complete | ✅ Accepted | ✅ merged | ⏸ pending |
| **Wave 3** | V1.4 Closing integrity — verification (byte-identical modules; 97 unit + 245 e2e; PAID gate) | ✅ Complete | ✅ Accepted | ✅ merged | ⏸ pending |
| **Wave 4** | Shared projections · navigation · UI integration + documentation reconciliation (ATM advisory label) | ✅ Complete | ✅ **Accepted** | ✅ merged | ⏸ pending |
| **Wave 5** | CRM integration & quality — CRM unit + integration/boundary tests; single-primary invariant; D-CRM-TEST closed | ✅ Complete ([acceptance](./releases/PLATFORM_RESTORATION_WAVE_5_ACCEPTANCE.md)) | ✅ Accepted | ✅ merged | ⏸ pending |
| **Wave 6** | Import pipeline & ATM Wholesale — idempotency/provenance/cross-org integration + ATM no-write boundary (verify existing behavior) | ✅ Complete ([acceptance](./releases/PLATFORM_RESTORATION_WAVE_6_ACCEPTANCE.md)) | ✅ Accepted | ✅ merged | ⏸ pending |
| **Wave 7** | Full-platform consolidation + Merge Readiness Decision Package (no new implementation) | ✅ Complete ([acceptance](./releases/PLATFORM_ROADMAP_RESTORATION_ACCEPTANCE.md)) | ✅ Accepted | ✅ merged | ⏸ pending |

**Execution order so far:** Discovery → Wave 1 → Wave 4 → *(governance: Index + Current-Status)* →
Wave 2 → Wave 3. (Waves 2–4 were interleaved by Founder authorization; numeric order is shown above
for reference.)

## Governance additions (not waves)

| Doc | Purpose | Status |
|---|---|---|
| [Architecture Index](./PLATFORM_ARCHITECTURE_INDEX.md) | Single navigation entry point | ✅ Added |
| [Current Platform Status](./CURRENT_PLATFORM_STATUS.md) | Single live operational-state surface | ✅ Added |
| This progress matrix | Single restoration-progress view | ✅ Added |

## Acceptance records (evidence per wave)

- [Wave 1 Acceptance](./releases/PLATFORM_RESTORATION_WAVE_1_ACCEPTANCE.md) ·
  [Wave 2](./releases/PLATFORM_RESTORATION_WAVE_2_ACCEPTANCE.md) ·
  [Wave 3](./releases/PLATFORM_RESTORATION_WAVE_3_ACCEPTANCE.md) ·
  [Wave 4](./releases/PLATFORM_RESTORATION_WAVE_4_ACCEPTANCE.md)
- [Restoration Plan](./releases/PLATFORM_ROADMAP_RESTORATION_PLAN.md) (full wave scope) ·
  [Defect Register](./releases/PLATFORM_STABILIZATION_DEFECT_REGISTER.md) (no Critical/High)

## Headline

Discovery + Waves 1–7 complete, **Founder-accepted, and merged to `main` `d5998a3`** (strict
fast-forward; branch history preserved). Frozen V1.3 Underwriting + V1.4 Closing verified intact
(byte-identical); CRM/Import/ATM quality raised through tests; no frozen-code, schema, or migration
change. **Deployment remains a separate, not-yet-authorized Founder decision** — production still
serves the prior build. Automation stays paused (D19 open).

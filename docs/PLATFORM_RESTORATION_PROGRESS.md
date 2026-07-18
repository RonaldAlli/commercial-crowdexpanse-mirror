# Platform Roadmap Restoration — Progress Matrix

> **The single high-level "where are we?" view** of the roadmap-restoration program. Answers
> *progress* (this doc), complementing the [Architecture Index](./PLATFORM_ARCHITECTURE_INDEX.md)
> (*navigation*) and [Current Platform Status](./CURRENT_PLATFORM_STATUS.md) (*live operational
> state*). Documentation-only. **As of 2026-07-18.**
>
> **Branch:** `stabilize/roadmap-restoration` (not merged). **Program rule:** every wave stops for
> Founder review; **no merge or deploy** occurs until the full-platform acceptance (Wave 7) is
> Founder-accepted. Automation stays paused (D19 open) throughout.

---

## Progress matrix

| Phase / Wave | Purpose | Status | Founder review | Merge | Deploy |
|---|---|---|---|---|---|
| **Discovery** | Reconstruct roadmap; inventory; defect register; source-of-truth; off-roadmap assessment; restoration plan (6 docs) | ✅ Complete | ⏳ Pending | ❌ No | ❌ No |
| **Wave 1** | Security · organization isolation · data integrity (CRM isolation + diligence↔Closing boundary E2E; read-only integrity audit) | ✅ Complete | ✅ **Accepted** (branch-only) | ❌ No | ❌ No |
| **Wave 2** | V1.3 Underwriting integrity — verification (byte-identical modules; 145 unit + 166 e2e) | ✅ Complete | ⏳ Pending | ❌ No | ❌ No |
| **Wave 3** | V1.4 Closing integrity — verification (byte-identical modules; 97 unit + 245 e2e; PAID gate) | ✅ Complete | ⏳ Pending | ❌ No | ❌ No |
| **Wave 4** | Shared projections · navigation · UI integration + documentation reconciliation (ATM advisory label) | ✅ Complete | ✅ **Accepted** (branch-only) | ❌ No | ❌ No |
| **Wave 5** | CRM integration & quality — CRM CRUD/lifecycle tests (unit → integration → E2E layering), single-primary rule, remaining D-CRM-TEST | 📋 Criteria defined ([acceptance-first](./releases/PLATFORM_RESTORATION_WAVE_5_ACCEPTANCE.md)); execution not started | ⏳ Pending auth | ❌ No | ❌ No |
| **Wave 6** | Import & ATM Wholesale integration refinements (confirm coverage; optional route relocation) | ⏸ Not started | — | ❌ No | ❌ No |
| **Wave 7** | Full platform acceptance — complete gate + final acceptance package; **only after this** is a controlled merge + deploy considered | ⏸ Not started | — | ❌ No | ❌ No |

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

Discovery + Waves 1–4 complete; **the frozen V1.3 Underwriting and V1.4 Closing foundations are
positively verified intact** (byte-identical + full test evidence), CRM isolation + diligence↔Closing
boundary are proven, and documentation governance is repaired. Waves 5–7 remain — the focus shifts
from *proving the architecture is intact* to *improving CRM quality* while preserving the frozen
boundaries. **Nothing is merged or deployed; Automation stays paused until after Wave 7 acceptance.**

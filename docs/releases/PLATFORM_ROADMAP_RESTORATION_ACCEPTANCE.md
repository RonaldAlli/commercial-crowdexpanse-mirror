# Platform Roadmap Restoration — Acceptance & Merge Readiness Decision Package

> **Status: PENDING FOUNDER ACCEPTANCE.** The single decision artifact consolidating the entire
> roadmap-restoration program (Discovery + Waves 1–7). It records what was done, what remains, and a
> neutral, evidence-based **merge-readiness recommendation**. **Nothing here merges or deploys** —
> the merge/deploy decision is the Founder's. Branch `stabilize/roadmap-restoration`; Automation
> paused (D19 open); frozen V1.3/V1.4 unchanged.
>
> Entry points: [Architecture Index](../PLATFORM_ARCHITECTURE_INDEX.md) · [Current Platform
> Status](../CURRENT_PLATFORM_STATUS.md) · [Progress Matrix](../PLATFORM_RESTORATION_PROGRESS.md) ·
> [Canonical Roadmap](../roadmap/CANONICAL_PLATFORM_ROADMAP.md).

---

## 1. Restoration objectives — completed
Started from the earliest accepted roadmap baseline, verified forward, and integrated the off-roadmap
features through tests + documentation **without changing behavior**:

| Phase | Outcome | Record |
|---|---|---|
| **Discovery** | Roadmap reconstructed; platform HEALTHY — no Critical/High defect | 6 discovery docs |
| **Wave 1** | Security / org-isolation / data integrity proven (CRM isolation + diligence↔Closing boundary E2E; read-only integrity audit) | [W1](./PLATFORM_RESTORATION_WAVE_1_ACCEPTANCE.md) · ✅ Founder-accepted (branch) |
| **Wave 2** | V1.3 Underwriting **byte-identical** to `v1.4.0`; verified | [W2](./PLATFORM_RESTORATION_WAVE_2_ACCEPTANCE.md) |
| **Wave 3** | V1.4 Closing **byte-identical**; PAID gate un-bypassable; verified | [W3](./PLATFORM_RESTORATION_WAVE_3_ACCEPTANCE.md) |
| **Wave 4** | Roadmap/status drift corrected; ATM labeled advisory (presentation-only) | [W4](./PLATFORM_RESTORATION_WAVE_4_ACCEPTANCE.md) · ✅ Founder-accepted (branch) |
| **Wave 5** | CRM test gap (D-CRM-TEST) closed — unit + integration/boundary; single-primary invariant | [W5](./PLATFORM_RESTORATION_WAVE_5_ACCEPTANCE.md) |
| **Wave 6** | Import idempotency/provenance/cross-org + ATM no-write boundary verified | [W6](./PLATFORM_RESTORATION_WAVE_6_ACCEPTANCE.md) |
| **Wave 7** | Consolidation + this decision package | [W7](./PLATFORM_RESTORATION_WAVE_7_ACCEPTANCE.md) |

**Net:** frozen Underwriting/Closing proven intact; CRM/Import/ATM quality raised through tests
(unit **58→61 files**, E2E **39→42 scripts**); no source-of-truth conflict; no architecture weakened.

## 2. Change surface vs `main`
**20 commits · 27 files · +2055 / −10 — 19 docs · 3 test files · 4 scripts · 1 app file** (ATM
advisory label, presentation-only). **Zero** frozen domain code; **no** schema/migration; **no**
domain behavior change. Restoration branch changed **no** frozen module vs `main`.

## 3. Remaining known risks / deferred items (NOT resolved here)
| ID | Item | Disposition |
|---|---|---|
| **D19** | Automation runtime launch blocker (`tsx` loader) | **OPEN** — out of restoration scope; Automation stays paused; separately gated. |
| **D-CRM-PRIMARY-CONCURRENCY** | Single-primary invariant is app-enforced, no DB constraint | **Documented potential risk** (not reproduced; prod clean). Remedy = partial-unique-index **migration decision**, separately reviewed. |
| Board badges (LB-7) / ActivityLog index (TX-A) | V1.4 deferred-additive items | Benchmark-gated; not in scope. |
| D15 (DealAnalysis drop) | Post-V1.3 cleanup | Deferred; separate. |
| Platform-dependency advisories | Pre-existing (present at `v1.4.0`) | Separate platform-upgrade debt (ADR-0006 §residual). |

None of the above is introduced or worsened by the restoration branch.

## 4. Production impact assessment
- The branch is **additive tests + docs + one presentation-only UI label**. Merging it introduces
  **no** schema/migration and **no** domain behavior change.
- `main` already reproduces production (30 migrations, build `YPHm2Nw65jWb7JlF7eLUn`); this branch is
  **0 commits behind `main`** and fast-forwardable.
- The only production-visible change on eventual **deploy** is the ATM Wholesale **advisory banner**
  (harmless, and it *strengthens* the Underwriting source-of-truth boundary).

## 5. Rollback strategy
- **Merge** is a strict fast-forward of an additive branch → revert = reset `main` to the prior tip;
  no data/schema implications.
- **Deploy** (if chosen) rebuilds the same 30-migration schema; rollback = redeploy the prior build
  `YPHm2Nw65jWb7JlF7eLUn`. No migration rollback is involved (none added).

## 6. Merge prerequisites
1. Founder acceptance of this package. 2. Branch clean; tips match local/Gitea/GitHub. 3. `main`
unmoved and fast-forwardable; branch 0 behind. 4. Frozen refs (`release/1.3`,`release/1.4`,`v1.3.0`,
`v1.4.0`) unmoved. 5. Complete gate green (§ Wave 7 §3). **Strict fast-forward only — no squash, no
merge commit.**

### 6a. Final merge pre-flight (run immediately before the fast-forward — only if the Founder accepts)
Perform these checks at the moment of merge; proceed **only if all remain true** (any failure → stop
and re-review, do not merge):
1. `git fetch` all remotes. 2. `main` has **not advanced** (still `ba1bd7c` on local/Gitea/GitHub).
3. `stabilize/roadmap-restoration` tip matches on local/Gitea/GitHub. 4. Working tree **clean**; **no
untracked files**. 5. Ownership guard (`scripts/predeploy-check.mjs`) passes. 6. **No schema drift**
(`prisma migrate status`; branch adds no migration). 7. Production still matches the Wave 7
assumptions (build `YPHm2Nw65jWb7JlF7eLUn`, 30 migrations, Automation absent). 8. Frozen refs unmoved.
Only then perform the strict fast-forward and push the identical `main` tip to both remotes.

## 7. Deployment prerequisites (only if Founder authorizes deploy after merge)
Standard predeploy gate (prisma validate/status, tsc, unit, full E2E, isolated build, secret scan,
dependency audit, `xlsx` absent, ownership guard, frozen-ref check) · fresh production backup ·
deploy **web only** (`crowdexpanse-commercial`); **do not** start `crowdexpanse-automation` ·
**no migration** (prod already at 30) · post-deploy smoke of CRM/Underwriting/Closing/PAID + the ATM
advisory label.

## 8. Post-merge verification plan
Confirm `main` = branch tip on both remotes; frozen refs unmoved; `git diff v1.4.0` on the kernel
empty; unit 61 / E2E 42 green from `main`; `crm-integrity.mjs` clean; Automation still absent.

## 9. Recommendation
Stated as three distinct things — evidence, engineering assessment, and final authorization — so the
engineering process is not read as having approved the merge:

- **Evidence.** Additive-only change surface (docs + tests + one presentation-only UI label); zero
  frozen-code change; kernel byte-identical to `v1.4.0`; complete validation gate green; no
  schema/migration; `main` already reproduces production. D19 and D-CRM-PRIMARY-CONCURRENCY remain
  separately gated (not blockers for this branch).
- **Engineering assessment.** The restoration branch **satisfies the documented restoration
  objectives and validation criteria**. Based on the evidence gathered, it **appears ready for
  Founder consideration for a strict fast-forward merge.** This is an engineering assessment, not an
  approval.
- **Final authorization.** The **final merge and any subsequent deployment remain separate Founder
  decisions.** No merge or deploy is performed until the Founder explicitly authorizes it. Deploy is
  a separate optional step (its only production-visible effect is the advisory ATM label); Automation
  stays paused regardless.

## 10. Automation hold confirmation
Automation remains **paused**; executor **absent**; D19 **open**; migration 27 inert; no Automation
work was performed in any restoration wave. Resuming Automation remains gated on a separate D19 fix +
Founder authorization — independent of this acceptance.

---
*Stop status: **PLATFORM ROADMAP RESTORATION — PENDING FOUNDER ACCEPTANCE.** Awaiting the Founder's
merge/deploy decision. Nothing merged, deployed, or migrated; production untouched.*

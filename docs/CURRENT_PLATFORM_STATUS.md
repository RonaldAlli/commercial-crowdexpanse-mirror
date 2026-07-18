# CrowdExpanse Commercial — Current Platform Status

> **The single operational current-state surface.** Volatile values (commit, build, migration
> count, process state) live **here only** — other documents link to this page instead of
> duplicating them, so there is exactly one place to update. Architecture locks and historical
> acceptance records are immutable and do **not** restate these values.
>
> **As of: 2026-07-18.** Update this timestamp and the table whenever production or branch state
> changes. Entry point: [Platform Architecture Index](./PLATFORM_ARCHITECTURE_INDEX.md).

---

## Production

| Fact | Value |
|---|---|
| `main` tip | `d5998a3` (local = Gitea = GitHub) — roadmap-restoration merged 2026-07-18 |
| Serving build | `YPHm2Nw65jWb7JlF7eLUn` · web health `ok` (built pre-merge; `main` is ahead — restoration **not yet deployed**) |
| Applied migrations | **30** (no drift, 0 rolled-back/unfinished) |
| Data integrity | clean — 0 cross-org / 0 orphan / 0 duplicate (audit: `scripts/audit/crm-integrity.mjs`) |

## Frozen baselines (immutable references)

| Baseline | Annotated tag object → peeled commit (= release branch) |
|---|---|
| **v1.3.0** (Underwriting) | `bca39f4` → `d341c0a` (`release/1.3`) |
| **v1.4.0** (Closing Center) | `c1133ad` → `ece38aa` (`release/1.4`) |

## Automation (V2.0.1)

- **Accepted (implementation) + migration 27 in production, but the executor was NEVER started** —
  paused at dark-start. Inert: **0 jobs / 0 executions / 0 AUTOMATION ActivityLog**.
- **[D19](./roadmap/TECHNICAL_DEBT.md) (runtime launch blocker) is OPEN** and gates the dark start.
  Automation does not resume until the roadmap-restoration program reaches full acceptance and the
  Founder authorizes it.

## CRM layer (off-roadmap, accepted)

- Founder-accepted 2026-07-18 (migrations 28–30 + tooling); additive, org-scoped, isolated from the
  frozen Underwriting/Closing domains. Governed by
  [CRM Operations Boundary](./architecture/CRM_OPERATIONS_BOUNDARY.md) + ADR-0006 (CSV-only import).
  ATM Wholesale is **advisory / non-authoritative** (not Underwriting truth).

## Roadmap-restoration program

> High-level progress view: [Restoration Progress Matrix](./PLATFORM_RESTORATION_PROGRESS.md).

| Phase | Status |
|---|---|
| Discovery + Waves 1–7 | ✅ complete, Founder-accepted — [Restoration Acceptance + Merge Readiness](./releases/PLATFORM_ROADMAP_RESTORATION_ACCEPTANCE.md) |
| Merge | ✅ **MERGED** to `main` `d5998a3` (strict fast-forward, 2026-07-18); branch history preserved |
| Deploy | ⏸ separate, **not-yet-authorized** Founder decision — production still serves the prior build |

## Open technical debt gating future work

- **D19** — Automation runtime launch blocker (gates Automation dark start).
- **D15** — deprecated `DealAnalysis` table retained (separate destructive-migration cleanup).
- **D4** — off-host R2 backup mirror + cron unscheduled (DR caveat).
- Full register: [Technical Debt](./roadmap/TECHNICAL_DEBT.md).

---

*This is the only document that should state live operational values. If you find these values
elsewhere claiming to be authoritative, reconcile them to this page (that drift is what
roadmap-restoration Wave 4 corrected).*

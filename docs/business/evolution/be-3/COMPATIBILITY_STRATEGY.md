# BE-3 — Compatibility Strategy (planning)

> **Status: PLANNING — for review.** Defines how enforcing the canonical language preserves
> compatibility. **This is the gate: no rename, alias, deprecation, schema change, or migration happens
> until this strategy is approved.** Nothing is changed by this document or this branch. Scope = the six
> mappings L1–L6 + Lead-surface (L0) in `CANONICAL_GLOSSARY.md`; each fix closes a specific violation in
> `LANGUAGE_RULES.md`; canonical words come from the frozen `../../3_LANGUAGE_SPECIFICATION.md §2`.

## Governing rule

**No destructive compatibility change before approval.** Every language change has a defined, reversible
path and must not break persisted data, external contracts, or in-flight clients at the moment it lands.
**Additive-then-subtractive, never subtractive-first.** Reduce (Enforcement Plan Phase 4) is last.

## Compatibility tiers (by blast radius)

| Tier | Category | Technique | Reversible? |
|---|---|---|---|
| **A. Internal identifiers** | variable/function/type/local names | pure behavior-preserving rename; tests verify | Yes (revert) |
| **B. Internal structural** | model/class names, module paths | rename + keep a re-export/alias one release; remove after refs migrate | Yes |
| **C. API/contract** | route names, request/response fields, event names | **additive dual-write/dual-read**; deprecate old with a window; remove after clients migrate | Yes, in window |
| **D. Persistence** | table/`@map`/column/enum values, stored strings | **expand → migrate → contract**: add canonical, backfill, dual-read, cut over, drop old — each a **guarded migration** | Yes, per step |
| **E. Surface** | UI labels, report headers, prompt text, external copy | product-approved; may need coordinated release notes; a user-facing change, not a refactor | Varies |

## Per-item mapping (BE-3 scope → tier → path)

| ID | Change | Tier(s) | Compatibility path |
|---|---|---|---|
| **L1** "Pipeline"(object)→Opportunity | E | Relabel nav to the Opportunity object; **keep "Pipeline" as the §7 view word** (not a deletion — a homonym split). Surface-only. |
| **L2** "deal contact/target/contact"→Seller | B, D, E | Rename internal identifiers (B); if any persisted field/`@map` encodes it (`schema.prisma:899`), use expand→contract (D); relabel surfaces (E). |
| **L3** `Opportunity.source` free-text→Acquisition Channel | D | Highest-risk. Add structured `AcquisitionChannel`, backfill from free-text, dual-read, cut over, retire free-text — guarded migrations; never rename in place. |
| **L4** BI "closed-won"→Transaction Closed | E | Report/label change; ensure BI still derives from the same authoritative facts (BI Rule 1) — a *name* change, not a metric change. |
| **L5** "match"(dedupe)→Resolution/Merge | B | Rename `OwnerMatchDecision`/`PropertyMatchDecision` identifiers with re-export aliases for a release; **do not** touch `BuyerMatch` (canonical Match). |
| **L6** `Task.ownerId` "owner"→assignee | B, D | Code alias first (B); the column rename (`schema.prisma:1741`) is expand→contract (D) so existing rows/queries never break. |
| **L0** "Lead" surface retirement | E | Remove "Lead" from surfaces/language now; **the `OpportunityStage.LEAD` enum + import code is BE-4** — BE-3 does not alter the enum. |

## Sequencing rule

Changes proceed **A → B → C → D → E** in ascending blast radius, and **one L-ID at a time**. A term is
aligned at a higher tier only after its lower-tier usages are aligned, so persisted/surfaced names
change **last**, atop an already-consistent internal codebase.

## Persisted-language specifics (Tier D — L2/L3/L6)

- Never rename an enum value or `@map` in place — use **expand/contract** (add canonical, dual-read,
  backfill, cut over, retire later as a separate step).
- Every Tier-D step runs through **`migrate-deploy-guarded.sh`** (expected DB + allow-list + backup
  evidence + production confirm) and is watched with **`post-deploy-monitor.sh`**.

## External, in-flight & mirror

- **Consumers:** Tier-C-style changes ship canonical additively with a documented deprecation window.
- **In-flight records:** dual-read keeps old-vocabulary rows readable throughout.
- **Mirror:** language commits inherit `verify-merge.sh`; authoritative gate = Gitea/origin, mirror =
  observability (OPS-4) — a lagging mirror never blocks, a *diverging* one does.

## Rollback posture

A–B: `git revert`. C: keep the legacy alias until canonical is proven. D: each expand/contract step is
independently reversible; **never contract before the canonical path is verified in production**;
restore-verified backups precede every Tier-D cutover.

## Approval gate (draft conditions)

1. Each of L1–L6/L0 mapped to a tier + reversible path **before** it is written (table above).
2. Tier-D/E items carry explicit backup + monitor + (for E) product sign-off.
3. A standing **no-destructive-rename-before-approval** rule recorded as a governed decision.
4. Any change to a *canonical* word routed through `../../CHANGE_GOVERNANCE.md`, not BE-3.

**Until this strategy is approved, BE-3 stays in Detect/Measure/Prevent (Enforcement Plan Phases 1–3);
no rename, alias, deprecation, schema change, or migration is authorized.**

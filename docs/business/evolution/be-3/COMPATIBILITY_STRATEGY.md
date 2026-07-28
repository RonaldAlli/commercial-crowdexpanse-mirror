# BE-3 — Compatibility Strategy (planning)

> **Status: PLANNING — for review.** Defines how language alignment preserves compatibility. **This is
> the gate: no rename, alias, deprecation, schema change, or migration happens until this strategy is
> approved.** Nothing is changed by this document or this branch.

## Governing rule

**No destructive compatibility change before approval.** Every language change must have a defined,
reversible migration path and must not break persisted data, external contracts, or in-flight clients
at the moment it lands. Additive-then-subtractive, never subtractive-first.

## Compatibility tiers (by blast radius)

| Tier | Category | Compatibility technique | Reversible? |
|---|---|---|---|
| **A. Internal identifiers** | variable/function/type/local names | Pure rename in one commit; behavior-preserving; verified by tests | Yes (revert) |
| **B. Internal structural** | model/class names, module paths | Rename + keep a re-export/alias for one release; remove after refs migrate | Yes |
| **C. API/contract** | route names, request/response fields, event names | **Additive dual-write/dual-read**: introduce canonical name alongside old, deprecate old with a window, remove only after clients migrate | Yes, within window |
| **D. Persistence** | table/`@map`/column/enum values, stored strings | **Expand → migrate → contract**: add canonical column/value, backfill, dual-read, cut over, drop old — each step a **guarded migration** with backup evidence | Yes, per step |
| **E. Surface** | UI labels, report headers, prompt text, external copy | Product-approved; may need coordinated release notes / user comms; treat as a user-facing change, not a refactor | Varies |

## Sequencing rule

Changes proceed **A → B → C → D → E** in ascending blast radius. A term is only aligned at a higher
tier after its lower-tier usages are aligned, so persisted/surfaced names change **last**, on top of an
already-consistent internal codebase.

## Persisted-language specifics (Tier D — highest risk)

- Never rename an enum value or `@map` in place. Use **expand/contract**: add the canonical value,
  dual-read both, backfill, cut writes over, then retire the legacy value in a later, separate step.
- Every Tier-D step runs through **`migrate-deploy-guarded.sh`** (expected DB + allow-list + backup
  evidence + production confirm) and is watched with **`post-deploy-monitor.sh`**.
- Stored free-text strings that carry vocabulary (e.g. status labels persisted as strings) are treated
  as data migrations, not code edits.

## External & in-flight compatibility

- **API/event consumers:** any Tier-C change ships the canonical form *additively* first, with a
  documented deprecation window; the legacy form keeps working until the window closes.
- **In-flight records/sessions:** dual-read guarantees records written under the old vocabulary remain
  readable throughout the transition.
- **Mirror/replication:** language changes are ordinary commits; they inherit the merge + mirror-agreement
  verification (`verify-merge.sh`). (Tracks with the open mirror-sync follow-up, OPS-4.)

## Rollback posture

- Tiers A–B: `git revert`.
- Tier C: keep the legacy alias until the canonical form is proven; revert = stop dual-writing.
- Tier D: each expand/contract step is independently reversible; **never** contract before the canonical
  path is verified in production. Backups (restore-verified) precede every Tier-D cutover.

## Approval gate (draft conditions)

1. Canonical glossary frozen (Enforcement Plan Phase 0).
2. Each planned change mapped to a tier and a reversible path **before** it is written.
3. Tier D/E changes carry explicit backup + monitor + (for E) product sign-off.
4. A standing **no-destructive-rename-before-approval** rule recorded as a governed decision.

**Until this strategy is approved, BE-3 remains detect-only (Enforcement Plan Phases 0–1); no rename,
alias, deprecation, schema change, or migration is authorized.**

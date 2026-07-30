# CRE Operating Workspace — UI Milestone 2 Increment 2 — Acceptance Record

> **Status: ACCEPTED WITH OBSERVATIONS** (founder-accepted 2026-07-30). Accepts M2 Increment 2 "Missing
> Assumption Synthesis + Provenance" (PR #60, merged to `main` `12f4658`). Read-only, over existing
> underwriting authority. **No deployment.** Context: `UI_M2_INCREMENT2_REPORT.md`,
> `UI_M2_INCREMENT1_ACCEPTANCE.md`, [[crowdexpanse-cre-workspace]].

## Preflight (confirmed before merge)

PR #60 open + mergeable · head `feat/cre-ui-m2-increment-2` · base `main` · diff = only the 8 reported files
(+532/−2) · no schema / API / underwriting-engine / recommendation / analyzer changes · no writes · four-state
model preserved · provenance rendered directly from existing authority · Playwright 21/21 green · Increment 1
regression green. Merge verified (`verify-merge.sh` PASS 11/11).

## Accepted observations (recorded)

1. **The Executive Structurability Summary remains the primary operator contract** — it stays first;
   missing-information detail sits beneath it (DOM order asserted).
2. **Missing Assumption synthesis exposes existing authority only** — it explains what is missing; it does
   not compute or invent underwriting logic.
3. **Existing provenance remains authoritative** — `source` / `sourceField` / `sourceAsOf` are rendered
   verbatim; absence is stated honestly, never inferred.
4. **Grouping reflects backend authority, not UI invention** — the operational groups are the engine's own
   key-sets, so the UI exposes existing authority rather than creating a new taxonomy.
5. **"Conflicting" remains available in the model but is not fabricated** — it is displayed only when it can
   be proven from existing authority; the current backend has no per-assumption conflict detector, so it is
   not asserted today.
6. **Information quality becomes a first-class operational concept** (see carry-forward).
7. **No underwriting authority changed** — no schema, API, engine, recommendation, or write path.

## Carry-forward observation for Milestone 2 (new)

**Information quality, not just information availability.** The workspace now communicates *how trustworthy*
the supporting information is, not merely whether it exists — distinguishing **complete** information,
**incomplete provenance**, **unavailable** evidence, and **conflicting** evidence. Future increments must
preserve this distinction: operators need to understand both *what the answer is* and *how much to trust the
evidence behind it*. This complements the Executive Summary contract (answer → evidence → analysis).

## Authorization state

- Increment 2 accepted. **No deployment.**
- **NEXT GOVERNED IMPLEMENTATION = UI Milestone 2 — Increment 3: Decision Contrast + Approval History
  (Read-First)**, answering the operator's third question — *"Why does the engine recommend this, and what
  decision history already exists?"* — by surfacing the existing persisted recommendation, findings,
  `UnderwritingDecision` records, and approval history, with **no** write authority or approval actions.
  Awaits its own explicit APPROVED TO IMPLEMENT.
- Increment build order: 1 scenario-result ✅ / 2 missing-assumption synthesis ✅ / 3 decision surfacing
  (read-first) / 4 Opportunity-Workspace integration + a11y + discoverability.

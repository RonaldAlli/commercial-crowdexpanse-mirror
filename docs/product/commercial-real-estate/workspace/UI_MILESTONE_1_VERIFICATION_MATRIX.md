# CRE Operating Workspace — UI Milestone 1 Verification Matrix

> Produced by Increment 6. Maps each accepted Milestone-1 contract to its verification evidence.
> **Evidence kinds:** **A** = automated (unit/contract or browser) · **S** = structural source inspection ·
> **B** = browser (Playwright, chromium, isolated `_test` DB) · **M** = manual/read · **D** = deferred.
> Browser runs: chromium at **desktop 1440×1000** and **mobile 390×844**, against the isolated
> `commercial_crowdexpanse_test` DB with seeded ADMIN storageState (no auth bypass, no live providers).

| Area | Required evidence | Kind | Result |
|---|---|---|---|
| Shell & primitives | structural + semantic + responsive | A/S/B | 24 primitive unit/contract tests green; a11y semantics pinned structurally; render verified at both viewports |
| Seller Queue | ordering, keyboard access, narrow layout | A/B | date-driven order preserved (unit); keyboard-reachable rows + Enter→record (browser); no narrow overflow (browser) |
| Seller Record | tenant scope, actions, synthesis, missing info | A/B | tenant-scoped 404 (browser); NBA + Missing-Information rendered as text (browser); actions bound to existing server actions (contract) |
| Opportunity Workspace | authoritative stage, blockers, timeline, cross-links | A/B | native `OpportunityStage`, stage-readiness, `TransactionTimelinePanel`, cross-links (browser); no projection use (contract) |
| Command Center | read-only, metric labels, deep links | A/B | read-only façade (contract); metric time-basis labels; authoritative `/opportunity-workspace/[id]` deep links; honest "Not yet available" (browser) |
| Synthesis | determinism, precedence, confidence, evidence chain | A | 29 synthesis unit tests green: deterministic, documented precedence, categorical confidence, four Missing-Info states, evidence chain |
| Accessibility | keyboard, semantics, labels, focus, status meaning | A/B/S | one `<h1>`, semantic sections, focus-visible links, keyboard nav (browser); status/urgency/confidence as text not color-only (browser + structural); `sr-only` (structural) |
| Responsiveness | representative viewports + overflow checks | B | no material horizontal overflow at 390px across Command Center / Seller Queue / Seller Record / Opportunity Workspace; key info reachable |
| Governance boundaries | no schema/API/domain/authority/BE-3 changes | S | diff = `synthesis.ts` (import removal) + 3 test files; no `lib/governance`, schema, API, authority, or BE-3 change |
| Cross-tenant safety | no browser path to unauthorized mutation | B | foreign seller id → 404; no mutation form on read surfaces (Command Center) |
| Full regression | all workspace UI + existing visual specs green | A/B | workspace-ui unit/contract **107/107**; Playwright **75/75** (existing specs + M1) |
| Production build | production-style isolated build passes | A | `build:isolated` exit 0 (ESLint clean, types valid after `.tsbuildinfo` refresh, routes generated) |

## Explicitly distinguished

- **Automated (unit/contract):** 107 workspace-ui tests + 29 synthesis tests (subset).
- **Browser (Playwright):** 8 M1 specs (desktop + mobile) within the 75-spec suite.
- **Structural:** a11y semantics, boundary/no-projection/no-mutation assertions across all increments.
- **Manual/read:** none required beyond the above for Milestone 1.
- **Deferred / Not tested:** an automated accessibility SCANNER (e.g., axe) — none is present in the
  repo and none was added (per authorization: use an existing scanner only if available). Accessibility
  is therefore verified by focused semantic + keyboard assertions, **not** an automated audit — no WCAG
  certification is claimed.

## Known limitation (harness observation, not a Milestone-1 defect)

The Playwright **global-teardown** aborted via the `e2e-guard` (it refused to run against the production
DB name and fail-safe-exited without deleting anything). Tests + seed ran isolated on
`commercial_crowdexpanse_test` (proven: the seed's own guard passed and the throwaway org was created in
`_test`); **production data was never touched**. The leftover `_test` org was swept manually.
`teardown.mjs` is unchanged by Increment 6; this pre-existing teardown env-resolution quirk is a candidate
for a separate maintenance item.

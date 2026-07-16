# Standard — Visual / Browser UI Testing (Playwright)

**Status:** Adopted 2026-07-16. **Scope:** every user-facing UI slice from v1.4 onward.
**Authority:** this is the *single* sanctioned approach for authenticated, in-browser UI verification. Do **not** introduce a second browser-testing tool or a bespoke per-slice harness — extend this one. Introduced with the Closing Center accordion slice ([UI Review](../roadmap/CLOSING_CENTER_UI_REVIEW.md)); see also the [Testing Roadmap](../roadmap/TESTING_ROADMAP.md).

## Why this exists

Pure `lib/*` unit tests and the `_test`-DB E2E scripts cover logic and DB orchestration, but they can't see the rendered DOM: default-open state, `aria` semantics, keyboard operation, responsive wrapping, role-gated controls, or "does toggling this mutate the server." Those are browser concerns. This standard makes verifying them **repeatable, isolated, and self-cleaning** — and turns the harness into a durable asset instead of a per-slice reinvention.

## Non-negotiables (the "MUST" list)

1. **Tool:** `@playwright/test`, Chromium only, as a **devDependency**. It must never be imported by `app/` / `lib/` / `components/` (keep it out of the production bundle). No Cypress/Puppeteer/jsdom.
2. **Database:** tests run against the **`_test` DB only**, guarded by `assertTestDatabase()` (same guard as the `e2e-*.mjs` scripts). Never point the harness at production; never run fixture mutation against prod.
3. **Server:** an **isolated** `next start` from `.next-isolated` on a **verified-free, uncommon port** (this is a shared host — the usual dev ports are taken). Set `reuseExistingServer: false` so Playwright always boots its own server and never silently reuses a foreign one. Pick the port only after confirming it is free (`ss -ltn`).
4. **Cleanup is guaranteed, not best-effort:** `globalTeardown` **cascade-deletes** every throwaway org and removes auth artifacts. A run must leave **zero** residual orgs/users in `_test` and no `storageState` files. Verify this after wiring a new slice.
5. **No secrets, binaries, or transient artifacts in git:** browser binaries, `storageState` (auth cookies), and screenshots are **git-ignored** (`tests/visual/.artifacts/`, `/test-results/`, `/playwright-report/`). Only harness *code* is committed.

## Conventions (the "SHOULD" list)

### Layout
- All specs, fixtures, and config live under **`tests/visual/`**; the config is **`playwright.config.ts`** at the repo root.
- One `*.behavior.spec.ts` (assertions) and one `*.screens.spec.ts` (screenshot capture) per slice is the default split. Assert **behavior, not pixels** — no committed golden-image snapshots.

### Visual fixtures
- Seed via a **`node --import tsx` script** (`seed.mjs`), not inside Playwright's loader — this is how the app's `@/` imports resolve the proven way (mirrors the `e2e-*.mjs` scripts).
- Namespace every fixture org by a **stable slug prefix** (e.g. `e2e-visual-<pid>`) so teardown is a single `startsWith` cascade delete.
- Seed **one throwaway org** plus the **role set** the slice needs and **opportunities/records covering every state** the UI branches on: empty / not-started, active/in-progress, terminal, **long-value** variants (to exercise wrapping/overflow), and any cross-domain reference states.
- Seed with the app's own service functions where possible (so fixtures exercise real write paths), falling back to direct `prisma.create` for read-only reference rows.
- Write a **manifest** (`.artifacts/fixtures.json`: org id, user ids, record ids) and read it in the specs **at run time** (`test.beforeAll`), **never** at module/collection time — collection runs before `globalSetup`, so a top-level `const M = manifest()` captures stale ids.

### Authenticated storage states
- Mint the session with the **app's own signed-session format** (the same HMAC the app uses), from the `_test` `SESSION_SECRET` — **no auth bypass, no application-code change.** Inject it as a **non-secure** cookie (http localhost) via Playwright `storageState`.
- One `storageState` file **per role** the slice gates on (e.g. `admin` / `writer` / `readonly`), under the git-ignored `.artifacts/auth/`. Never commit auth state; never log tokens.
- Use separate `browser.newContext({ storageState })` (or `test.use`) per role to verify role-gated controls.

### Viewport standards
Verify at these three, always:
| Name | Size |
|---|---|
| Desktop | **1440 × 1000** |
| Tablet | **900 × 1100** |
| Mobile | **390 × 844** |

Set them via `test.use({ viewport })` per describe block. Mobile is the overflow/wrapping stress case — always include a long-value fixture there.

### Screenshot naming + retention
- Name screenshots **`<viewport>-<subject>[-<variant>].png`** — e.g. `desktop-financing-open`, `mobile-escrow-long-holder`, `admin-terminal-controls`, `no-active-underwriting`.
- Screenshots are **review evidence**, not assertions. They live under the git-ignored `tests/visual/.artifacts/screenshots/`.
- **Retention:** because the evidence is not in git history, the release/review record (roadmap or acceptance doc) must list, at review time: the screenshot directory, the file names, the verification date, and the **Playwright + Chromium versions**. That is the durable record; the PNGs themselves are ephemeral.

## What every UI slice must verify

At minimum, adapt the Closing Center matrix to the slice: correct **default state**; **interactive toggles** and their `aria` state; **status/summary visible without interaction**; **keyboard** operability (Tab reach, Enter/Space) and visible focus; **collapsed/hidden content not focusable**; **role-gated controls** differ correctly (privileged vs not); **no unexpected mutation** (assert toggles/UI-only interactions issue no `POST/PATCH/PUT/DELETE`); **no console or hydration errors**; **long values wrap without overflow** at every viewport; and **empty / terminal** states render.

## Commands & fresh-host setup

- `npm run test:visual` — build isolated + run the whole harness.
- `npm run test:visual:<slice>` — focused run for one slice's specs.
- `npm run playwright:install` — download Chromium.
- **Fresh host (one-time, needs root):** `npx playwright install chromium`, then the OS libraries via `sudo npx playwright install-deps chromium`. If `install-deps` aborts (its internal `apt-get update` can be broken by a failing third-party repo), install the concrete packages directly (no `apt-get update`) using the already-fresh index; verify with `ldd <chrome-headless-shell> | grep "not found"` → expect none. Full package list + rationale in the [Testing Roadmap](../roadmap/TESTING_ROADMAP.md).

## Applies to

All future UI work — Closing Center remaining slices (Assignments, Transaction Dashboard), the eventual Automation/AI UI (2.0), and any responsive layout or regression concern. New UI slices **use this harness**; they do not invent a new testing approach. Improvements to the harness should be **generic and shared** across the repository, not slice-specific forks.

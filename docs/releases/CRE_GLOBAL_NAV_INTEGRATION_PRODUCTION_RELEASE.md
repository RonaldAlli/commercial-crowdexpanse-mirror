# CRE Operating Workspace — Global Navigation Integration — PRODUCTION RELEASE RECORD

> **Status: RELEASED** — deployed to production and verified live 2026-07-30. **Release follow-up to the
> already-released UI Milestone 1 baseline** (`CRE_UI_MILESTONE_1_PRODUCTION_RELEASE.md`). Closes the
> discoverability gap: the released Milestone-1 surfaces are now reachable from the global sidebar.
> Scope: navigation wiring + server-side role-aware visibility + accessibility. No business logic, backend,
> schema, authority, or Milestone-2 work.

## What was released

- **Source:** PR #55 `feat(cre-ui): global navigation integration`, merged to `main` (`da69990`).
- **Live release:** `releases/r1295187549721057-3330204`, build `jfwaPsI4MUZWsofupQ3Tw`.
- **Change:** two sidebar entries — **Command Center** (`/command-center`, first) and **Seller Queue** (`/seller-queue`, after Dashboard); Dashboard kept for continuity. Detail surfaces (Seller Record `/seller-queue/[id]`, Opportunity Workspace `/opportunity-workspace/[id]`) remain deep-link destinations with no sidebar entry. Role-aware visibility computed server-side in `app/(workspace)/layout.tsx` (`can(READ, SELLER)` / `can(READ, OPPORTUNITY)`) and passed to the client shell as booleans — `can()` never enters the client bundle. Added `aria-label` + `aria-expanded` to the previously-unnamed mobile menu toggle (behavior-neutral a11y improvement).
- **No migration** (UI-only; empty schema diff). **Default post-login landing unchanged** (`/dashboard`).

## Release sequence executed

1. Merge PR #55 → `da69990`; `verify-merge.sh` PASS 10/10; GitHub mirror synced.
2. D25 RC dry-run — build + targets validated, live server unchanged (DE-6 fix in effect).
3. D25 atomic production deploy — build → swap → restart → verify-runtime → smoke → complete. Auto-rollback armed; not triggered.

## Production verification (all PASS)

1. **Dashboard remains the post-login landing page** — authenticated `GET /` → 307 → `/dashboard`.
2. **Command Center is the first navigation item.**
3. **Seller Queue appears immediately after Dashboard.**
4. **Existing navigation ordering otherwise unchanged** — served sidebar: `Command Center | Dashboard | Seller Queue | Acquisition workspace | Pipeline | Deal Analyzer | Matches | Closing | Source performance`.
5. **Mobile drawer exposes the new links** — present in the served sidebar markup; interactive drawer (toggle opens, `aria-expanded` flips) verified 14/14 Playwright on this exact build pre-deploy.
6. **Existing routes remain healthy** — `/command-center`, `/seller-queue`, `/dashboard`, `/sellers`, `/opportunities`, `/api/health` all 200.
7. **Production logs remain clean** — the current process wrote zero errors since cutover; a bogus path returns 307 (no 500).

Pre-merge verification (isolated `_test` DB, seeded ADMIN): app `tsc` 0 · ESLint clean · Playwright **14/14** (6 new nav specs + 8 M1 regression) — desktop order, `aria-current` on `/seller-queue` and `/seller-queue/[id]`, keyboard activation, mobile drawer.

## Standing

- **Global Navigation Integration = RELEASED + verified.** The Commercial Real Estate Operating Workspace Milestone 1 is now implemented, accepted, released, **and discoverable** through the production UI.
- No milestone tag (consistent with the M1 baseline decision). Reference: release stamp `r1295187549721057-3330204` + `da69990`.
- Next: with the discoverability gap closed, the Commercial Workspace program can be officially closed; future work proceeds from this baseline under a new governed initiative (e.g. UI Milestone 2 Planning).

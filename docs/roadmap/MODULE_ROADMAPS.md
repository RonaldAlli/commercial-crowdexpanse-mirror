# Volume 4 — Module Roadmaps

> One roadmap per module. Format: **Current · Completed · Future · Dependencies · Known Issues · Testing · Future AI.**
> Status legend: ✅ Complete · 🟢 Good · 🟡 Partial · 🔴 Planned. Percentages are engineering-judgment estimates; the [Executive Dashboard](./EXECUTIVE_DASHBOARD.md) is the canonical status table.

---

## Authentication & Sessions — ✅
- **Current:** Cookie session (`ce_commercial_session`), `middleware.ts` gate, `lib/auth.ts` (`getCurrentUser`/`requireUser`/`requireRole`), `lib/password.ts` hashing.
- **Completed:** Login flow; session create/clear/read; demo creds retired from seed/env.
- **Future:** Password reset; session expiry/refresh policy; optional SSO; rate-limit login.
- **Dependencies:** Organization.
- **Known Issues:** No password reset; session lifetime policy undocumented ([Tech Debt](./TECHNICAL_DEBT.md)).
- **Testing:** Covered indirectly via team/invitation E2E. **Add:** direct auth unit/integration tests.
- **Future AI:** None (security-sensitive; keep deterministic).

## Organization & Multi-Tenancy — ✅
- **Current:** `organizationId` on every domain model; all queries org-scoped; cascade deletes.
- **Completed:** Scoping invariant enforced across modules; E2E assert org isolation per module.
- **Future:** Org settings; per-org configuration; usage/limits.
- **Dependencies:** none (root).
- **Known Issues:** Scoping enforced by convention, not a DB policy layer (RLS) — see [Tech Debt](./TECHNICAL_DEBT.md).
- **Testing:** Org-isolation asserted in every list E2E. Strong.
- **Future AI:** AI must inherit org scope (Volume 6 boundary).

## Seller Records — 🟢
- **Current:** CRUD; list with search/sort/pagination; detail with related properties/opportunities.
- **Completed:** Better Lists slice (search: name/company/email/city).
- **Future:** Owner Intelligence enrichment (1.2); source attribution; skip-trace/contactability (legal-gated); relation search.
- **Dependencies:** Organization; Better Lists.
- **Known Issues:** No source attribution field yet (needed for closings-per-source metric).
- **Testing:** `e2e-list.mjs` (search/sort/pagination/org-scope). Good.
- **Future AI:** Motivation scoring; conversation-extracted signals (2.0).

## Buyer Records — 🟢
- **Current:** CRUD; list with search/sort/pagination; asset-type/market/purchase-range fields.
- **Completed:** Better Lists slice (search: name/company/email).
- **Future:** Buyer Intelligence (appetite history, close reliability); relation search.
- **Dependencies:** Organization; Better Lists; Buyer Matching.
- **Known Issues:** Buyer criteria are static; no historical reliability signal.
- **Testing:** `e2e-buyers-list.mjs`. Good.
- **Future AI:** Match explanations; appetite inference (2.0).

## Property Records — 🟢
- **Current:** CRUD; list with search/sort/pagination; asset facts; seller relation.
- **Completed:** Better Lists slice (search: name/addressLine1/city/state).
- **Future:** Property Intelligence (1.2); relation search (seller name); import pipeline.
- **Dependencies:** Organization; Seller; Better Lists.
- **Known Issues:** Manual data entry only; no enrichment/import.
- **Testing:** `e2e-properties-list.mjs`. Good.
- **Future AI:** Document-extracted property facts (2.0).

## Opportunities & Pipeline — 🟢
- **Current:** 13-stage pipeline (`LEAD`→`PAID`); Board + List views; inline stage move; List search/sort/pagination.
- **Completed:** Board/List toggle; Better Lists on List view (search: title/summary/source); stage-advance on buyer-match confirm.
- **Future:** Board filtering; stage gating from Closing checklist (1.4); WIP limits; relation search.
- **Dependencies:** Property (required), Seller (optional), Buyer Matching, Deal Analyzer.
- **Known Issues:** Board shows all (no pagination — by design); no stage-transition guardrails yet.
- **Testing:** `e2e-opportunities-list.mjs`. Good.
- **Future AI:** Pipeline nudges; stall detection (2.0).

## Buyer Matching — ✅
- **Current:** Deterministic scorer (`lib/matching.ts`); org-wide matches view; per-opportunity matches; unique match constraint; confirm advances stage.
- **Completed:** Scorer, server actions, UI, `BuyerMatch` unique constraint, org-wide view.
- **Future:** Tunable weights; match analytics; buyer-reliability weighting.
- **Dependencies:** Buyers, Opportunities, Properties.
- **Known Issues:** Weights are fixed constants; no feedback loop from outcomes.
- **Testing:** `e2e-unique-match.mjs`. Good.
- **Future AI:** Natural-language match rationale; learned weights (2.0, with human override).

## Deal Analyzer / Underwriting — 🟡 (~35%)
- **Current:** `DealAnalysis` + pure `lib/analysis.ts` compute NOI, cap rate, DSCR, debt yield, price/unit; analyzer routes + edit.
- **Completed:** Core metric math; per-opportunity analysis record.
- **Future (1.3):** Line-item NOI, multi-year cash flow, debt scenarios, sensitivity tables, risk scoring, versioned models, offer-memo export.
- **Dependencies:** Opportunities, Property, Documents (T12/rent roll), 1.2 intelligence (inputs).
- **Known Issues:** Single-scenario; totals not line-items; no unit tests on the math yet.
- **Testing:** **Gap** — pure math must get unit tests (Testing Roadmap). E2E for the analyzer flow.
- **Future AI:** Underwriting narrative drafts; document extraction (2.0).

## Tasks — 🟢
- **Current:** List with search/sort/pagination; inline status; workflow-priority default order (`lib/task-sort.ts`); opportunity/owner links.
- **Completed:** Better Lists slice (search: title/description; sorts: workflow/due/newest/title).
- **Future:** Assignment notifications; recurring tasks; DD-checklist integration (1.4); relation search.
- **Dependencies:** Organization; Opportunities (optional); Users.
- **Known Issues:** Default order is in-memory (not DB-paginated) — documented tradeoff.
- **Testing:** `e2e-tasks-list.mjs` (incl. workflow-order + due-nulls-last). Good.
- **Future AI:** Task suggestions from conversation/stage (2.0).

## Notes — 🟢
- **Current:** CRUD; note-links (`lib/note-links.ts`) to records.
- **Completed:** Create/edit; linking.
- **Future:** Mentions/notifications; search integration depth; pinning.
- **Dependencies:** Organization; linked records.
- **Known Issues:** Limited discoverability from records.
- **Testing:** Covered via search E2E. **Add:** note-links unit tests.
- **Future AI:** Auto-summaries; extracted action items (2.0).

## Documents — 🟡 (~70%)
- **Current:** Upload via server action; typed (`T12`/`RENT_ROLL`/`LOI`/`CONTRACT`/…); download route; local storage with 25 MB cap + path-traversal guard (`lib/storage.ts`).
- **Completed:** Upload/list/download; type taxonomy.
- **Future:** Object storage (S3-class); virus scan; DD-checklist wiring (1.4); extraction (2.0).
- **Dependencies:** Organization; linked records; filesystem/`UPLOAD_DIR`.
- **Known Issues:** Local filesystem storage doesn't scale beyond one VPS — see [Tech Debt](./TECHNICAL_DEBT.md).
- **Testing:** **Gap** — add upload/download + path-guard tests.
- **Future AI:** T12/rent-roll parsing into underwriting inputs (2.0).

## Global Search — 🟢
- **Current:** Cross-record search (`lib/search.ts`) with per-group cap; `/search` page.
- **Completed:** Search across primary records, org-scoped.
- **Future:** Ranking; filters; keyboard-first UX; index as data grows.
- **Dependencies:** all searchable modules.
- **Known Issues:** Linear scan pattern; will need indexing at scale.
- **Testing:** `e2e-search.mjs` (coverage + group cap). Good.
- **Future AI:** Semantic search (2.0).

## Notifications & Activity — 🟢
- **Current:** Notification bell + unread feed; `ActivityLog`; `lib/notifications.ts` (unread count, recent, mark-all-read, cap).
- **Completed:** Bell + unread activity feed; activity page.
- **Future:** Preferences; email digest; deadline reminders for Closing (1.4).
- **Dependencies:** Organization; Users; source events.
- **Known Issues:** In-app only; no delivery channels.
- **Testing:** `e2e-notifications.mjs`. Good.
- **Future AI:** Smart prioritization (2.0).

## Team Management — 🟡 (~50%) {#team-management}
- **Current:** Roster; role assignment (`ADMIN`/`ACQUISITIONS`/`ANALYST`/`DISPOSITIONS`); last-admin protection (`lib/authz.ts`); `/settings/team` gated to ADMIN; role/invite actions now route through the permission layer (`MANAGE TEAM` / `MANAGE INVITATION`).
- **Completed:** Slice 1 — roster + role changes with guardrail; permission-layer enforcement on role and invitation actions.
- **Future (1.1):** Member deactivation/removal; org settings; broader audit of role changes; email delivery (Invitations).
- **Dependencies:** Auth, Organization, Invitations, [Permissions](#permissions).
- **Known Issues:** Member lifecycle (deactivate/remove) not yet built.
- **Testing:** `e2e-team-roles.mjs` (role-change rules) + `e2e-permissions.mjs` (MANAGE enforcement + audit).
- **Future AI:** None.

## Invitations — 🟡 (~55%) {#invitations}
- **Current:** Copy-link invitations; token hashing; accept flow; expiry logic; email-conflict handling (`lib/invitations.ts`).
- **Completed:** Create/accept/revoke; org scoping; audit entry.
- **Future (1.1):** Email delivery; resend; expiry UX; invite roles clarity.
- **Dependencies:** Auth, Team Management, (future) email transport.
- **Known Issues:** No email delivery — link must be shared manually.
- **Testing:** `e2e-invitations.mjs` (create/accept/revoke/scope/audit). Strong.
- **Future AI:** None.

## Permissions (cross-cutting) — 🟢 (~90%) {#permissions}
- **Principles:** the five non-negotiable rules live in the EMP → [Authorization Principles](./ENGINEERING_MASTER_PLAN.md#authorization-principles). Read them before adding any write action.
- **Current:** Single-source policy in `lib/permissions.ts` — a pure, unit-testable matrix of `can(role, action, resource)` plus segment-based `canMoveStage(role, current, target)`. Server enforcement + best-effort audit in `lib/authorize.ts` (`authorize`/`checkAuthorized`/`authorizeStageMove`), writing an `authorization.denied` ActivityLog row (role/resource/action/target) on every denial. Users only ever see one generic message.
- **Completed (Slice 1 — high-risk ops):** deletes on all record types route through `authorize()` (uniform audit, even where every role is allowed); pipeline stage movement enforced by BOTH current and target stage (ACQUISITIONS own LEAD…UNDER_CONTRACT, DISPOSITIONS own UNDER_CONTRACT…PAID, ADMIN any incl. backward, ANALYST none); team-role and invitation actions gated by `MANAGE`.
- **Completed (Slice 2 — create/update + surfaces):** ordinary create/update enforced across every write action (sellers, properties, opportunities, buyers, deal analysis, buyer-match generation/status, tasks/notes/documents for uniform audit); an opportunity edit that changes `stage` is rejected in full if the move isn't allowed (stage is the one field-level rule — no `canEditField`); create/edit UI entry points hidden and `/new` + `/[id]/edit` routes guarded with `can()` + `notFound()` (no audit on page loads); ADMIN-only read-only **Access denials** report at `/settings/security` (actor/role/resource/action/target/timestamp + counts by user and resource·action, from existing `ActivityLog`).
- **Future (1.2+):** field-level financial permissions if a business need appears; RLS (D2) as a backstop; denial thresholds/alerting (deferred, edges into 2.0).
- **Dependencies:** Auth, Organization; consumed by every write-bearing module.
- **Known Issues:** Audit is intentionally best-effort (a logging failure never blocks a denial); no field-level permissions beyond opportunity stage (by decision).
- **Testing:** `e2e-permissions.mjs` — pure truth table for `can`/`canMoveStage` (incl. the seven required pipeline cases) + DB-backed enforcement/audit/org-scoping (create/update, edit-path stage denial, submit-only audit invariant) against the `_test` DB.
- **Future AI:** None (keep authorization deterministic).

## Better Lists (cross-cutting) — 🟢 {#better-lists}
- **Current:** Shared `lib/list-params.ts` (page size 20, min query 2, sort whitelist, current-order default) powering Sellers, Buyers, Properties, Opportunities-List, Tasks.
- **Completed:** All five core lists.
- **Future:** Relation search; extra sorts (e.g. asking-price); saved views/column controls; board-view filtering.
- **Dependencies:** each list module.
- **Known Issues:** Scalar-field search only; no relation search yet.
- **Testing:** One focused E2E per list; shared param tests. Strong.
- **Future AI:** Natural-language list queries (2.0).

## Testing & CI (cross-cutting) — ✅
- **Current:** 11 E2E scripts; dedicated `_test` DB + no-override guard; runner; setup/reset/sweep tooling; GitHub Actions CI with ephemeral Postgres.
- **Completed:** Slices 1–3.
- **Future:** Unit tests for pure `lib/*`; lint in CI; perf/load/security/DR (Testing Roadmap); Gitea Actions decision.
- **Dependencies:** all modules.
- **Known Issues:** No unit layer yet; CI on mirror only.
- **Testing:** self-covering (`npm test`, `test:ci`).
- **Future AI:** None (keep the safety layer deterministic).

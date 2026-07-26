# Runbook — Workspace AI Copilot (operation)

Operational reference for deploying, checking, disabling, and troubleshooting the
read-only AI Copilot (`/acquire`). Not architecture or governance — see
`docs/architecture/AI_COPILOT_UI_STATE.md` and the Phase-1 validation report for those.

**Design guarantees that shape operations:** the Copilot is **inert until configured**
(fail-closed) and **isolated on failure** (an AI slowdown/outage stays inside the pane;
the workspace keeps working). It is **read-only** — it never sends messages or mutates
records. So the safe operational default is simply *not configured*.

---

## Prerequisites
- App deployed via the D25 engine (`scripts/deploy/deploy.mjs`), pm2 process
  `crowdexpanse-commercial`, Node.js runtime (the route pins `runtime = "nodejs"` — the
  Anthropic SDK is Node-only).
- Dependency `@anthropic-ai/sdk` present (in `package.json`; installed on build).
- An Anthropic API key with access to the approved model(s).

## Environment variables
Set in the host's **protected secret/config store** (never on a command line, in logs,
or in a transcript). All three are required; with any missing/empty the Copilot stays
inert.

| Variable | Purpose | Secret? |
|---|---|---|
| `ANTHROPIC_API_KEY` | Provider credential | **Yes — never print** |
| `AI_COPILOT_MODEL` | The model the Copilot uses | No (model id) |
| `AI_COPILOT_APPROVED_MODELS` | Comma-separated allowlist; `AI_COPILOT_MODEL` must appear here **exactly** | No |
| `AI_COPILOT_REQUEST_TIMEOUT_MS` | **Optional.** Upstream request timeout in ms so a hung/slow API can't hold a request open. Positive integer; invalid/unset → built-in default (60000) | No |

Confirm configuration without revealing the key — prefer the read-only diagnostic,
which reads through the same config layer the app uses and never prints the key value:
```sh
node --env-file-if-exists=.env --import tsx scripts/diag/ai-copilot-config.mjs
```
Or, without tsx, confirm mere existence:
```sh
[ -n "${ANTHROPIC_API_KEY:-}" ] && echo "key: present" || echo "key: MISSING"
echo "model: ${AI_COPILOT_MODEL:-MISSING}"
echo "approved: ${AI_COPILOT_APPROVED_MODELS:-MISSING}"
```
Env is read at process start — after any change, restart: `pm2 restart crowdexpanse-commercial`.

## Health check
The unauthenticated liveness probe `GET /api/health` includes a non-sensitive `ai`
block — `{ configured, reason }` — computed SDK-free from the same config layer (it
never contains the key). Use it to confirm at a glance whether the Copilot will
activate; it does **not** affect the endpoint's overall `status` (the Copilot is never
a liveness dependency). Per-request AI usage telemetry remains deferred. Verify in this
order:
1. **Config present** — `GET /api/health` shows `ai.configured: true` (or the three
   vars exist and the model is in the approved list).
2. **Inert check (safe)** — with the vars unset, load `/acquire`: the pane shows
   “AI Copilot not configured” and the workspace is fully usable. This confirms
   fail-closed behavior.
3. **Live check** — with the vars set and the app restarted, open `/acquire?sellerId=<a
   seller in your org>` as an authenticated operator, open the pane, and ask
   “Summarize this seller.” Tokens should **stream** and a **Sources** panel should
   appear. Restricted fields (phone/email) are masked and internal notes excluded
   *inside the model prompt* — that boundary is proven by the automated E2E
   (`scripts/e2e-ai-copilot.mjs`), not observable in the browser.

## Rollout
- Deploy from the intended branch via D25 (validation host first; production only after
  a signed validation report + merge):
```sh
node scripts/deploy/deploy.mjs --dry-run --app-dir <APP_DIR>            # validate build
node scripts/deploy/deploy.mjs --app-dir <APP_DIR> --production --yes    # sentinel-marked prod
```
- Set/confirm the env vars, then `pm2 restart crowdexpanse-commercial`.

## Baseline tag governance (why these tags are special)
The `workspace-ai-platform-phase1-ready*` tags are **engineering baselines**, not
ordinary release tags. Each marks an immutable, fully-gated launch candidate that every
future AI capability is expected to build from. They are governed by three complementary
safeguards — keep all three:
1. **Engineering discipline** — a baseline tag is never moved, deleted, or reused. If
   validation finds a defect, apply a narrowly-scoped fix on the branch, re-gate, and cut
   a **new** follow-up baseline (`…-ready.1`, `.2`, …) on the corrected commit. Features
   and redesign never touch a baseline line; they wait for the next phase.
2. **Git history** — baselines are **annotated** tags, so each carries its own record
   (status, gate results, verified invariants) and is a stable point to diff against.
3. **Repository governance** — the `workspace-ai-platform-phase1-ready*` pattern should be
   a **protected tag** in Gitea (Settings → Tags → Protected Tags), with creation/
   modification limited to repository administrators. This prevents an accidental
   `push --delete` or force-retag from destroying a baseline. This is a repo-admin action
   (it cannot be set over SSH git) and is intentionally performed by someone with
   administration authority, not implicitly through Git operations.

**Classification — advisory, not a deployment gate.** Protected Git tags are a
repository-governance safeguard that preserves release history. They are **recommended**
for multi-developer environments but are **not required for application security or
runtime correctness**, and they are **not a production-deployment prerequisite**. The
release dashboard shows tag protection as `RECOMMENDED` (advisory), never as a blocker;
`productionDeployAllowed()` excludes it from the deployment decision.

Ordinary release tags (e.g. `v1.4.0`) are not subject to this policy; it applies
specifically to the AI-platform baseline line.

## Isolated validation environment (reproducible)
A dedicated, throwaway validation instance can be stood up **without** touching prod or staging
(executed 2026-07-25; evidence in `docs/releases/phase1-validation-evidence/`, full account in the
Phase-1 Validation Report Addendum A):
1. `git worktree add --detach /opt/crowdexpanse/validation-ai-phase1 <baseline-commit>` — isolate the code.
2. `npm ci` in the worktree (own `node_modules`).
3. Isolated `.env`: `DATABASE_URL` = test DB with a **dedicated schema** (`...commercial_crowdexpanse_test?schema=aival`
   — used because the app DB role lacks `CREATE DATABASE`; still isolated from the E2E `public` schema),
   a throwaway `SESSION_SECRET`/admin, `UPLOAD_DIR`, and **no AI vars** (so it runs inert). Never put real
   secrets here.
4. `npx prisma migrate deploy` + `npx prisma generate` + `npx tsx prisma/seed.ts`, then `npm run build`.
5. Start on a free localhost port via a PM2 config with a **distinct name** (e.g.
   `crowdexpanse-ai-phase1-validation`, `-p 3055 -H 127.0.0.1`) and its own log files.
6. Verify: `curl 127.0.0.1:3055/api/health` shows `ai.configured:false`; the AI route returns `{configured:false}`
   when authenticated and `307 → /login` when not. Fail-closed variants and the automated suite are runnable here.
- **Teardown:** `pm2 delete <name>` → `git worktree remove <dir> --force` → optionally `DROP SCHEMA aival CASCADE;`.

## Disable AI safely (kill switch — no deploy)
The fastest, safest way to turn the Copilot off:
1. Remove or blank **`ANTHROPIC_API_KEY`** (or `AI_COPILOT_MODEL`) in the secret store.
2. `pm2 restart crowdexpanse-commercial`.

The provider immediately reports not-configured, the pane shows the inert state, and no
API calls are made. The workspace is unaffected. (No code change or redeploy needed.)

## Rollback
- Code rollback: `node scripts/deploy/deploy.mjs --recover --app-dir <APP_DIR> ...` (D26
  recovery), or redeploy the previous release. The engine keeps prior releases + a
  restore-verified backup.
- If only the Copilot is misbehaving, prefer the **kill switch** above over a full
  rollback — it disables AI without touching the rest of the app.

## Common failures
| Symptom | Likely cause | Action |
|---|---|---|
| Pane: “AI Copilot not configured” | A var missing/empty, or model not in the approved list | Confirm all three vars; ensure `AI_COPILOT_MODEL` is in `AI_COPILOT_APPROVED_MODELS` exactly; restart |
| Answer errors / “Request failed” in the pane | Invalid/expired key (401), rate limit (429), or Anthropic outage (5xx) | Check the key; check Anthropic status; the error is isolated — operator can **Retry**. Use the kill switch if persistent |
| Pane: “That seller isn't available” (404) | Seller not in the user's org, or bad `sellerId` | Expected security behavior (cross-org → 404); verify the seller id/org |
| Output appears delayed / non-streaming | A proxy is buffering the response | The route sets `X-Accel-Buffering: no`; ensure nginx/any proxy honors it and isn't buffering `text/plain` |
| “Copy” does nothing | Clipboard API needs a secure (HTTPS) context | Use HTTPS; **Insert** still works regardless |
| Workspace itself broken when AI is down | Should not happen — failures are pane-isolated | Treat as a real defect; capture repro and roll back / kill-switch |

## Where logs are
- App logs: `pm2 logs crowdexpanse-commercial` (route errors surface here as 500s).
- The Copilot route does **not** emit per-request structured logs (metadata audit
  logging is deferred to a later slice). Client-visible errors appear inline in the pane.

## Notes
- The internal-pilot **privacy policy** (mask phone/email, exclude internal notes; allow
  owner names + message bodies) is enforced in code (`lib/ai/context/policy.ts`).
  Changing it is a **code change + deploy**, not an env toggle.
- Restricting to specific users, rate limiting, per-request audit logging, and
  organization-level AI policy are **not** in this release — deferred to a later slice.

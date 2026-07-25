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

Confirm existence without revealing the key:
```sh
[ -n "${ANTHROPIC_API_KEY:-}" ] && echo "key: present" || echo "key: MISSING"
echo "model: ${AI_COPILOT_MODEL:-MISSING}"
echo "approved: ${AI_COPILOT_APPROVED_MODELS:-MISSING}"
```
Env is read at process start — after any change, restart: `pm2 restart crowdexpanse-commercial`.

## Health check
There is no dedicated AI health endpoint (per-request AI logging/telemetry is deferred).
Verify in this order:
1. **Config present** — the three vars exist (above) and the model is in the approved list.
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

# Workspace AI Platform – Phase 1 — AI Governance Approval (Live-Provider Authorization)

> **Status: PENDING — awaiting authorizing signature.** This is a decision-ready form, not an
> approval. Engineering has populated every verified technical fact below; the **Approval** section is
> deliberately blank. No one's approval is asserted or implied. Live provider traffic (sending workspace
> data to Anthropic) must **not** be enabled until this is signed and the approved values are provisioned
> through the secret store.
>
> This authorization is distinct from — and does **not** substitute for — the already-signed *field
> masking policy*. Masking governs *how* data is shaped before it leaves; this form authorizes *whether*
> live traffic may occur at all, under which account, model, and retention terms.

## 1. Scope (proposed — confirm or amend)
- **Deployment scope:** Internal pilot only. Read-only + drafting Copilot in the Acquisition Workspace.
- **No action-taking:** the Copilot cannot send, mutate, dispose, schedule, or create — recommend only
  (verified: zero mutating Prisma writes in `lib/ai/` + `app/api/ai/`; cross-org subject → 404).

## 2. Data that would reach Anthropic (verified — enforced in code)
Enforced at the render boundary by `PILOT_AI_POLICY` (`lib/ai/context/policy.ts`), proven end-to-end by
`scripts/e2e-ai-copilot.mjs` (14/14):

| Field | Policy | Reaches Anthropic? |
|---|---|---|
| Phone number | **mask** | No (`[redacted]`) |
| Email address | **mask** | No (`[redacted]`) |
| Internal notes / touch summaries | **exclude** | No |
| Seller name / company | allow | Yes |
| Owner name | allow | Yes |
| Property / motivation / source / status / metrics / timeline | allow | Yes |
| SMS bodies / email bodies | allow | Yes |

Context is bounded (recent-timeline window, single last-message per channel, truncated bodies), so
payload size and content are predictable.

## 3. Technical safeguards (verified live in the isolated validation environment)
- **Inert until fully configured** (fail-closed): requires `ANTHROPIC_API_KEY` + `AI_COPILOT_MODEL` +
  `AI_COPILOT_APPROVED_MODELS` with the model **in** the allowlist; otherwise no API call is made
  (verified: missing key **and** invalid-model both → `ai.configured=false`).
- **Model + vendor are configuration, not code** — no model name is hard-coded.
- **Runtime isolation:** failures confined to the Copilot pane; upstream cancelled on disconnect;
  bounded request timeout (`AI_COPILOT_REQUEST_TIMEOUT_MS`, default 60s) + capped retries.
- **Kill switch:** unset `ANTHROPIC_API_KEY` + restart → inert, no deploy (verified).

## 4. Approval — TO BE COMPLETED BY THE AUTHORIZING PARTY (all fields PENDING)
Do not fill on anyone's behalf.

| Field | Value |
|---|---|
| Internal pilot scope confirmed | ☐ PENDING |
| Data-to-Anthropic set approved (as §2, or amended) | ☐ PENDING |
| Masking/exclusion policy confirmed | ☐ PENDING |
| **Zero Data Retention (ZDR)** status (enabled / not available / accepted-without) | ☐ PENDING |
| Authorized Anthropic **account / workspace / organization** | ☐ PENDING |
| Approved **model** ID (goes to `AI_COPILOT_MODEL`) | ☐ PENDING |
| Approved-model **allowlist** (goes to `AI_COPILOT_APPROVED_MODELS`) | ☐ PENDING |
| Approving authority (name / role) | ☐ PENDING |
| Approval date | ☐ PENDING |
| Signature / authorization reference | ☐ PENDING |

## 5. On approval — provisioning (operations)
Provision the approved values through the secret store **only** (never Git / tracked `.env` / logs /
chat). For the isolated validation instance, add them to `/opt/crowdexpanse/validation-ai-phase1/.env`
(mode 600, untracked) and restart **only** `crowdexpanse-ai-phase1-validation`; confirm via
`GET /api/health` → `ai.configured=true` and `scripts/diag/ai-copilot-config.mjs` (never prints the key).
For production, provision via the same store used by the Comms encryption key and restart the prod
process — a separate release-authority decision (see the Validation Report).

_Once signed, record this file's path (and the approved account/model, not the key) in
`docs/releases/PHASE1_VALIDATION_REPORT.md`._

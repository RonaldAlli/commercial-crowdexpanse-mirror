# Workspace AI Platform – Phase 1 — Validation Report

> **Final recommendation: Approved with documented non-blocking items (engineering scope) — MERGE/PROD still BLOCKED on owner actions.**
> **Updated 2026-07-25 (Addendum A):** a dedicated **isolated validation environment was built and
> the immutable baseline `4948b87` deployed to it**, and **all engineering-executable validation
> passed** — build, migrations, boot/health (with the live `ai` block), authenticated + unauthenticated
> AI route, live fail-closed (missing key **and** invalid model), kill-switch/rollback, and the full
> automated suite (typecheck, lint, unit, AI E2E 14/14, **all 62 E2E scripts**). **No engineering
> defect was found.** What remains is **not** engineering: human browser checklist, governance
> (PII/ZDR/account/approved-model), provisioned production secrets, and repo-admin tag protection.
> Do **not** merge or deploy to production until those owner actions are complete. See **Addendum A**.
>
> _(Original 2026-07-25 recommendation, pre-environment: BLOCKED — no validation environment was
> available. That specific blocker is now resolved; the remaining blockers below are unchanged.)_

## Header

| Field | Value |
|---|---|
| Validation date | 2026-07-25 |
| Executed by | Engineering agent (automated + host inspection). **No human operator executed the browser checklist in a deployed environment** — see Blockers. |
| Environment / host | `crowdexpanse-hub` (this is the **production host**; it also hosts a staging instance) |
| Branch | `feat/ai-copilot-slice-1` |
| Immutable baseline tag | `workspace-ai-platform-phase1-ready` → `4948b87` (verified unmoved) |
| Deployed commit (validation) | **none** — validation deploy not performed (blocked; see Step 5) |
| Documentation head | `bbe050a` (docs-only above the baseline) |
| Build / deployment identifier | n/a — no validation deployment produced |
| AI configuration result | Not configured anywhere (fail-closed reporting verified); no secrets provisioned |
| Governance approval status | **Blocked for live traffic** — no committed operational sign-off found |

## Executed steps & results

### 1. Repository integrity — ✅ VERIFIED
- HEAD `bbe050a`; at/beyond `bbe050a`.
- Baseline tag resolves to `4948b87` on both local and Gitea server — **immutable, unmoved**.
- Only two commits since baseline (`a5064cd`, `bbe050a`), touching **docs files only**
  (`docs/releases/PHASE1_OPERATOR_VALIDATION_CHECKLIST.md`, `docs/runbooks/AI_COPILOT_OPERATION.md`).
  `git diff --stat 4948b87..HEAD -- ':!docs'` is empty → **no code drift from the baseline**.
- Remote in sync (ahead=0, behind=0). Working tree clean except untracked `.next*` build artifacts.

### 2. Baseline-tag protection — ⛔ BLOCKED (no authorization)
- No provisioned repo-admin API credential exists in the environment: no token env vars, no
  `.netrc`, no `tea` CLI/config, no git-credentials, no HTTP credential helper; the git remote
  is SSH-only. The local `gitea` server binary is present but using it to force protection is a
  privileged server-admin action, **not** the "existing provisioned repo-admin credential" the
  procedure permits — not escalated.
- **Action required (repo admin):** in Gitea, protect tag pattern `workspace-ai-platform-phase1-ready*`,
  restricting create/modify/delete to administrators. Policy is documented in the runbook
  ("Baseline tag governance"). Protection rule was **not** weakened.

### 3. AI configuration inspection — ✅ EXECUTED (fail-closed confirmed)
- `node --import tsx scripts/diag/ai-copilot-config.mjs` runs correctly and reports
  `configured: false (missing API key)` for the current environment — **fail-closed reporting works**.
  (The plain-`node` invocation fails on the `.ts` import; the `tsx` form in the runbook is correct.)
- Health (read-only GETs): prod `127.0.0.1:3030/api/health` and staging `127.0.0.1:3040/api/health`
  both return `{"status":"ok",...}` with **no `ai` block** — because the AI-baseline code
  (which adds `ai:{configured,reason}`) is deployed on **neither** instance. Prod predates the AI
  branch; staging runs `bfd9fd9` (a different initiative — see Step 5).
- **No AI secrets are provisioned**, and no authorized model/account/key values were available.
  None were invented, written, or logged. Secrets were **not** configured (nothing authorized to configure).

### 4. Governance authorization — ⛔ BLOCKED for live traffic
- Repo search found governance/sign-off records for other initiatives (opportunity-pipeline,
  commercial-intelligence, automation v2.0) but **no committed operational record** for the AI
  copilot covering: PII→Anthropic transmission, ZDR decision, authorized Anthropic account/workspace,
  approved model value, or approved pilot scope as an operational authorization to send real data.
- Project memory records the **PII masking policy** was signed "Approved with Restrictions (internal
  pilot)" — a real prior decision — but the **operational prerequisites to enable real provider
  traffic are absent** (no committed ZDR/account/model record; no provisioned secrets). Approval was
  **not** manufactured. → Real provider traffic must **not** be enabled.

### 5. Deploy immutable candidate to validation — ⛔ BLOCKED (validation environment occupied)
- The staging/validation instance `crowdexpanse-commercial-staging`
  (`/opt/crowdexpanse/staging-commercial`, `next start -p 3040 -H 127.0.0.1`) is **currently running
  `bfd9fd9`** — a build from a **different active initiative** (`stabilize/opportunity-pipeline-slice1`,
  3 days uptime). Deploying the AI baseline over it would **overwrite another initiative's in-flight
  validation** — a shared-resource conflict that must not be resolved unilaterally.
- No alternative validation host was fabricated (out of scope). Deploy **not performed**.
- (Even absent the conflict, a live-traffic validation is moot without Step 3 secrets + Step 4 governance.)

### 6. Full operator checklist — ⛔ NOT EXECUTABLE (no deployed validation env + no live AI)
- The checklist's operational sections (configuration, workspace reflow, persisted state, cockpit
  transition, shortcut generation, free-form questions, streaming/no-duplication, sources/dedup,
  privacy behavior in-browser, draft insert/append/copy-fallback, failure isolation, timeout/retry,
  performance) require a deployed validation environment **with AI enabled** and a **human operator in
  a browser**. Blocked by Steps 4 and 5.
- **Automated evidence available at the baseline** (not a substitute for live browser validation, but
  it does back the security/read-only/privacy invariants):
  - Typecheck: **0** source errors.
  - Unit: **PASS** (101 files, critical branch ≥90%, overall branch 93%).
  - Vertical E2E `scripts/e2e-ai-copilot.mjs`: **PASS 14/14** — including cross-org subject → 404,
    read-only path, and prompt-boundary privacy (phone/email masked, internal notes excluded).
  - D25 authoritative build: verified green (dry-run) earlier this session at this identical tree.

### 7. Defect classification — none (no live validation performed)
- No live-validation defects were found because live validation could not run. The automated gates
  reveal no defect. The blocks are authorization/environment, not software.

### 8. This report — produced (docs-only).

### 9. Merge & production deployment — ⛔ NOT AUTHORIZED
- Gating conditions are unmet: blocking checklist items not validated; PII/ZDR live-traffic
  authorization absent; secrets not provisioned; validation report does **not** authorize release;
  and deploying to the sentinel-marked production instance is outside permitted actions. **No merge,
  no production deploy performed.**

### 10. Rollback — N/A
- No live AI traffic was enabled, so there is nothing to roll back. The documented kill switch
  (unset `ANTHROPIC_API_KEY` + `pm2 restart crowdexpanse-commercial`) remains available.

## Blockers (all require the repository owner / operator — not engineering)

1. **Repo-admin authorization** to protect the `workspace-ai-platform-phase1-ready*` tag family.
2. **Governance sign-off (committed):** PII→Anthropic + ZDR decision + authorized Anthropic
   account/workspace + approved model value + pilot scope, as an operational authorization for live traffic.
3. **AI secrets provisioning** via the approved secret store (never chat/logs/git):
   `ANTHROPIC_API_KEY`, `AI_COPILOT_MODEL`, `AI_COPILOT_APPROVED_MODELS` (+ optional
   `AI_COPILOT_REQUEST_TIMEOUT_MS`) — using only authorized model/approved-list values.
4. **An available validation environment:** the staging instance is occupied by another initiative
   (`bfd9fd9`); a free window or a dedicated validation target is needed before deploying `4948b87`.
5. **A human operator** to execute the browser checklist and capture evidence.

## What is confirmed ready (engineering)
- Immutable baseline `4948b87` with green gates; read-only/privacy/security invariants proven by
  automated E2E; fail-closed configuration reporting verified live; operational docs + runbook +
  operator checklist in place. Engineering is complete and frozen; nothing above is an engineering gap.

---

## Addendum A — Isolated validation environment: BUILT & EXECUTED (2026-07-25)

Blocker #4 (no available validation environment) was resolved by **building a dedicated, isolated
environment** rather than disturbing the occupied staging instance. Evidence archived under
`docs/releases/phase1-validation-evidence/`.

### Environment (isolated — prod & staging untouched)
| Property | Value |
|---|---|
| Host | `crowdexpanse-hub` (localhost-bound) |
| PM2 process | `crowdexpanse-ai-phase1-validation` (id 19) — separate from prod (id 3) & staging (id 5) |
| Port | `127.0.0.1:3055` |
| Directory | `/opt/crowdexpanse/validation-ai-phase1` (git **worktree**, detached at the baseline) |
| Deployed commit | **`4948b87`** (== tag `workspace-ai-platform-phase1-ready`; verified) |
| Build ID | `iY-enY7AtTTeT8O4QEilf` |
| Database | `commercial_crowdexpanse_test` **schema `aival`** (dedicated schema — role lacks CREATE DATABASE; isolated from E2E's `public`), **36 migrations applied** |
| AI config | **intentionally absent → inert/fail-closed** (no secrets provisioned or fabricated) |
| Logs | `/opt/crowdexpanse/validation-ai-phase1/logs/{out,err}.log` |

### Results (all executed against the deployed baseline)
- **Build:** ✅ compiled + typechecked + linted clean; AI route + health route present in the build.
- **Migrations:** ✅ 36 applied to `aival`; seed created a validation admin (throwaway creds).
- **Health (live):** ✅ `200` with the `ai` block — `{"configured":false,"reason":"...missing API key"}`, `dbMs≈4ms`.
- **AI route (live):**
  - unauthenticated → **307 → /login** (auth enforced before any logic);
  - authenticated + inert → **200 `{configured:false}`** (fail-closed; no stream, no API call);
  - oversized input while inert → short-circuits to `{configured:false}` (no processing when inert).
- **Fail-closed variants (live):** missing key → `configured:false`; **invalid model (not in approved
  list)** → `configured:false` with the approved-list reason (**provably no API call**). Fixtures were
  obvious placeholders, then removed.
- **Rollback / kill switch (live):** removing AI vars + `pm2 restart` returned the instance to clean
  inert; PM2 restart recovery confirmed (status online).
- **Automated suite (baseline worktree):** typecheck **0 errors**; lint **clean**; unit **PASS**
  (101 files, branch 93%); AI E2E **14/14** (privacy: phone/email masked, notes excluded; read-only;
  cross-org → 404; abort-signal forwarding); full integration **all 62 E2E scripts passed**.
- **Performance (measured):** startup (restart→health 200) ≈ **1.7 s**; steady-state health ≈ **9–14 ms**;
  inert AI route ≈ 100 ms. **Model-dependent metrics (first-token, total generation, live cancellation,
  live timeout) are BLOCKED** — they need an authorized provider; they are covered by the unit test
  (timeout accessor) and E2E (abort-signal forwarding).

### Still blocked (owner/operator — unchanged)
1. Repo-admin tag protection (`workspace-ai-platform-phase1-ready*`).
2. Governance sign-off for live traffic (PII/ZDR/account/approved-model value).
3. Provisioned AI secrets via the approved store (authorized values only).
4. Human operator to run the **browser** checklist (Sections C/E/F visual behavior) with the above enabled.
5. Release authority to approve merge + production deployment.

**Net:** every engineering-executable item is now **done and green** against the real deployed baseline.
The remaining items cannot be honestly completed by engineering — they require credentials, an
organizational approval, or a human at a browser.

### Teardown note
The validation instance is transient. To remove it:
`pm2 delete crowdexpanse-ai-phase1-validation`, then
`git worktree remove /opt/crowdexpanse/validation-ai-phase1 --force`, and optionally
`DROP SCHEMA aival CASCADE;` in the test DB. It touches no production or staging resource.

---

## Addendum B — Credential/approval search + browser pass (2026-07-25)

### Authorized-source search (Step 1) — reported present/absent, no values printed
| Item | Result | Authorized source |
|---|---|---|
| Gitea repo-admin token / `tea` config | **ABSENT** (env, `~/.config/tea`, `~/.netrc`, `~/.git-credentials`) | none provisioned |
| Anthropic API key (for this pilot) | **ABSENT** | none provisioned |
| Approved model / allowlist (this pilot) | **ABSENT** | none provisioned |
| Governance / ZDR / Anthropic account record | **ABSENT** | none (only this report referenced) |
| Secret-store tooling (vault/sops/age/pass/doppler) | **ABSENT** | none installed |
| Release / deployment authorization | **ABSENT** | none |

> Note: an `ANTHROPIC_API_KEY` name exists in a **different application's** env
> (`/opt/crowdexpanse/dealflow/.env`). It is **not authorized** for the Commercial copilot pilot (separate
> product/account, no governance record, no ZDR/PII decision tying it here). Repurposing it would
> manufacture the missing authorization, so it was **not** used.

### Tag protection (Step 2) — **ADVISORY (RECOMMENDED), not a deployment gate.**
Protected Git tags are a repository-governance safeguard that preserves release history.
They are recommended for multi-developer environments but are **not required for
application security or runtime correctness**, and do **not** block production deployment.
Still verified (configured / not configured / unable-to-verify) and queried against Gitea
only when a repo-admin token is present; currently not configured (no `GITEA_ADMIN_TOKEN`).
The dashboard shows it as `RECOMMENDED`, separate from the mandatory gates.

### Governance (Step 3) — no live-traffic approval exists. A **decision-ready form** was created:
`docs/releases/PHASE1_AI_GOVERNANCE_APPROVAL.md` — verified technical facts populated, all approval
fields left **PENDING**, unsigned. This is separate from the already-signed masking policy.

### AI configuration (Step 4) — **BLOCKED** (no authorized values). Instance remains inert/fail-closed.

### Browser validation (Step 5) — **PARTIAL: all non-AI-dependent sections PASS in a real browser**
Playwright 1.61.1 (chromium) driving the deployed instance at `127.0.0.1:3055`, authenticated via a
minted session cookie, against an isolated `aival` seller fixture. **9/9 automatable checks passed**
(evidence + screenshots in `docs/releases/phase1-validation-evidence/browser/`):

| Section | Result |
|---|---|
| Workspace loads authenticated (no /login redirect) | ✅ |
| Copilot open / collapse | ✅ |
| Own reflowing column — **main 1136→800px when open** | ✅ |
| Open-state persistence across reload (localStorage) | ✅ |
| Collapse returns the space | ✅ |
| Inert "not configured yet" state shown (fail-closed UI) | ✅ |
| Composer disabled while inert | ✅ |
| No browser console errors | ✅ |

**Blocked (require configured AI + governance):** summary / call-prep / SMS + email draft / free-form /
streaming / no-duplication / source display + dedup (visual) / phone-email masking in output /
internal-note exclusion (visual) / copy / insert-empty / append / no-composer fallback / retry /
live cancellation / live timeout / provider-error isolation. These cannot run while inert. Note: the
underlying invariants are already **proven by automated tests** (privacy masking, read-only, cross-org
404, abort-signal — AI E2E 14/14); what remains genuinely unautomatable-without-a-key is the *visible
browser* confirmation of the generation-path UI.

### Live-provider validation (Step 6) — **BLOCKED** (no authorized key). Covered structurally by unit + E2E.

### Defects — **none** (no defect found in any executed check).

### Final merge recommendation (updated)
**Approved — engineering & automatable-validation scope (no defects).** **Merge/production remain
BLOCKED** on the exact, genuinely-unavailable items below — each is a specific credential, approval, or
human/authority action, not further engineering:
1. **Repo-admin credential** → enable protected tag `workspace-ai-platform-phase1-ready*`.
2. **Signed governance** (`PHASE1_AI_GOVERNANCE_APPROVAL.md`): ZDR + authorized Anthropic account +
   approved model/allowlist + approving authority.
3. **Provisioned AI secrets** (approved values via the secret store).
4. **The AI-dependent browser sections + live-provider tests**, which unlock automatically once (2)+(3)
   are in place — re-run the same tooling; no new engineering.
5. **Release authority** for merge + production D25 deploy to the sentinel-confirmed instance.

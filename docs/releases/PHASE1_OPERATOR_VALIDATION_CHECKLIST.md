# Workspace AI Platform – Phase 1
## Operator Validation Checklist (Version 1.0)

**Purpose:** Validate the production-ready AI platform in a non-production environment before authorizing merge and deployment.

- **Branch:** `feat/ai-copilot-slice-1`
- **Engineering Baseline Tag:** `workspace-ai-platform-phase1-ready`
- **Current Baseline Commit:** `4948b87`

> This checklist is intentionally limited to operational validation. Any failed item that
> indicates a software defect should result in a narrowly scoped fix on the feature branch,
> followed by the established re-gating process before re-validation — and a **new** follow-up
> tag (`workspace-ai-platform-phase1-ready.1`, `.2`, …) on the corrected baseline. The original
> tag is never moved.

---

## Section A — Environment

| Item | Result |
|---|---|
| Validation environment available | ☐ |
| Correct branch deployed | ☐ |
| Build successful | ☐ |
| Health endpoint healthy | ☐ |

Record:

- Environment: __________________________
- Host: _________________________________
- Date: _________________________________
- Operator: _____________________________

## Section B — AI Configuration

Confirm without exposing secrets. (Tip: `node --env-file-if-exists=.env --import tsx scripts/diag/ai-copilot-config.mjs` reports each of these via the same config layer the app uses and never prints the key.)

| Check | Pass |
|---|---|
| `ANTHROPIC_API_KEY` present | ☐ |
| `AI_COPILOT_MODEL` configured | ☐ |
| `AI_COPILOT_APPROVED_MODELS` configured | ☐ |
| Model exists in approved list | ☐ |
| AI health reports `configured=true` (`GET /api/health` → `ai.configured`) | ☐ |

## Section C — Workspace Behavior

Open: `/acquire?sellerId=<valid seller>`

| Check | Pass |
|---|---|
| Copilot rail opens | ☐ |
| Copilot collapses | ☐ |
| Width persists after refresh | ☐ |
| Workspace reflows correctly | ☐ |
| Pane never overlays operator UI | ☐ |
| Scroll regions remain independent | ☐ |
| Cockpit mode transition works | ☐ |
| State survives cockpit transition | ☐ |

## Section D — AI Generation

Ask: Summarize seller · Prepare for call · Draft SMS · Draft Email · Free-form question

| Check | Pass |
|---|---|
| Streaming begins | ☐ |
| Streaming completes | ☐ |
| No duplicated output | ☐ |
| Responses are grounded in seller context | ☐ |
| Sources panel appears | ☐ |
| Sources are deduplicated | ☐ |

## Section E — Privacy

Browser validation only. (The hidden system prompt is already covered by automated E2E.)

| Check | Pass |
|---|---|
| Phone numbers never appear in AI output | ☐ |
| Email addresses never appear in AI output | ☐ |
| Internal notes never appear | ☐ |
| Owner names appear (per approved policy) | ☐ |
| SMS content behaves per policy | ☐ |
| Email content behaves per policy | ☐ |

## Section F — Drafting

| Check | Pass |
|---|---|
| Copy works | ☐ |
| Insert into empty composer works | ☐ |
| Insert appends existing draft | ☐ |
| Timeline view falls back to Copy | ☐ |
| Original AI draft remains visible | ☐ |

## Section G — Failure Isolation

Simulate: network interruption · AI timeout · provider unavailable

| Check | Pass |
|---|---|
| Workspace continues functioning | ☐ |
| Error remains inside Copilot | ☐ |
| Retry works | ☐ |
| No page reload required | ☐ |

## Section H — Security

| Check | Pass |
|---|---|
| Cross-org seller returns 404 | ☐ |
| Read-only invariant holds | ☐ |
| No messages automatically sent | ☐ |
| No seller record modified | ☐ |
| No task created | ☐ |
| No disposition changed | ☐ |
| No follow-up created | ☐ |

## Section I — Performance

- Average response time: ________________________
- Longest response: ________________________
- Any noticeable latency? ______________________________________

## Section J — Defects

| ID | Severity | Reproduction | Result |
|---|---|---|---|
| | | | |
| | | | |
| | | | |

## Section K — Evidence

Attach: Screenshots · Browser console (if applicable) · Relevant logs · Notes

## Section L — Final Recommendation

- ☐ Approved for Merge
- ☐ Approved with Minor Issues
- ☐ Blocked – Fix Required

Comments:

____________________________________________________

____________________________________________________

____________________________________________________

## Section M — Sign-Off

- Operator:
- Date:
- Operations Approval:
- Business Approval:

---

## Appendix — Engineering pre-verification (informational)

Recorded by engineering against baseline `4948b87` before validation. This is a
map from each checklist item to the shipped code that backs it — so the operator
knows every checkable behavior is actually implemented, and understands the two
nuances below. It does **not** replace the operator's browser validation.

**Backed by shipped behavior:**
- **B** — `resolveAiConfigStatus()` (`lib/ai/config.ts`) requires key + model + a
  non-empty approved list **and** the model to appear in it; `/api/health` exposes
  a non-sensitive `ai.configured`/`reason` block (SDK-free, never the key).
- **C** — chrome state (open + width) is persisted to `localStorage` (`copilot.ui`)
  and hydrated after mount; `CopilotProvider` is mounted above **both** chromes so
  state survives the normal↔cockpit transition; the pane is a real reflowing column
  (`CopilotRegion` / `CockpitFrame`), never an overlay, with its own scroll region.
- **D** — client stream reader appends deltas into a single assistant bubble (no
  duplication); the first framed line carries `sources`, rendered via
  `buildDisplaySources()` which **deduplicates**.
- **E** — `PILOT_AI_POLICY` (`lib/ai/context/policy.ts`): **phone = mask, email =
  mask, internalNotes = exclude, ownerName = allow, smsBodies = allow, emailBodies
  = allow.** Enforced at the render boundary; proven end-to-end by
  `scripts/e2e-ai-copilot.mjs`.
- **F** — `requestDraftInsert()` dispatches a cancelable event; the composer in
  `ConversationWorkspace.tsx` accepts **only when a composer is present and enabled**
  (else the Copilot falls back to clipboard → "Timeline view falls back to Copy"),
  and merges via `mergeDraftText()` = replace-when-empty / append-after-blank-line
  (unit-tested). The Copilot's own history always retains the original draft.
- **G** — the pane owns an isolated state tree, a client-side `AbortController` +
  60s timeout, abort-on-unmount, and inline error + **Retry**; nothing it does can
  block or re-render the workspace. Server side: upstream generation is cancelled on
  disconnect, runs under a bounded request timeout, and returns a structured JSON
  error (not an HTML page) on pre-stream failure.
- **H** — session-derived tenant/actor; cross-org subject → 404
  (`CopilotNotFoundError`). Verified **zero** mutating Prisma writes in `lib/ai/`
  and `app/api/ai/` (read-only boundary).

**Two nuances the operator should understand:**
1. **Section E is confirmatory, not the primary guarantee.** The authoritative
   privacy control is that raw phone/email never enter the model *prompt*
   (server-side masking at the render boundary, proven by E2E). The browser checks
   confirm the model does not *echo* restricted data — a useful sanity check, but
   the guarantee lives at the prompt boundary, which is not browser-observable.
2. **Section E masking applies to what is *sent to the model*, not to the rest of
   the workspace UI.** The operator still sees real phone/email in the normal
   workspace panes — masking is specific to the AI context, by design.

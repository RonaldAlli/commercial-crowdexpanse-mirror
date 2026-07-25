# AI Copilot — UI state architecture (Slice 5)

## Where Copilot UI state lives

**All Copilot UI state lives in one place: `CopilotProvider`** (a client React
context), mounted in `app/(workspace)/layout.tsx` **above both chromes**
(`WorkspaceShell` and `SessionCockpitChrome`). Nothing about the copilot lives in
operator/workspace components.

Why the provider, not the region: the workspace layout swaps between two different
chrome subtrees when an acquisition session starts/ends. A region mounted *inside* a
chrome would unmount on that swap and lose the conversation. The provider sits above
both, so state survives the swap and route navigations within the workspace.

| State | Where | Persistence |
|---|---|---|
| `open`, `width` (panel chrome) | provider | **localStorage** (`copilot.ui`) — survives reload/navigation |
| `messages` (conversation), `status`, `error`, `sources` | provider | in-memory for the workspace session (not persisted in Slice 5) |
| in-flight request (`AbortController`), `lastSend` (retry) | provider refs | transient |
| scroll position | region DOM (uncontrolled) | transient |
| `aiConfigured` | server → provider prop | per request (env-derived) |

The **region** (`CopilotRegion`) is a pure consumer: it reads context and renders;
it holds no source-of-truth state. `subjectId` is read from the URL
(`useSearchParams`) in the region and passed into `send()`.

## Isolation invariant (AI state ⟂ operator state)

The provider owns a **separate** state tree from the workspace. The copilot's
loading/streaming/error states never touch operator state, and never trigger a
workspace-level Suspense/error boundary. Concretely:

- The copilot renders in its **own column** (a real pane, not an overlay) that
  reflows the workspace when opened/closed — it never covers the dialer, seller
  info, script, timeline, or queue.
- Each turn uses its own `AbortController` + client timeout. A failed, timed-out,
  aborted, or superseded stream sets **only** copilot state (an inline error + Retry
  inside the pane); the workspace keeps running untouched.
- A newer send supersedes an older one (the stale one's result is discarded, not
  rendered). Unmounting the workspace aborts any in-flight request.
- The copilot is an **enhancement, never a dependency**: if the provider is
  unconfigured it shows an inert state and never calls the API; if a request fails,
  only the pane shows the failure.

## Extension points (later slices)

- Prompt shortcuts (Slice 6) call `send({ subjectId, question, shortcutId })`.
- Citations (Slice 7) render from `sources` (already parsed and stored per answer).
- Draft insert (Slice 8) reads the latest assistant message.

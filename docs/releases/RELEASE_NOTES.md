# CrowdExpanse Commercial — Release Notes

Reverse chronological. User-visible changes only. Baseline reference: `Launch_Baseline_v1.0.md`.

## v1.4 — Communications Desk (in progress)

### Feature — Workspace AI Copilot (Slice 1: read-only + drafting) — 2026-07-25

An AI Copilot for the Acquisition Workspace (`/acquire`) — a collapsible, reflowing side pane (in both the normal work panel and the session cockpit) that reads the current seller's context and helps the operator prepare and draft:

- **Prepare, summarize, and draft:** one-click shortcuts (Summarize seller · Prepare me for this call · Draft SMS · Draft email · Write call opening · Handle objection · Explain motivation · Recommend next step · Generate call summary) plus free-text questions. Responses stream, and a **Sources** panel shows the workspace data each answer used.
- **Read-only and safe by design:** the Copilot can read and draft, but never sends a message, changes a record, sets a status or disposition, schedules a follow-up, or creates a task. A generated draft only reaches a composer when the operator explicitly clicks **Insert** (or Copy); the original stays in the Copilot.
- **Privacy enforced before data leaves the workspace (internal-pilot policy):** phone numbers and email addresses are masked and internal notes are excluded before any context reaches the AI; owner names and message bodies are included per the approved policy.
- **Off unless configured, and never a dependency:** inert until `ANTHROPIC_API_KEY`, `AI_COPILOT_MODEL`, and `AI_COPILOT_APPROVED_MODELS` are set. The workspace is fully usable with the Copilot absent, and an AI slowdown or outage stays isolated to the pane.
- **Production-hardened transport:** context sent to the model is bounded (recent-timeline window, single last-message per channel, truncated bodies) so cost stays predictable; the upstream generation is **cancelled when the operator navigates away** (no paying for unread tokens); the provider runs under a bounded request timeout (optional `AI_COPILOT_REQUEST_TIMEOUT_MS`, default 60s) with capped retries; pre-stream failures return a structured error the pane turns into an inline **Retry**. The `GET /api/health` probe reports a non-sensitive `ai: { configured, reason }` block (never the key) without making the Copilot a liveness dependency.

Internal pilot, read-only. Action-taking and organization-level AI policy/controls are deferred to a later slice, driven by pilot feedback.

**Release-gate classification:** Protected Git tags are a repository-governance safeguard that preserves release history. They are recommended for multi-developer environments but are not required for application security or runtime correctness. The release dashboard shows tag protection as an advisory `RECOMMENDED` item, separate from the mandatory deployment gates; it does not block production deployment.

**Validation status (2026-07-25):** the immutable baseline (`workspace-ai-platform-phase1-ready` → `4948b87`) was deployed to a dedicated **isolated** validation environment (localhost-bound; prod/staging untouched) and all engineering-executable validation passed — build, 36 migrations, live health (`ai` block), authenticated/unauthenticated AI route, live fail-closed (missing key **and** invalid model), kill-switch/rollback, and the full automated suite (typecheck, lint, unit, AI E2E 14/14, all 62 E2E scripts). No engineering defect. **Merge/production remain gated on owner actions** (human browser checklist, PII/ZDR governance sign-off, provisioned prod secrets, repo-admin tag protection). Details: `docs/releases/PHASE1_VALIDATION_REPORT.md` (Addendum A) + `docs/releases/phase1-validation-evidence/`.

### UI correction — Remove sticky auto dialer from the seller work panel — 2026-07-24

The operator control cluster (auto dialer / dispositions / follow-up / status / next) in the non-session **current seller work panel** no longer uses `position: sticky` — it now scrolls naturally with the rest of the panel. This is a design correction, not a new feature: all dialer functionality is unchanged, and no replacement floating/sticky behavior was added. The session cockpit (Session Mode) already uses a fixed multi-pane layout and was intentionally left untouched. Deferred: the full cockpit-style fixed-pane redesign of this panel.

### Feature — Session Mode: the calling cockpit (Slice 1) — 2026-07-24

Starting an acquisition session now **transforms the workspace into a calling cockpit** — the session becomes the thing you work, and the seller is just the current target it hands you:

- **Fixed multi-pane cockpit (call-center style):** the cockpit is a viewport-locked layout, not a scrolling page — mission control (header) · operator pane (Why selling + phone + dispositions, permanent, never moves) · content pane (script + timeline, scrolls) · queue (footer). The dialer stays put; only content scrolls.
- **Operator mode (focused, not trapped):** the shell collapses to a thin left rail (Figma / VS Code style) — **Session · Seller · Queue · Timeline · Settings** for orientation, with the session controls (**Pause · Exit · End**) at the bottom — instead of hiding all navigation.
- **Cockpit hierarchy:** mission control (big, glanceable Goal / Completed / Remaining / Elapsed / Appointments / Qualified) → **Why selling** — the biggest block after mission control, above the fold: the seller's motivation, property facts (asset type · size · year built), location, source, and a *Last contact* line → the operator control cluster (phone · dispositions · follow-up · status · next, one group) → calling-script area → next-targets queue. Notes and the full record/timeline stay reachable.
- **Session states:** **Pause** stops the session and restores the normal workspace with a *Session paused* banner (Resume / End); **Exit** leaves to the workspace without ending (session preserved); **End** restores the workspace and keeps your results. No reliance on browser-back.

Slice 1 of the cockpit. Still to come as separate slices (in order): the **calling script**, queue personality (scenario tags + due-times), session pacing (pace / projected finish / behind), and keyboard hotkeys.

### Feature — Acquisition Session mode — 2026-07-24

The Acquisition Workspace now works as a **calling session**, not a list of records. A prominent bar at the top of `/acquire` lets an operator **start a session with a call goal** and then tracks the block live:

- **Goal · Completed · Remaining · Elapsed · Appointments · Qualified**, a progress bar, and a realized **calls/hr** pace.
- Every number is **derived from the operator's own in-window facts** — completed = calls logged since start, appointments = the appointment-set disposition, qualified = status→Qualified changes — never a hand-kept tally. Counters refresh as you advance the queue; only the clock ticks live.
- One open session per operator; **End session** closes the block.

### Enhancement — Operator Test Deck (seed) — 2026-07-24

A realistic day's queue for evaluating the operator workflow under real conditions: **37 seeded sellers** across new leads, callbacks, voicemails, hot/qualified, wrong numbers, DNC, and appointments — owners/LLCs/inherited/absentee spanning every asset type — each with a believable communication history that fills the Timeline. Tagged for clean re-seed/teardown; DNC excluded from the queue by design. (Internal test data, not a user-facing change.)

### Feature — Operator communications settings (Branch 4) — 2026-07-24

A new **Settings → Communications** screen (admin-only) configures the org's **Telnyx** provider so the operator experience can be connected to a real provider without code changes:

- Per-channel enable toggles — **SMS · Voice · WhatsApp · Email** — plus **From number** (E.164), **messaging profile ID**, **voice connection ID**, and the **Telnyx API key**.
- The **API key is encrypted at rest** (AES-256-GCM) and is never shown again — the field displays only a masked `••••last4` hint, and saving with a blank key keeps the existing one.
- A **per-channel readiness** panel shows what's ready vs. what's still missing, and a **Test connection** action reports exactly what remains to configure.
- **Fail-closed:** storing an API key requires the server-side `COMMS_ENCRYPTION_KEY`; until it's set, the screen saves non-secret fields and shows a clear banner. Providers stay **inert** until real credentials and the Telnyx adapter are enabled (a later step).

**Operator step (not code):** set `COMMS_ENCRYPTION_KEY` (`openssl rand -hex 32`) on the server, then enter Telnyx credentials here, before live calling/messaging is switched on.

### Enhancement — Operator workspace refinement: sticky dock + unified Timeline — 2026-07-24

The Acquisition Workspace is restructured so an acquisition rep can work an entire shift from one screen without scrolling to find controls:

- **Sticky operator dock** — the phone, in-call **timer**, **disposition** buttons, **follow-up** date, **status**, and **Next →** stay pinned at the top and never scroll away during a call. Seller/property reference information scrolls below.
- **Disposition adjacent to the phone** — the six disposition buttons sit immediately beneath the softphone in the same dock, so finishing a call and logging it takes no scrolling and no hunting.
- **One unified Timeline** — the separate *History* tab and *Contact history* card are merged into a single chronological stream (calls, SMS/WhatsApp/email, logged notes/dispositions, follow-ups, and status changes), newest first. It is the default tab.
- **Phone stays the default entry point** — the compact softphone leads the dock; the keypad and mic/speaker selectors tuck behind a **Keypad** toggle so the dock stays short.
- **Seller details** — a compact reference card (phone, email, follow-up, channel, company, location, motivation, plus DNC / no-text / no-email flags) replaces the old contact-history card.

Tabs are now **SMS · WhatsApp · Email · Timeline**. Behavior is otherwise unchanged; sending remains configuration-gated and the softphone remains inert until a voice provider is configured.

### Enhancement — Unified communications workspace (Branch 3) — 2026-07-24

The right side of the Acquisition Workspace is now a full operator communications workspace with tabs **Phone · SMS · WhatsApp · Email · History**:

- **Phone** — the embedded softphone + recent-calls list.
- **SMS / WhatsApp / Email** — message thread (inbound/outbound bubbles with timestamps + delivery state), a compose area with an attachments placeholder, per-channel **search**, scrolling, and an **unread** indicator on the tab.
- **History** — every message and call for the seller in one chronological timeline.
- Empty states throughout; **sending is configuration-gated** (the compose shows the channel's reason and disables until a provider is configured); inbound stays empty until providers exist. Composes over the Branch-1 comms models; only the transport remains to plug in.

### Enhancement — Embedded browser softphone (Branch 2) — 2026-07-24

The Operator Console's phone is now an **embedded browser softphone**, not a device hand-off:

- Dial pad + number display, call controls (**Call · Hang up · Mute · Hold**), an in-call **timer**, **microphone & speaker** selectors, and browser mic-permission handling.
- Pure call state machine + a WebRTC token endpoint + a provider-adapter seam, wired to the Branch-1 comms domain.
- **Inert until a voice provider is configured:** placing a call clearly shows **"Voice provider not configured"** instead of failing. Live calling activates once Telnyx credentials are set (a later step). Text/Email remain device links for now.

## v1.3 — 2026-07-23

### Enhancement — Acquisition Workspace becomes an Operator Console

The `/acquire` right panel is redesigned from an information view into an operator console so a rep can work a call without leaving the screen:

- **Communications** — device-native **Call** (`tel:`, starts the timer), **Text** (`sms:`), **Email** (`mailto:`); disabled with a clear label when the seller has no phone/email.
- **Disposition toolbar** — No answer · Voicemail · Connected · Wrong number · DNC · Appointment set. One tap logs the call, applies the outcome, and advances to the next seller: **Connected / Appointment set** → RESPONDED; **DNC** → do-not-contact (drops from the queue); **Wrong number** → flags bad phone.
- **Follow-up** — set the next follow-up date inline; applied with the disposition.
- **Status**, **custom note / objection**, and **Next seller →** all in the console; qualification checklist, contact history, and seller/property context alongside.

Composes existing contact-touch, status, and promotion systems. **Deferred (need providers/credentials):** provider-backed SMS/email sending, power/predictive dialer, voicemail drop, call recording, calendar/appointment integration, AI notes. Also note: imported sellers currently have no phone/email, so click-to-call/text show their disabled state until that data exists.

## v1.2 — 2026-07-23

### Enhancement — Acquisition Workspace: Calling (Sales Desk Phase A)

Faster calling loop in `/acquire`:

- **Click-to-call** — the seller's phone is a one-tap call button (hands off to the device/softphone dialer).
- **Call timer** — an on-screen timer starts when you place the call.
- **One-tap dispositions** — No answer · Left voicemail · Not interested · Callback requested · Connected — each logs a call and advances to the next seller. A collapsible "custom outcome" form remains for detailed notes / other channels.

Reuses the existing contact-touch logging and auto-advance; no new backend. (Power/predictive dialer and call recording are later phases.)

## v1.1 — 2026-07-23

### New Feature — Seller Acquisition Workspace (`/acquire`)

A focused daily workspace to work the seller lead queue end to end without leaving the screen:

- **Work queue** — prioritized "who to call next": due/overdue follow-ups first, then unscheduled leads oldest-first; DEAD and do-not-contact excluded.
- **Log outcome** — record a call / text / email / note with the outcome and schedule the next follow-up in one step, then auto-advance to the next seller in the queue.
- **Outreach status** — qualify or progress a seller inline (status-only update; doesn't touch other contact fields).
- **Qualification checklist** — at-a-glance: reachable · acquisition source recorded · motivation captured · property linked · contact made.
- **Promote** — one click to an opportunity once the seller is Qualified.
- **Contact history** — the current seller's logged touches.
- **Daily activity metrics** — calls today, touches today, status updates today, queue size.
- **Keyboard-first** — `j` / `k` (or ↓ / ↑) move through the queue.

Composes existing systems (Seller, ContactTouch, Attribution, Opportunity, promotion) — no new architecture, no duplicated logic. Reachable from the Overview nav.

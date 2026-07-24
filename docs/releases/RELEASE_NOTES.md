# CrowdExpanse Commercial — Release Notes

Reverse chronological. User-visible changes only. Baseline reference: `Launch_Baseline_v1.0.md`.

## v1.4 — Communications Desk (in progress)

### Feature — Session Mode: full cockpit takeover (Slice 1) — 2026-07-24

Starting an acquisition session now **transforms the workspace into a calling cockpit** — the session becomes the thing you work, and the seller is just the current target it hands you:

- **Full takeover:** while a session is running, the app sidebar / navigation / search disappear, replaced by a focused cockpit with three controls — **Pause · Exit · End**.
- **Cockpit hierarchy:** mission control (big, glanceable Goal / Completed / Remaining / Elapsed / Appointments / Qualified) → **Why selling** (the seller's motivation surfaced first, beside the phone) + essential context → the operator control cluster (phone · dispositions · follow-up · status · next, one group) → calling-script area → next-targets queue. Notes and the full record/timeline stay reachable.
- **Session states:** **Pause** stops the session and restores the normal workspace with a *Session paused* banner (Resume / End); **Exit** leaves to the workspace without ending (session preserved); **End** restores the workspace and keeps your results. No reliance on browser-back.

Slice 1 of the cockpit. Still to come as separate slices: queue personality (scenario tags + due-times), session pacing (behind/ahead), the calling script content, and keyboard hotkeys.

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

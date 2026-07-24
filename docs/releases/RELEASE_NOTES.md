# CrowdExpanse Commercial — Release Notes

Reverse chronological. User-visible changes only. Baseline reference: `Launch_Baseline_v1.0.md`.

## v1.4 — Communications Desk (in progress)

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

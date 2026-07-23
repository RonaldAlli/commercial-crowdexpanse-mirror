# CrowdExpanse Commercial — Release Notes

Reverse chronological. User-visible changes only. Baseline reference: `Launch_Baseline_v1.0.md`.

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

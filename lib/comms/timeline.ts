// The unified operator timeline (workspace refinement): ONE chronological stream of everything that
// happened with a seller — calls, messages (SMS/Email/WhatsApp), logged touches/dispositions/notes, and
// status changes — replacing the separate "History" tab and "Contact history" card. Pure + unit-tested.

export type TimelineEntry =
  | { kind: "call"; at: number; direction: string; status: string; disposition: string | null; durationSec: number | null }
  | { kind: "message"; at: number; channel: string; direction: string; status: string; body: string; subject: string | null }
  | { kind: "touch"; at: number; touchType: string; summary: string | null; actor: string | null }
  | { kind: "status"; at: number; label: string };

/** Newest first — an activity feed. Every source is normalized to a TimelineEntry before merging. */
export function buildTimeline(entries: TimelineEntry[]): TimelineEntry[] {
  return [...entries].sort((a, b) => b.at - a.at);
}

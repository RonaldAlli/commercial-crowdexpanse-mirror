// Closing Center Slice 6 — Transaction Timeline (TX-0): the PURE projection. A read-only,
// single-opportunity CHRONOLOGICAL view of what has already happened on one deal, assembled at
// read time from events the system ALREADY recorded in ActivityLog (TL-1). NO Prisma, NO clock,
// NO I/O; plain data in, new arrays out; never mutates its input (TL-4). It classifies each
// PERSISTED event into a closed category set and orders them deterministically — it NEVER
// synthesizes an entry with no underlying event (TL-10 Event Integrity). Any unrecognized event
// family is classified as `other` with its label/body preserved — never discarded — so the
// timeline stays forward-compatible with future Closing slices (TL-12 Unknown Event Forward
// Compatibility). For events that correspond to an immutable snapshot it emits a REFERENCE that
// links OUT to the authoritative artifact rather than copying its data (TL-11 Snapshot Reference);
// when the caller signals that artifact is unavailable, ONLY the hyperlink is suppressed — the
// event itself always survives (TL-13 Snapshot Link Failure). It reuses the Closing domain
// vocabulary and never re-derives readiness/blocker/milestone/status (TX-4 Projection
// Composition). Design authority: docs/architecture/CLOSING_CENTER_ARCHITECTURE_LOCK.md
// (Slice 6 — Transaction Timeline) + docs/architecture/TRANSACTION_TIMELINE_DECISION_PACKAGE.md.
import type { Tone } from "@/components/ui/badge";

// --- categories (closed set; `other` guarantees no real event is ever hidden, TL-10) ----------

export type TimelineCategory =
  | "stage"
  | "escrow"
  | "financing"
  | "assignment"
  | "checklist"
  | "documents"
  | "underwriting"
  | "other";

// A deterministic, stable category order used only as an ordering tie-breaker (TL-3) — NOT a
// visual priority. Mirrors the Closing pipeline reading order.
const CATEGORY_ORDER: TimelineCategory[] = [
  "stage",
  "underwriting",
  "escrow",
  "financing",
  "assignment",
  "checklist",
  "documents",
  "other",
];

function categoryRank(category: TimelineCategory): number {
  const i = CATEGORY_ORDER.indexOf(category);
  return i < 0 ? CATEGORY_ORDER.length : i;
}

const CATEGORY_TONE: Record<TimelineCategory, Tone> = {
  stage: "brand",
  underwriting: "brand",
  escrow: "info",
  financing: "info",
  assignment: "info",
  checklist: "success",
  documents: "neutral",
  other: "neutral",
};

const CATEGORY_LABEL: Record<TimelineCategory, string> = {
  stage: "Stage",
  underwriting: "Underwriting",
  escrow: "Escrow",
  financing: "Financing",
  assignment: "Assignment",
  checklist: "Checklist",
  documents: "Documents",
  other: "Activity",
};

export function timelineCategoryLabel(category: TimelineCategory): string {
  return CATEGORY_LABEL[category];
}

export function timelineCategoryTone(category: TimelineCategory): Tone {
  return CATEGORY_TONE[category];
}

/**
 * Classify a persisted event by its `eventType` family prefix. Every unrecognized family maps to
 * `other` (never dropped) so the timeline is an HONEST record of what happened (TL-10). The
 * `assignment_agreement.*` family is documents (a generated artifact), distinct from the
 * `assignment.*` lifecycle — checked first so the more specific prefix wins.
 */
export function classifyEvent(eventType: string): TimelineCategory {
  if (eventType.startsWith("opportunity.stage")) return "stage";
  if (eventType.startsWith("underwriting.")) return "underwriting";
  if (eventType.startsWith("escrow.")) return "escrow";
  if (eventType.startsWith("financing.")) return "financing";
  if (eventType.startsWith("assignment_agreement.")) return "documents";
  if (eventType.startsWith("offer_memo.")) return "documents";
  if (eventType.startsWith("document.")) return "documents";
  if (eventType.startsWith("assignment.")) return "assignment";
  if (eventType.startsWith("closing.")) return "checklist";
  return "other";
}

// --- snapshot reference (TL-11): link OUT to the authoritative artifact, never copy its data ----
// Scoped to exactly the founder-named immutable snapshots: EscrowEvent, UnderwritingDecision, and
// the generated Assignment Agreement / Offer Memo documents. Every other event has no immutable
// artifact to reference and returns null. Links are deep-links OUT (TL-6) — the Timeline owns no
// data of its own.

export type SnapshotReference = { label: string; href: string };

export function snapshotReference(eventType: string, opportunityId: string): SnapshotReference | null {
  // The underwriting decision (UnderwritingDecision) lives in the analyzer workspace.
  if (eventType === "underwriting.decided") {
    return { label: "View underwriting", href: `/analyzer/${opportunityId}` };
  }
  // EscrowEvent snapshots (open/deposit) — authoritative record is the opportunity's Closing Center.
  if (eventType === "escrow.opened" || eventType === "escrow.deposited") {
    return { label: "View in Closing Center", href: `/opportunities/${opportunityId}#closing-center` };
  }
  // Generated documents (immutable, append-only generationSequence) — surfaced in the Closing Center.
  if (eventType === "assignment_agreement.generated" || eventType === "offer_memo.generated") {
    return { label: "View document", href: `/opportunities/${opportunityId}#closing-center` };
  }
  return null;
}

// --- input + entry shapes (plain data only, TL-4 / TD-12) --------------------------------------

/** A recorded event reduced to what the projection reads. Mapped from ActivityLog in the service. */
export type TimelineInputEvent = {
  id: string;
  eventType: string;
  eventLabel: string;
  eventBody: string | null;
  actorName: string | null;
  occurredAtMs: number;
};

export type TimelineEntry = {
  id: string;
  category: TimelineCategory;
  categoryLabel: string;
  tone: Tone;
  title: string; // the recorded human-readable eventLabel — NEVER synthesized (TL-10)
  detail: string | null; // the recorded eventBody
  actorName: string; // resolved actor, or "System" when unattributed
  occurredAtMs: number;
  occurredAtIso: string;
  reference: SnapshotReference | null; // TL-11
};

/**
 * Options for projecting entries. `isReferenceAvailable` is the TL-13 seam: an I/O-free predicate
 * (the caller decides availability — the pure module never does I/O) that, when it returns false
 * for an event, SUPPRESSES only that entry's snapshot hyperlink while the entry itself always
 * renders. Omitted → every reference is considered available (today's references target durable
 * page anchors/routes, so none dangle; the seam future-proofs artifact-specific links).
 */
export type TimelineProjectionOptions = { isReferenceAvailable?: (event: TimelineInputEvent) => boolean };

/** Project ONE persisted event into a presentation-neutral entry. Pure; copies, never mutates. */
export function projectTimelineEntry(
  event: TimelineInputEvent,
  opportunityId: string,
  options?: TimelineProjectionOptions,
): TimelineEntry {
  const category = classifyEvent(event.eventType);
  const candidate = snapshotReference(event.eventType, opportunityId);
  // TL-13: a known-unavailable artifact suppresses ONLY the link — never the event.
  const reference = candidate && (options?.isReferenceAvailable?.(event) ?? true) ? candidate : null;
  return {
    id: event.id,
    category,
    categoryLabel: CATEGORY_LABEL[category],
    tone: CATEGORY_TONE[category],
    title: event.eventLabel, // TL-10/TL-12: the recorded label, verbatim — never synthesized
    detail: event.eventBody,
    actorName: event.actorName && event.actorName.trim().length > 0 ? event.actorName : "System",
    occurredAtMs: event.occurredAtMs,
    occurredAtIso: new Date(event.occurredAtMs).toISOString(),
    reference,
  };
}

// --- deterministic ordering (TL-3) -------------------------------------------------------------
// Total, DB-order-independent so screenshots, Playwright, and pagination are stable even when
// several events share a millisecond `createdAt` (batched writes are real). Primary: occurrence
// time in the chosen direction; then a stable category order; then title; then id. Plain `<`/`>`
// (not locale). Returns a NEW array — never mutates the input (TL-4).

export type TimelineOrder = "newest" | "oldest";

export function compareTimelineEntries(a: TimelineEntry, b: TimelineEntry, order: TimelineOrder): number {
  if (a.occurredAtMs !== b.occurredAtMs) {
    const asc = a.occurredAtMs < b.occurredAtMs ? -1 : 1;
    return order === "oldest" ? asc : -asc;
  }
  // Same instant — deterministic tie-breakers, direction-independent.
  const ar = categoryRank(a.category);
  const br = categoryRank(b.category);
  if (ar !== br) return ar - br;
  if (a.title !== b.title) return a.title < b.title ? -1 : 1;
  if (a.id === b.id) return 0;
  return a.id < b.id ? -1 : 1;
}

export function sortTimelineEntries(entries: TimelineEntry[], order: TimelineOrder): TimelineEntry[] {
  return [...entries].sort((a, b) => compareTimelineEntries(a, b, order));
}

/** Map + order a page of persisted events into the timeline projection. Pure. */
export function projectTimeline(
  events: TimelineInputEvent[],
  opportunityId: string,
  order: TimelineOrder,
  options?: TimelineProjectionOptions,
): TimelineEntry[] {
  return sortTimelineEntries(
    events.map((e) => projectTimelineEntry(e, opportunityId, options)),
    order,
  );
}

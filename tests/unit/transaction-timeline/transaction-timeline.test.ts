import { test } from "node:test";
import assert from "node:assert/strict";

import {
  classifyEvent,
  timelineCategoryLabel,
  timelineCategoryTone,
  snapshotReference,
  projectTimelineEntry,
  projectTimeline,
  sortTimelineEntries,
  compareTimelineEntries,
  type TimelineInputEvent,
  type TimelineEntry,
} from "../../../lib/transaction-timeline";

const OPP = "opp-1";
const t = (iso: string) => Date.parse(iso);

function ev(over: Partial<TimelineInputEvent> = {}): TimelineInputEvent {
  return {
    id: "e1",
    eventType: "escrow.opened",
    eventLabel: "Escrow opened",
    eventBody: null,
    actorName: "Dana Ops",
    occurredAtMs: t("2026-07-10T12:00:00.000Z"),
    ...over,
  };
}

// --- classification (TL-10: every family lands somewhere; unknown → other) --------------------

test("classifyEvent maps each family to its category, unknown → other", () => {
  assert.equal(classifyEvent("opportunity.stage_changed"), "stage");
  assert.equal(classifyEvent("underwriting.decided"), "underwriting");
  assert.equal(classifyEvent("escrow.deposited"), "escrow");
  assert.equal(classifyEvent("financing.started"), "financing");
  assert.equal(classifyEvent("assignment.executed"), "assignment");
  assert.equal(classifyEvent("closing.item_completed"), "checklist");
  assert.equal(classifyEvent("document.created"), "documents");
  assert.equal(classifyEvent("offer_memo.generated"), "documents");
  // assignment_agreement.* is a generated DOCUMENT, not the assignment lifecycle — specific wins.
  assert.equal(classifyEvent("assignment_agreement.generated"), "documents");
  assert.equal(classifyEvent("note.created"), "other");
  assert.equal(classifyEvent("task.completed"), "other");
  assert.equal(classifyEvent("totally.unknown"), "other");
  assert.equal(classifyEvent(""), "other");
});

test("category label + tone are defined for every category", () => {
  for (const c of ["stage", "underwriting", "escrow", "financing", "assignment", "checklist", "documents", "other"] as const) {
    assert.ok(timelineCategoryLabel(c).length > 0);
    assert.ok(timelineCategoryTone(c).length > 0);
  }
  assert.equal(timelineCategoryLabel("other"), "Activity");
  assert.equal(timelineCategoryTone("checklist"), "success");
});

// --- snapshot references (TL-11) ---------------------------------------------------------------

test("snapshotReference links OUT for the named immutable snapshots only", () => {
  assert.deepEqual(snapshotReference("underwriting.decided", OPP), { label: "View underwriting", href: `/analyzer/${OPP}` });
  assert.deepEqual(snapshotReference("escrow.opened", OPP), { label: "View in Closing Center", href: `/opportunities/${OPP}#closing-center` });
  assert.deepEqual(snapshotReference("escrow.deposited", OPP), { label: "View in Closing Center", href: `/opportunities/${OPP}#closing-center` });
  assert.deepEqual(snapshotReference("assignment_agreement.generated", OPP), { label: "View document", href: `/opportunities/${OPP}#closing-center` });
  assert.deepEqual(snapshotReference("offer_memo.generated", OPP), { label: "View document", href: `/opportunities/${OPP}#closing-center` });
});

test("snapshotReference is null for events with no immutable artifact", () => {
  assert.equal(snapshotReference("escrow.updated", OPP), null);
  assert.equal(snapshotReference("opportunity.stage_changed", OPP), null);
  assert.equal(snapshotReference("assignment.executed", OPP), null);
  assert.equal(snapshotReference("note.created", OPP), null);
});

// --- entry projection (TL-10 titles are the recorded label; actor fallback) -------------------

test("projectTimelineEntry copies the recorded label/body and never synthesizes", () => {
  const e = projectTimelineEntry(ev({ eventLabel: "Escrow opened", eventBody: "Holder: First Title" }), OPP);
  assert.equal(e.title, "Escrow opened");
  assert.equal(e.detail, "Holder: First Title");
  assert.equal(e.category, "escrow");
  assert.equal(e.tone, "info");
  assert.equal(e.categoryLabel, "Escrow");
  assert.equal(e.occurredAtIso, "2026-07-10T12:00:00.000Z");
  assert.deepEqual(e.reference, { label: "View in Closing Center", href: `/opportunities/${OPP}#closing-center` });
});

test("actorName falls back to System when absent or blank", () => {
  assert.equal(projectTimelineEntry(ev({ actorName: null }), OPP).actorName, "System");
  assert.equal(projectTimelineEntry(ev({ actorName: "   " }), OPP).actorName, "System");
  assert.equal(projectTimelineEntry(ev({ actorName: "Dana Ops" }), OPP).actorName, "Dana Ops");
});

// --- ordering (TL-3) ---------------------------------------------------------------------------

test("projectTimeline orders newest-first and oldest-first", () => {
  const events = [
    ev({ id: "a", occurredAtMs: t("2026-07-10T00:00:00.000Z"), eventType: "opportunity.stage_changed", eventLabel: "A" }),
    ev({ id: "b", occurredAtMs: t("2026-07-12T00:00:00.000Z"), eventType: "escrow.opened", eventLabel: "B" }),
    ev({ id: "c", occurredAtMs: t("2026-07-11T00:00:00.000Z"), eventType: "financing.started", eventLabel: "C" }),
  ];
  assert.deepEqual(projectTimeline(events, OPP, "newest").map((e) => e.id), ["b", "c", "a"]);
  assert.deepEqual(projectTimeline(events, OPP, "oldest").map((e) => e.id), ["a", "c", "b"]);
});

test("same-instant events break ties by category order, then label, then id (both directions)", () => {
  const ms = t("2026-07-10T09:00:00.000Z");
  const events = [
    ev({ id: "z2", occurredAtMs: ms, eventType: "closing.item_completed", eventLabel: "Same" }), // checklist
    ev({ id: "z1", occurredAtMs: ms, eventType: "closing.item_completed", eventLabel: "Same" }), // checklist, tie → id
    ev({ id: "y", occurredAtMs: ms, eventType: "opportunity.stage_changed", eventLabel: "Stage" }), // stage (earliest rank)
    ev({ id: "x", occurredAtMs: ms, eventType: "escrow.opened", eventLabel: "Escrow" }), // escrow
  ];
  // Tie-breaks are direction-independent: stage → escrow → checklist(id z1 before z2).
  assert.deepEqual(projectTimeline(events, OPP, "newest").map((e) => e.id), ["y", "x", "z1", "z2"]);
  assert.deepEqual(projectTimeline(events, OPP, "oldest").map((e) => e.id), ["y", "x", "z1", "z2"]);
});

test("compareTimelineEntries returns 0 for identical entries", () => {
  const e = projectTimelineEntry(ev(), OPP);
  assert.equal(compareTimelineEntries(e, { ...e }, "newest"), 0);
  assert.equal(compareTimelineEntries(e, { ...e }, "oldest"), 0);
});

// --- purity (TL-4) -----------------------------------------------------------------------------

test("sortTimelineEntries returns a new array and never mutates its input", () => {
  const entries: TimelineEntry[] = [
    projectTimelineEntry(ev({ id: "a", occurredAtMs: t("2026-07-10T00:00:00.000Z") }), OPP),
    projectTimelineEntry(ev({ id: "b", occurredAtMs: t("2026-07-12T00:00:00.000Z") }), OPP),
  ];
  const snapshot = entries.map((e) => e.id);
  const out = sortTimelineEntries(entries, "newest");
  assert.notEqual(out, entries);
  assert.deepEqual(entries.map((e) => e.id), snapshot); // input untouched
  assert.deepEqual(out.map((e) => e.id), ["b", "a"]);
});

test("projectTimeline on empty input yields an empty array", () => {
  assert.deepEqual(projectTimeline([], OPP, "newest"), []);
});

// --- TL-12: unknown event forward compatibility ------------------------------------------------

test("an unrecognized future event is classified other, keeps its label/body, and is never dropped", () => {
  const future = ev({ id: "f1", eventType: "somethingnew.happened", eventLabel: "Something new happened", eventBody: "future detail" });
  const entry = projectTimelineEntry(future, OPP);
  assert.equal(entry.category, "other");
  assert.equal(entry.categoryLabel, "Activity");
  assert.equal(entry.title, "Something new happened"); // preserved verbatim, never synthesized
  assert.equal(entry.detail, "future detail");
  assert.equal(entry.reference, null); // unknown event has no immutable-snapshot reference
  // It survives projection alongside known events (not discarded).
  const out = projectTimeline([future, ev({ id: "known", eventType: "escrow.opened" })], OPP, "oldest");
  assert.deepEqual(out.map((e) => e.id).sort(), ["f1", "known"]);
});

// --- TL-13: snapshot link failure — suppress only the hyperlink, never the event ---------------

test("an unavailable snapshot artifact suppresses only the reference; the entry still renders fully", () => {
  const e = ev({ id: "e1", eventType: "escrow.opened", eventLabel: "Escrow opened", eventBody: "Holder: X" });
  // Reference present when available (default).
  assert.ok(projectTimelineEntry(e, OPP).reference);
  // With the artifact reported unavailable, the link is suppressed but the entry is intact.
  const suppressed = projectTimelineEntry(e, OPP, { isReferenceAvailable: () => false });
  assert.equal(suppressed.reference, null);
  assert.equal(suppressed.id, "e1");
  assert.equal(suppressed.title, "Escrow opened");
  assert.equal(suppressed.detail, "Holder: X");
  assert.equal(suppressed.category, "escrow");
});

test("projectTimeline threads availability per-event — history survives missing references", () => {
  const events = [
    ev({ id: "keep", eventType: "underwriting.decided", occurredAtMs: t("2026-07-02T00:00:00.000Z") }),
    ev({ id: "gone", eventType: "escrow.opened", occurredAtMs: t("2026-07-01T00:00:00.000Z") }),
  ];
  const out = projectTimeline(events, OPP, "oldest", { isReferenceAvailable: (e) => e.id !== "gone" });
  // Both events remain (no suppression of the event itself).
  assert.deepEqual(out.map((e) => e.id), ["gone", "keep"]);
  // Only the unavailable one loses its link.
  assert.equal(out.find((e) => e.id === "gone")?.reference, null);
  assert.ok(out.find((e) => e.id === "keep")?.reference);
});

import { test } from "node:test";
import assert from "node:assert/strict";

import {
  followUpUrgency, mapQueueRow, mapQueue, promotionView, commsGateView, checklistRatioLabel,
  QUEUE_ORDERING_BASIS, type QueueRowView,
} from "@/lib/workspace-ui/seller-view";
import type { QueueSeller } from "@/lib/acquisition-queue";
import type { SellerContactFlags } from "@/lib/comms/gate";

const NOW = new Date("2026-07-29T12:00:00Z");
const qs = (over: Partial<QueueSeller> = {}): QueueSeller => ({
  id: "s1", name: "Acme Holdings", company: "Acme", phone: "555", outreachStatus: "CONTACTED",
  nextFollowUpAt: null, lastTouchAt: null, ...over,
});

test("followUpUrgency: overdue / due-today / scheduled / none (deterministic, injected now)", () => {
  assert.equal(followUpUrgency(new Date("2026-07-28T23:00:00Z"), NOW), "overdue");
  assert.equal(followUpUrgency(new Date("2026-07-29T18:00:00Z"), NOW), "due-today");
  assert.equal(followUpUrgency(new Date("2026-07-30T01:00:00Z"), NOW), "scheduled");
  assert.equal(followUpUrgency(null, NOW), "none");
});

test("mapQueueRow: maps 1:1, builds record href, derives urgency; invents NO score", () => {
  const row = mapQueueRow(qs({ nextFollowUpAt: new Date("2026-07-28T00:00:00Z") }), NOW);
  assert.equal(row.id, "s1");
  assert.equal(row.href, "/seller-queue/s1");
  assert.equal(row.status.label.length > 0, true);
  assert.equal(row.followUp.urgency, "overdue");
  // no fabricated priority/motivation score anywhere on the row VM
  assert.doesNotMatch(JSON.stringify(row).toLowerCase(), /"(score|priority|motivation)"/);
});

test("mapQueue: preserves service order (no client re-sort)", () => {
  const input = [qs({ id: "a" }), qs({ id: "b" }), qs({ id: "c" })];
  assert.deepEqual(mapQueue(input, NOW).map((r: QueueRowView) => r.id), ["a", "b", "c"]);
});

test("queue ordering basis is date-driven, not a score", () => {
  assert.equal(QUEUE_ORDERING_BASIS, "date");
});

test("promotionView: eligible only when the resolver returns a promotion", () => {
  const eligible = promotionView({ mode: "preselect-property", href: "/opportunities/new?sellerId=s1&propertyId=p1", label: "Promote to opportunity" }, { canCreateOpportunity: true, outreachStatus: "QUALIFIED" });
  assert.equal(eligible.state, "eligible");
  assert.equal((eligible as any).href, "/opportunities/new?sellerId=s1&propertyId=p1");
});

test("promotionView: honest not-eligible reasons (never fabricated eligibility)", () => {
  assert.match((promotionView(null, { canCreateOpportunity: false, outreachStatus: "QUALIFIED" }) as any).reason, /permission/i);
  assert.match((promotionView(null, { canCreateOpportunity: true, outreachStatus: "CONTACTED" }) as any).reason, /Qualified/i);
});

test("commsGateView: honest per-channel state; DO_NOT_CONTACT blocks all; flags surface reasons", () => {
  const flags: SellerContactFlags = {
    outreachStatus: "CONTACTED", doNotCall: true, doNotText: false, doNotEmail: false,
    badPhone: false, badEmail: false, phone: "555", email: "a@b.co",
  };
  const view = commsGateView(flags);
  assert.deepEqual(view.map((v) => v.channel), ["PHONE", "SMS", "EMAIL"]);
  const phone = view.find((v) => v.channel === "PHONE")!;
  assert.equal(phone.allowed, false);
  assert.match(phone.reason ?? "", /do-not-call/i);
  const email = view.find((v) => v.channel === "EMAIL")!;
  assert.equal(email.allowed, true);

  const dnc = commsGateView({ ...flags, outreachStatus: "DO_NOT_CONTACT", doNotCall: false });
  assert.ok(dnc.every((v) => v.allowed === false), "DO_NOT_CONTACT blocks every channel");
});

test("checklistRatioLabel: Computed progress rendered as a ratio", () => {
  assert.equal(checklistRatioLabel({ done: 3, total: 5 }), "3 of 5 complete");
});

import { test } from "node:test";
import assert from "node:assert/strict";

import type { ContactOutreachStatus } from "@prisma/client";

import {
  renderSeller,
  renderProperty,
  renderSession,
  renderTimeline,
  renderCommunications,
  renderScoring,
} from "../../../lib/ai/context/render";
import type { AiDataPolicy } from "../../../lib/ai/context/policy";

// Formatting tests use an allow-all policy so they exercise raw rendering; the
// pilot policy's masking/exclusion is covered separately in ai-policy.
const ALLOW: AiDataPolicy = {
  phone: "allow", email: "allow", ownerName: "allow",
  smsBodies: "allow", emailBodies: "allow", internalNotes: "allow",
};

test("renderSeller: labeled fragment with name, motivation, restrictions + source refs", () => {
  const f = renderSeller({
    id: "s1",
    name: "Jane Doe",
    company: "Acme LLC",
    phone: "555-1000",
    email: null,
    city: "Atlanta",
    state: "GA",
    motivation: "relocating out of state",
    acquisitionChannel: "EXPIRED",
    outreachStatus: "RESPONDED",
    doNotCall: false,
    doNotText: true,
    doNotEmail: false,
    ownerName: "Jane Doe",
  });
  assert.equal(f.key, "seller");
  assert.equal(f.label, "Seller");
  assert.match(f.text, /Jane Doe \(Acme LLC\)/);
  assert.match(f.text, /relocating out of state/);
  assert.match(f.text, /Atlanta, GA/);
  assert.match(f.text, /none on file/); // email
  assert.match(f.text, /no texts/); // DNC restriction
  // provenance: a seller ref + a motivation ref
  assert.ok(f.sourceRefs.some((r) => r.anchor === "seller"));
  assert.ok(f.sourceRefs.some((r) => r.anchor === "motivation"));
});

test("renderSeller: unknown motivation is surfaced and adds no motivation source ref", () => {
  const f = renderSeller({
    id: "s2",
    name: "No Motive",
    company: null,
    phone: null,
    email: null,
    city: null,
    state: null,
    motivation: null,
    acquisitionChannel: null,
    outreachStatus: "NEW",
    doNotCall: false,
    doNotText: false,
    doNotEmail: false,
    ownerName: null,
  });
  assert.match(f.text, /not yet known/);
  assert.ok(!f.sourceRefs.some((r) => r.anchor === "motivation"));
});

test("renderProperty: asset type + size + year + location", () => {
  const f = renderProperty({
    name: "Maple Apartments",
    assetType: "MULTIFAMILY",
    unitCount: 24,
    squareFeet: null,
    acreage: null,
    yearBuilt: 1998,
    city: "Decatur",
    state: "GA",
  });
  assert.equal(f.key, "property");
  assert.match(f.text, /Maple Apartments/);
  assert.match(f.text, /MULTIFAMILY/);
  assert.match(f.text, /24 units/);
  assert.match(f.text, /built 1998/);
  assert.match(f.text, /Decatur, GA/);
});

test("renderSession: metrics + 'warming up' pace when callsPerHour is null", () => {
  const f = renderSession({
    goalCalls: 100,
    completed: 3,
    remaining: 97,
    appointments: 1,
    qualified: 0,
    elapsedMs: 60_000,
    callsPerHour: null,
    goalReached: false,
  });
  assert.equal(f.key, "session");
  assert.match(f.text, /goal: 100/);
  assert.match(f.text, /Completed: 3/);
  assert.match(f.text, /warming up/);
});

test("renderTimeline: newest-first, capped, formats each kind", () => {
  const f = renderTimeline(
    {
      calls: [{ at: 1000, direction: "OUTBOUND", status: "COMPLETED", disposition: "Connected", durationSec: 42 }],
      messages: [{ at: 3000, channel: "SMS", direction: "INBOUND", status: "DELIVERED", body: "call me back", subject: null }],
      touches: [{ at: 2000, touchType: "NOTE", summary: "left a note", actor: "Op" }],
      statusEvents: [{ at: 4000, label: "New → Responded" }],
    },
    3,
    ALLOW,
  );
  assert.ok(f);
  const lines = f!.text.split("\n");
  assert.equal(lines.length, 3); // capped at 3 of 4
  assert.match(lines[0], /Status: New → Responded/); // at=4000 newest first
  assert.match(lines[1], /SMS INBOUND: call me back/); // at=3000
  assert.match(lines[2], /NOTE: left a note/); // at=2000
  assert.equal(f!.sourceRefs.length, 3);
});

test("renderTimeline: returns null when there is no activity", () => {
  assert.equal(renderTimeline({ calls: [], messages: [], touches: [], statusEvents: [] }), null);
});

test("renderCommunications: null when nothing; otherwise last message + call", () => {
  assert.equal(renderCommunications({ lastMessage: null, lastCall: null }), null);
  const f = renderCommunications({
    lastMessage: { at: 2, channel: "EMAIL", direction: "OUTBOUND", body: "following up on our chat", subject: "Your property" },
    lastCall: { at: 1, direction: "OUTBOUND", status: "NO_ANSWER", disposition: null },
  });
  assert.ok(f);
  assert.match(f!.text, /Last EMAIL \(OUTBOUND\) — Your property: following up/);
  assert.match(f!.text, /Last call \(OUTBOUND, NO_ANSWER\)/);
  assert.equal(f!.sourceRefs.length, 2);
});

test("renderScoring: qualification progress + motivation", () => {
  const f = renderScoring({
    phone: "555-2000",
    email: "x@y.com",
    motivation: "inherited, wants to sell fast",
    hasProperty: true,
    hasAcquisitionChannel: true,
    acquisitionChannel: "PROBATE",
    outreachStatus: "RESPONDED" as ContactOutreachStatus,
  });
  assert.equal(f.key, "scoring");
  assert.match(f.text, /Qualification: \d+\/\d+/);
  assert.match(f.text, /inherited, wants to sell fast/);
  assert.match(f.text, /Source: PROBATE/);
  assert.ok(f.sourceRefs.some((r) => r.kind === "scoring"));
});

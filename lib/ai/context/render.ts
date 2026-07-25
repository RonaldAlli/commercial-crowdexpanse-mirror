// Pure fragment renderers — no DB, no I/O — so they are unit-testable in isolation.
// The provider files (seller.ts, timeline.ts, …) do the org-scoped Prisma query and
// hand already-fetched, plain data to these functions. The query paths themselves
// are exercised end-to-end (route/E2E) per the repo's DB-coupled testing convention.

import { buildTimeline, type TimelineEntry } from "@/lib/comms/timeline";
import {
  sellerQualificationChecklist,
  checklistProgress,
} from "@/lib/acquisition-checklist";
import type { SessionProgress } from "@/lib/acquisition-session";
import type { ContactOutreachStatus } from "@prisma/client";

import type { ContextFragment, SourceRef } from "./types";
import { PILOT_AI_POLICY, applyRule, type AiDataPolicy } from "./policy";

function truncate(s: string, n = 120): string {
  return s.length > n ? `${s.slice(0, n)}…` : s;
}

// ---- Seller ---------------------------------------------------------------
export type SellerData = {
  id: string;
  name: string;
  company: string | null;
  phone: string | null;
  email: string | null;
  city: string | null;
  state: string | null;
  motivation: string | null;
  acquisitionChannel: string | null;
  outreachStatus: string;
  doNotCall: boolean;
  doNotText: boolean;
  doNotEmail: boolean;
  ownerName: string | null;
};

export function renderSeller(s: SellerData, policy: AiDataPolicy = PILOT_AI_POLICY): ContextFragment {
  const loc = [s.city, s.state].filter(Boolean).join(", ");
  const dnc = [
    s.doNotCall ? "no calls" : null,
    s.doNotText ? "no texts" : null,
    s.doNotEmail ? "no email" : null,
  ]
    .filter(Boolean)
    .join("; ");
  const phone = applyRule(policy.phone, s.phone);
  const email = applyRule(policy.email, s.email);
  const owner = applyRule(policy.ownerName, s.ownerName);
  const contact = [
    policy.phone !== "exclude" ? `Phone: ${phone ?? "none on file"}` : null,
    policy.email !== "exclude" ? `Email: ${email ?? "none on file"}` : null,
  ]
    .filter(Boolean)
    .join(" · ");
  const lines = [
    `Name: ${s.name}${s.company ? ` (${s.company})` : ""}`,
    `Outreach status: ${s.outreachStatus}`,
    owner ? `Owner of record: ${owner}` : null,
    loc ? `Location: ${loc}` : null,
    contact || null,
    s.acquisitionChannel ? `Acquisition source: ${s.acquisitionChannel}` : null,
    `Motivation: ${s.motivation ?? "not yet known — discover it on the call"}`,
    dnc ? `Contact restrictions: ${dnc}` : null,
  ].filter(Boolean);
  const sourceRefs: SourceRef[] = [
    { kind: "seller", id: s.id, anchor: "seller", snippet: `Seller: ${s.name}` },
  ];
  if (s.motivation) {
    sourceRefs.push({ kind: "seller", id: s.id, anchor: "motivation", snippet: `Motivation: ${s.motivation}` });
  }
  return { key: "seller", label: "Seller", text: lines.join("\n"), sourceRefs };
}

// ---- Property -------------------------------------------------------------
export type PropertyData = {
  name: string | null;
  assetType: string;
  unitCount: number | null;
  squareFeet: number | null;
  acreage: number | null;
  yearBuilt: number | null;
  city: string | null;
  state: string | null;
};

export function renderProperty(p: PropertyData): ContextFragment {
  const size =
    p.unitCount != null
      ? `${p.unitCount} units`
      : p.squareFeet != null
        ? `${p.squareFeet.toLocaleString("en-US")} sq ft`
        : p.acreage != null
          ? `${p.acreage} acres`
          : null;
  const facts = [
    p.assetType,
    size,
    p.yearBuilt != null ? `built ${p.yearBuilt}` : null,
    [p.city, p.state].filter(Boolean).join(", ") || null,
  ].filter(Boolean);
  const text = `${p.name ? `${p.name}: ` : ""}${facts.join(" · ")}`;
  return {
    key: "property",
    label: "Property",
    text,
    sourceRefs: [{ kind: "property", anchor: "property", snippet: facts.join(" · ") }],
  };
}

// ---- Session --------------------------------------------------------------
export function renderSession(p: SessionProgress): ContextFragment {
  const pace = p.callsPerHour == null ? "warming up" : `${p.callsPerHour}/hr`;
  const text = [
    `Session goal: ${p.goalCalls} calls`,
    `Completed: ${p.completed} · Remaining: ${p.remaining}`,
    `Appointments set: ${p.appointments} · Qualified: ${p.qualified}`,
    `Pace: ${pace}${p.goalReached ? " · goal reached" : ""}`,
  ].join("\n");
  return {
    key: "session",
    label: "Session",
    text,
    sourceRefs: [
      { kind: "session", anchor: "session", snippet: `${p.completed}/${p.goalCalls} calls this session` },
    ],
  };
}

// ---- Timeline -------------------------------------------------------------
export type TimelineInput = {
  calls: { at: number; direction: string; status: string; disposition: string | null; durationSec: number | null }[];
  messages: { at: number; channel: string; direction: string; status: string; body: string; subject: string | null }[];
  touches: { at: number; touchType: string; summary: string | null; actor: string | null }[];
  statusEvents: { at: number; label: string }[];
};

function describeEntry(e: TimelineEntry, policy: AiDataPolicy): string {
  switch (e.kind) {
    case "call":
      return `Call (${e.direction}, ${e.status}${e.disposition ? `, ${e.disposition}` : ""})`;
    case "message": {
      const rule = e.channel === "EMAIL" ? policy.emailBodies : policy.smsBodies;
      const body = applyRule(rule, e.body);
      return `${e.channel} ${e.direction}: ${body == null ? "(content withheld)" : truncate(body)}`;
    }
    case "touch": {
      const note = applyRule(policy.internalNotes, e.summary);
      return `${e.touchType}${note ? `: ${truncate(note)}` : ""}`;
    }
    case "status":
      return `Status: ${e.label}`;
  }
}

// Returns null when there is no activity yet (a dropped, non-anchor fragment).
export function renderTimeline(
  input: TimelineInput,
  limit = 12,
  policy: AiDataPolicy = PILOT_AI_POLICY,
): ContextFragment | null {
  const entries: TimelineEntry[] = [
    ...input.calls.map((c) => ({ kind: "call" as const, ...c })),
    ...input.messages.map((m) => ({ kind: "message" as const, ...m })),
    ...input.touches.map((t) => ({ kind: "touch" as const, ...t })),
    ...input.statusEvents.map((s) => ({ kind: "status" as const, ...s })),
  ];
  const ordered = buildTimeline(entries).slice(0, limit); // buildTimeline sorts newest-first
  if (ordered.length === 0) return null;
  const sourceRefs: SourceRef[] = ordered.map((e, i) => ({
    kind: "timeline",
    anchor: `timeline-${i}`,
    snippet: describeEntry(e, policy),
  }));
  return {
    key: "timeline",
    label: "Recent timeline",
    text: ordered.map((e) => describeEntry(e, policy)).join("\n"),
    sourceRefs,
  };
}

// ---- Communications (last message / last call) ----------------------------
export type CommunicationsData = {
  lastMessage: { at: number; channel: string; direction: string; body: string; subject: string | null } | null;
  lastCall: { at: number; direction: string; status: string; disposition: string | null } | null;
};

export function renderCommunications(
  d: CommunicationsData,
  policy: AiDataPolicy = PILOT_AI_POLICY,
): ContextFragment | null {
  const parts: string[] = [];
  const sourceRefs: SourceRef[] = [];
  if (d.lastMessage) {
    const rule = d.lastMessage.channel === "EMAIL" ? policy.emailBodies : policy.smsBodies;
    const body = applyRule(rule, d.lastMessage.body);
    const subject = d.lastMessage.subject ? applyRule(policy.emailBodies, d.lastMessage.subject) : null;
    const t = `Last ${d.lastMessage.channel} (${d.lastMessage.direction})${
      subject ? ` — ${subject}` : ""
    }: ${body == null ? "(content withheld)" : truncate(body, 300)}`;
    parts.push(t);
    sourceRefs.push({ kind: "communication", anchor: "last-message", snippet: t });
  }
  if (d.lastCall) {
    const t = `Last call (${d.lastCall.direction}, ${d.lastCall.status}${
      d.lastCall.disposition ? `, ${d.lastCall.disposition}` : ""
    })`;
    parts.push(t);
    sourceRefs.push({ kind: "communication", anchor: "last-call", snippet: t });
  }
  if (parts.length === 0) return null;
  return { key: "communications", label: "Last communication", text: parts.join("\n"), sourceRefs };
}

// ---- Scoring (lead quality) ----------------------------------------------
// Composes the qualification checklist + motivation + source — NOT the buyer↔
// opportunity matcher (which is opportunity-scoped and has no seller inputs).
export type ScoringData = {
  phone: string | null;
  email: string | null;
  motivation: string | null;
  hasProperty: boolean;
  hasAcquisitionChannel: boolean;
  acquisitionChannel: string | null;
  outreachStatus: ContactOutreachStatus;
};

export function renderScoring(d: ScoringData): ContextFragment {
  const items = sellerQualificationChecklist({
    phone: d.phone,
    email: d.email,
    motivation: d.motivation,
    hasProperty: d.hasProperty,
    hasAcquisitionChannel: d.hasAcquisitionChannel,
    outreachStatus: d.outreachStatus,
  });
  const progress = checklistProgress(items);
  const text = [
    `Qualification: ${progress.done}/${progress.total}`,
    ...items.map((it) => `${it.done ? "✓" : "○"} ${it.label}`),
    d.acquisitionChannel ? `Source: ${d.acquisitionChannel}` : null,
    `Motivation: ${d.motivation ?? "unknown"}`,
  ]
    .filter(Boolean)
    .join("\n");
  return {
    key: "scoring",
    label: "Lead quality",
    text,
    sourceRefs: [
      { kind: "scoring", anchor: "qualification", snippet: `Qualification ${progress.done}/${progress.total}` },
    ],
  };
}

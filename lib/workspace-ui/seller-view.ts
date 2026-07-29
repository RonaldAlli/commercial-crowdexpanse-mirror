// CRE Operating Workspace — UI Milestone 1, Increment 2 (Seller Work Queue + Seller Record).
//
// PURE presentation view-models over EXISTING seller-acquisition data. No data access, no clock/random
// (any "now" is injected), no mutation. It classifies fields for the Observed/Computed/Recommended
// taxonomy and derives honest display state. It invents NO priority or motivation score, and it never
// re-orders the queue — the authoritative order comes from `getAcquisitionQueue` (date-driven).

import type { ContactOutreachStatus } from "@prisma/client";

import type { QueueSeller } from "@/lib/acquisition-queue";
import { outreachStatusLabel, outreachStatusTone } from "@/lib/contact-options";
import { commsGate, type SellerContactFlags } from "@/lib/comms/gate";
import type { SellerPromotion } from "@/lib/promote-seller";

// The queue's ordering basis is DATE, never a proprietary score. The UI must state this honestly.
export const QUEUE_ORDERING_BASIS = "date" as const;
export const QUEUE_ORDERING_LABEL = "Ordered by follow-up date (most urgent first)";

export type FollowUpUrgency = "overdue" | "due-today" | "scheduled" | "none";

function utcDay(d: Date): number {
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
}

/** Deterministic follow-up urgency by calendar day (now is injected). Computed value. */
export function followUpUrgency(nextFollowUpAt: Date | null, now: Date): FollowUpUrgency {
  if (!nextFollowUpAt) return "none";
  const due = utcDay(nextFollowUpAt);
  const today = utcDay(now);
  if (due < today) return "overdue";
  if (due === today) return "due-today";
  return "scheduled";
}

export function followUpLabel(urgency: FollowUpUrgency): string {
  switch (urgency) {
    case "overdue": return "Follow-up overdue";
    case "due-today": return "Follow-up due today";
    case "scheduled": return "Follow-up scheduled";
    case "none": return "No follow-up scheduled";
  }
}

export type StatusView = { value: ContactOutreachStatus; label: string; tone: ReturnType<typeof outreachStatusTone> };
export function statusView(status: ContactOutreachStatus): StatusView {
  return { value: status, label: outreachStatusLabel(status), tone: outreachStatusTone(status) };
}

export type QueueRowView = {
  id: string;
  name: string;
  company: string | null;
  href: string;
  status: StatusView; // Observed
  followUp: { urgency: FollowUpUrgency; label: string; at: Date | null }; // Computed (urgency) over Observed (at)
  lastContactAt: Date | null; // Observed
};

/** 1:1 mapping — preserves the service's order; adds no score and no re-sort. */
export function mapQueueRow(s: QueueSeller, now: Date): QueueRowView {
  const urgency = followUpUrgency(s.nextFollowUpAt, now);
  return {
    id: s.id,
    name: s.name,
    company: s.company,
    href: `/seller-queue/${encodeURIComponent(s.id)}`,
    status: statusView(s.outreachStatus),
    followUp: { urgency, label: followUpLabel(urgency), at: s.nextFollowUpAt },
    lastContactAt: s.lastTouchAt,
  };
}

export function mapQueue(rows: QueueSeller[], now: Date): QueueRowView[] {
  return rows.map((r) => mapQueueRow(r, now)); // order preserved; no sort
}

// ---- Promotion (Recommended guidance ONLY where the existing resolver returns one) ----
export type PromotionView =
  | { state: "eligible"; label: string; href: string; mode: SellerPromotion["mode"] }
  | { state: "not-eligible"; reason: string };

export function promotionView(
  promotion: SellerPromotion | null,
  ctx: { canCreateOpportunity: boolean; outreachStatus: ContactOutreachStatus },
): PromotionView {
  if (promotion) return { state: "eligible", label: promotion.label, href: promotion.href, mode: promotion.mode };
  if (!ctx.canCreateOpportunity) return { state: "not-eligible", reason: "You do not have permission to create opportunities." };
  if (ctx.outreachStatus !== "QUALIFIED") return { state: "not-eligible", reason: "Seller must be Qualified before promotion." };
  return { state: "not-eligible", reason: "Promotion is not available." };
}

// ---- Communications gate (honest per-channel STATE; never an active control here) ----
export type GateChannelView = { channel: "PHONE" | "SMS" | "EMAIL"; label: string; allowed: boolean; reason: string | null };

export function commsGateView(flags: SellerContactFlags): GateChannelView[] {
  const labels: Record<GateChannelView["channel"], string> = { PHONE: "Call", SMS: "Text", EMAIL: "Email" };
  return (["PHONE", "SMS", "EMAIL"] as const).map((channel) => {
    const r = commsGate(flags, channel);
    return { channel, label: labels[channel], allowed: r.allowed, reason: r.reason ?? null };
  });
}

// ---- Checklist progress display (progress is a Computed value) ----
export function checklistRatioLabel(progress: { done: number; total: number }): string {
  return `${progress.done} of ${progress.total} complete`;
}

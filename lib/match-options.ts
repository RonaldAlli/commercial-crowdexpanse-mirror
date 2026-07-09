import { MatchStatus } from "@prisma/client";

import type { Tone } from "@/components/ui/badge";

// Ordered pipeline of buyer-match statuses (mirrors the MatchStatus enum).
export const MATCH_STATUS_OPTIONS: { value: MatchStatus; label: string }[] = [
  { value: MatchStatus.NEW, label: "New" },
  { value: MatchStatus.REVIEWING, label: "Reviewing" },
  { value: MatchStatus.SENT, label: "Sent" },
  { value: MatchStatus.DECLINED, label: "Declined" },
  { value: MatchStatus.CONFIRMED, label: "Confirmed" },
];

const LABELS: Record<string, string> = Object.fromEntries(
  MATCH_STATUS_OPTIONS.map((o) => [o.value, o.label]),
);

export function matchStatusLabel(status: string): string {
  return LABELS[status] ?? status;
}

export function matchStatusTone(status: string): Tone {
  switch (status) {
    case MatchStatus.CONFIRMED:
      return "success";
    case MatchStatus.DECLINED:
      return "danger";
    case MatchStatus.REVIEWING:
      return "warning";
    case MatchStatus.SENT:
      return "brand";
    case MatchStatus.NEW:
      return "info";
    default:
      return "neutral";
  }
}

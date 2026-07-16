// Slice 7 / Roadmap #7 — Opportunity-list Closing Badges. A compact, READ-ONLY chip cluster
// summarizing one deal's closing health beneath its title on the Opportunity list. It links OUT to
// the Closing Center and exposes NO inline actions (LB-11); it renders nothing for a deal with no
// closing relevance (LB-9). All values come from the pure projection (TX-6) — this file only
// presents them.
import Link from "next/link";

import { Badge } from "@/components/ui/badge";
import type { ClosingBadgeSummary } from "@/lib/transaction-dashboard";

/**
 * Render the compact closing-badge cluster for one Opportunity, linking to its Closing Center.
 * Returns null when the summary is not visible (LB-9 — early-stage no-activity deals stay quiet).
 */
export function ClosingBadges({ summary, opportunityId }: { summary: ClosingBadgeSummary; opportunityId: string }) {
  if (!summary.visible) return null;

  const closing = summary.readiness
    ? summary.readiness.ready
      ? { label: "Ready", tone: "success" as const }
      : { label: `${summary.readiness.blockerCount} ${summary.readiness.blockerCount === 1 ? "blocker" : "blockers"}`, tone: "danger" as const }
    : { label: "Closing not started", tone: "neutral" as const };

  return (
    <Link
      href={`/opportunities/${opportunityId}#closing-center`}
      className="mt-1.5 flex flex-wrap items-center gap-1.5 rounded-md hover:opacity-90"
      aria-label="Closing status — open the Closing Center"
    >
      <Badge tone={closing.tone} dot>
        {closing.label}
      </Badge>
      {summary.escrow ? <Badge tone={summary.escrow.tone}>Escrow · {summary.escrow.label}</Badge> : null}
      {summary.financing ? <Badge tone={summary.financing.tone}>Financing · {summary.financing.label}</Badge> : null}
      {summary.assignment ? <Badge tone={summary.assignment.tone}>Assignment · {summary.assignment.label}</Badge> : null}
    </Link>
  );
}

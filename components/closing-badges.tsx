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
 * Every chip — including the readiness chip (`summary.closing`) — comes straight from the pure
 * projection; this component derives NO status/label/tone of its own (LB-14). The cluster stays on
 * a SINGLE non-wrapping row (`flex-nowrap` + a reserved `min-h`) so its height is invariant to how
 * many chips are present — a row never jumps as closing progresses (LB-13). Extra width is absorbed
 * by the table's existing horizontal scroll, never by growing the row's height.
 */
export function ClosingBadges({ summary, opportunityId }: { summary: ClosingBadgeSummary; opportunityId: string }) {
  if (!summary.visible) return null;

  return (
    <Link
      href={`/opportunities/${opportunityId}#closing-center`}
      className="mt-1.5 flex min-h-[1.75rem] w-max flex-nowrap items-center gap-1.5 rounded-md hover:opacity-90"
      aria-label="Closing status — open the Closing Center"
    >
      <Badge tone={summary.closing.tone} dot>
        <span className="whitespace-nowrap">{summary.closing.label}</span>
      </Badge>
      {summary.escrow ? <Badge tone={summary.escrow.tone}><span className="whitespace-nowrap">Escrow · {summary.escrow.label}</span></Badge> : null}
      {summary.financing ? <Badge tone={summary.financing.tone}><span className="whitespace-nowrap">Financing · {summary.financing.label}</span></Badge> : null}
      {summary.assignment ? <Badge tone={summary.assignment.tone}><span className="whitespace-nowrap">Assignment · {summary.assignment.label}</span></Badge> : null}
    </Link>
  );
}

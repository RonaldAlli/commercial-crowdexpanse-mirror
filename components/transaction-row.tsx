import Link from "next/link";

import { Badge } from "@/components/ui/badge";
import { stageLabel } from "@/lib/opportunity-options";
import type { TransactionRow } from "@/lib/transaction-dashboard";

// Presentation for ONE Transaction Dashboard row (Closing Slice 5). Pure display of the
// already-projected view-model — it holds NO state and issues NO mutation (TX-3: the whole row
// links OUT to the Opportunity's Closing Center, where the authorized edit path lives). No
// "use client": there are no hooks or handlers, so it renders on the server.

const MAX_BLOCKERS = 3;

function fmtDate(iso: string): string {
  // Deterministic UTC display (the projection already fixed the instant).
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });
}

export function TransactionRowCard({ row }: { row: TransactionRow }) {
  const { readiness } = row;
  const shownBlockers = readiness?.blockerLabels.slice(0, MAX_BLOCKERS) ?? [];
  const extraBlockers = (readiness?.blockerLabels.length ?? 0) - shownBlockers.length;

  return (
    <Link
      href={row.href}
      className="block px-5 py-4 transition-colors hover:bg-slate-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/40"
    >
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        {/* Identity + readiness */}
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="truncate text-sm font-semibold text-slate-900">{row.title}</span>
            <Badge tone="info">{stageLabel(row.stage)}</Badge>
            {row.closed ? <Badge tone="neutral">Closed</Badge> : null}
          </div>
          <p className="mt-0.5 truncate text-xs text-slate-500">{row.propertyName}</p>

          <div className="mt-2 flex flex-wrap items-center gap-2">
            {readiness ? (
              <>
                <Badge tone={readiness.ready ? "success" : "warning"} dot>
                  {readiness.ready ? "Ready to close" : `${readiness.requiredSatisfied}/${readiness.requiredTotal} required`}
                </Badge>
                {!readiness.ready && readiness.outstandingCount > 0 ? (
                  <span className="text-xs text-slate-500">
                    {shownBlockers.join(", ")}
                    {extraBlockers > 0 ? ` +${extraBlockers} more` : ""}
                  </span>
                ) : null}
              </>
            ) : (
              <Badge tone="neutral" dot>Checklist not started</Badge>
            )}
          </div>
        </div>

        {/* Domain statuses + milestone + responsible */}
        <div className="flex flex-col gap-2 lg:items-end">
          <div className="flex flex-wrap items-center gap-1.5">
            <DomainChip label="Escrow" chip={row.escrow} />
            <DomainChip label="Financing" chip={row.financing} />
            <DomainChip label="Assignment" chip={row.assignment} />
          </div>
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
            {row.nextMilestone ? (
              <span className={row.nextMilestone.overdue ? "font-medium text-rose-600" : "text-slate-500"}>
                {row.nextMilestone.overdue ? "Overdue" : "Next"}: {row.nextMilestone.label} · {fmtDate(row.nextMilestone.dateIso)}
              </span>
            ) : (
              <span className="text-slate-400">No upcoming date</span>
            )}
            <span className="text-slate-300">·</span>
            <span className="text-slate-500">
              {row.responsibleParties.length > 0 ? row.responsibleParties.join(", ") : "Unassigned"}
            </span>
          </div>
        </div>
      </div>
    </Link>
  );
}

function DomainChip({ label, chip }: { label: string; chip: { label: string; tone: Parameters<typeof Badge>[0]["tone"] } | null }) {
  return (
    <span className="inline-flex items-center gap-1 text-[10px]">
      <span className="uppercase tracking-wide text-slate-400">{label}</span>
      {chip ? <Badge tone={chip.tone}>{chip.label}</Badge> : <span className="text-slate-400">—</span>}
    </span>
  );
}

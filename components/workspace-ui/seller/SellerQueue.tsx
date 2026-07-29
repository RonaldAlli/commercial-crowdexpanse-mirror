// CRE Operating Workspace — UI M1 Increment 2: Seller Work Queue (presentational).
//
// Contract:
//   guarantees — renders the acquisition queue rows IN THE ORDER GIVEN (never re-sorted), showing status
//     (Observed) and follow-up urgency (Computed) with text + tone (not color alone); rows are
//     keyboard-reachable links; states the date-driven ordering basis honestly; shows an empty state.
//   does NOT — fetch data, re-order, or invent a priority/motivation score; the caller supplies mapped
//     rows from `getAcquisitionQueue`.
//   later increments supply — Command Center orchestration and any richer per-row context.

import Link from "next/link";

import { Icon } from "@/components/icons";
import { TaxonomyBadge } from "@/components/workspace-ui/TaxonomyBadge";
import { StateBlock } from "@/components/workspace-ui/StateBlock";
import { QUEUE_ORDERING_LABEL, type QueueRowView } from "@/lib/workspace-ui/seller-view";

const URGENCY_TONE: Record<QueueRowView["followUp"]["urgency"], string> = {
  overdue: "bg-rose-50 text-rose-800 ring-rose-200",
  "due-today": "bg-amber-50 text-amber-800 ring-amber-200",
  scheduled: "bg-slate-100 text-slate-700 ring-slate-200",
  none: "bg-slate-50 text-slate-500 ring-slate-200",
};

function fmtDate(d: Date | null): string {
  if (!d) return "—";
  return new Date(d).toISOString().slice(0, 10);
}

export function SellerQueue({
  rows,
  metrics,
}: {
  rows: QueueRowView[];
  metrics: { queueSize: number; callsToday: number; touchesToday: number; statusUpdatesToday: number };
}) {
  return (
    <div className="space-y-4">
      <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[
          ["In queue", metrics.queueSize],
          ["Calls today", metrics.callsToday],
          ["Touches today", metrics.touchesToday],
          ["Status updates today", metrics.statusUpdatesToday],
        ].map(([label, value]) => (
          <div key={String(label)} className="rounded-lg border border-slate-200 bg-white px-3 py-2">
            <dt className="text-xs font-medium text-slate-500">{label}</dt>
            <dd className="text-lg font-semibold text-slate-900">{value as number}</dd>
          </div>
        ))}
      </dl>

      <p className="flex items-center gap-1.5 text-xs text-slate-500">
        <TaxonomyBadge kind="computed" />
        <span>{QUEUE_ORDERING_LABEL}. This is not a proprietary score.</span>
      </p>

      {rows.length === 0 ? (
        <StateBlock state="empty" message="No sellers are due for follow-up" />
      ) : (
        <ul className="divide-y divide-slate-100 rounded-xl border border-slate-200 bg-white">
          {rows.map((row) => (
            <li key={row.id}>
              <Link
                href={row.href}
                className="flex items-center gap-4 px-4 py-3 transition-colors hover:bg-slate-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-brand-500"
              >
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-slate-900">{row.name}</p>
                  <p className="truncate text-xs text-slate-500">{row.company ?? "—"}</p>
                </div>
                <span className={`hidden rounded-md px-2 py-0.5 text-xs font-medium ring-1 ring-inset sm:inline ${row.status.tone === "danger" ? "bg-rose-50 text-rose-800 ring-rose-200" : row.status.tone === "success" ? "bg-emerald-50 text-emerald-800 ring-emerald-200" : row.status.tone === "warning" ? "bg-amber-50 text-amber-800 ring-amber-200" : "bg-slate-100 text-slate-700 ring-slate-200"}`}>
                  {row.status.label}
                </span>
                <span className={`inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-xs font-medium ring-1 ring-inset ${URGENCY_TONE[row.followUp.urgency]}`}>
                  <span aria-hidden="true" className="inline-flex">
                    <Icon name="phone" className="h-3.5 w-3.5" />
                  </span>
                  {row.followUp.label}
                  {row.followUp.at ? <span className="hidden md:inline"> · {fmtDate(row.followUp.at)}</span> : null}
                </span>
                <span className="hidden text-xs text-slate-400 lg:inline">Last contact {fmtDate(row.lastContactAt)}</span>
                <span aria-hidden="true" className="inline-flex text-slate-300">
                  <Icon name="chevronRight" className="h-4 w-4" />
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

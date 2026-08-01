// CRE Operating Workspace — Pipeline Value, Increment 1 (organization-level summary).
//
// Presentational. Pipeline Value is OPERATIONAL INVENTORY — the unweighted sum of Expected fee across the open
// contractual pipeline. It is NEVER a forecast and is kept visually + semantically separate from Realized
// Revenue (Financial Truthfulness · Forecast Integrity). It discloses the Lost/Dead limitation honestly
// (Information Quality) and reconciles every breakdown to the total (Inventory Integrity). Computes nothing —
// values come from pipelineValueSummary.

import type { PipelineValueSummary, PipelineValueBreakdownRow } from "@/lib/business-intelligence";
import { channelLabel } from "@/lib/acquisition-options";
import { stageLabel } from "@/lib/opportunity-options";
import type { AcquisitionChannel, OpportunityStage } from "@prisma/client";

function usd(n: number): string {
  return n.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });
}

function BreakdownTable({ title, rows, label }: { title: string; rows: PipelineValueBreakdownRow[]; label: (key: string) => string }) {
  return (
    <div>
      <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-500">{title}</h3>
      {rows.length === 0 ? (
        <p className="mt-1 text-xs text-slate-400">No deals in the active pipeline.</p>
      ) : (
        <table className="mt-1 w-full text-sm">
          <tbody>
            {rows.map((r) => (
              <tr key={r.key} className="border-b border-slate-50">
                <td className="py-1.5 text-slate-700">{label(r.key)}</td>
                <td className="py-1.5 text-right tabular-nums text-slate-500">{r.dealCount}</td>
                <td className="py-1.5 text-right tabular-nums font-medium text-slate-800">{usd(r.valueUsd)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

export function PipelineValueSection({ summary }: { summary: PipelineValueSummary }) {
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <div>
          <div className="text-2xl font-semibold tabular-nums text-slate-900">{usd(summary.totalUsd)}</div>
          <p className="text-xs text-slate-500">
            Contractual value in the active pipeline · {summary.dealCount} deal{summary.dealCount === 1 ? "" : "s"}
            {summary.feeSetCount < summary.dealCount ? ` · ${summary.dealCount - summary.feeSetCount} with no fee set` : ""}
          </p>
        </div>
        <span className="rounded-md bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-600 ring-1 ring-inset ring-slate-200">Operational inventory</span>
      </div>

      {/* Financial Truthfulness: state what this number is and is not. */}
      <p className="text-[11px] leading-snug text-slate-400">
        Sum of contracted assignment fees on deals under contract through closing (not yet realized). This is an
        operational inventory — <span className="font-medium text-slate-500">not a forecast</span> (no probability or
        weighting) and <span className="font-medium text-slate-500">not realized revenue</span>. Deals without a fee
        on record contribute $0. <span className="font-medium text-slate-500">It does not yet exclude Lost/Dead
        opportunities, because that business state does not yet exist</span> — it represents all deals in the active
        contractual pipeline.
      </p>

      <div className="grid gap-4 sm:grid-cols-3">
        <BreakdownTable title="By stage" rows={summary.byStage} label={(k) => stageLabel(k as OpportunityStage)} />
        <BreakdownTable title="By channel" rows={summary.byChannel} label={(k) => (k === "UNKNOWN" ? "Unknown" : channelLabel(k as AcquisitionChannel))} />
        <BreakdownTable title="By campaign" rows={summary.byCampaign} label={(k) => (k === "UNKNOWN" ? "Unknown" : k)} />
      </div>
    </div>
  );
}

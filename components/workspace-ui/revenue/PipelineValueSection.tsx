// CRE Operating Workspace — Pipeline Value, Increment 1 (organization-level summary).
//
// Presentational. Pipeline Value is OPERATIONAL INVENTORY — the unweighted sum of Expected fee across the open
// contractual pipeline. It is NEVER a forecast and is kept visually + semantically separate from Realized
// Revenue (Financial Truthfulness · Forecast Integrity). It discloses the Lost/Dead limitation honestly
// (Information Quality) and reconciles every breakdown to the total (Inventory Integrity). Computes nothing —
// values come from pipelineValueSummary.

import Link from "next/link";

import type { PipelineValueSummary, PipelineValueBreakdownRow } from "@/lib/business-intelligence";
import { channelLabel } from "@/lib/acquisition-options";
import { stageLabel } from "@/lib/opportunity-options";
import type { AcquisitionChannel, OpportunityStage } from "@prisma/client";

const chLabel = (k: string | null) => (k == null || k === "UNKNOWN" ? "Unknown" : channelLabel(k as AcquisitionChannel));

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

      {/* Population Transparency: the operator never infers the population — it is stated explicitly. */}
      <dl className="rounded-lg border border-slate-100 bg-slate-50/60 p-3 text-[11px] text-slate-500">
        <div className="flex gap-2"><dt className="w-16 shrink-0 font-medium text-slate-600">Included</dt><dd>deals with an executed acquisition contract, not yet realized (stages Under contract, Buyer matched, Closing).</dd></div>
        <div className="flex gap-2"><dt className="w-16 shrink-0 font-medium text-slate-600">Excluded</dt><dd>pre-contract deals; realized deals (executed assignment / Paid).</dd></div>
        <div className="flex gap-2"><dt className="w-16 shrink-0 font-medium text-slate-600">Why</dt><dd>Pipeline Value is an operational inventory of contractual expected fees — no probability, no weighting, no forecast. Lost/Dead is not yet excluded (that business state does not exist yet).</dd></div>
      </dl>

      {/* Contributing-deal list — Inventory Integrity: every dollar in the total is a displayed, traceable deal
          (Revenue Evidence · Revenue Traceability). Highest fee first. */}
      <div>
        <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-500">Contributing deals</h3>
        {summary.deals.length === 0 ? (
          <p className="mt-1 text-xs text-slate-400">No deals in the active pipeline.</p>
        ) : (
          <div className="mt-2 overflow-x-auto">
          <table className="w-full min-w-[32rem] text-sm">
            <thead>
              <tr className="border-b border-slate-100 text-left text-xs uppercase tracking-wide text-slate-400">
                <th className="py-2">Deal</th>
                <th className="py-2">Stage</th>
                <th className="py-2">Channel</th>
                <th className="py-2">Campaign</th>
                <th className="py-2 text-right">Expected fee</th>
              </tr>
            </thead>
            <tbody>
              {summary.deals.map((d) => (
                <tr key={d.opportunityId} className="border-b border-slate-50">
                  <td className="py-2">
                    <Link href={`/opportunity-workspace/${d.opportunityId}`} className="font-medium text-brand-700 hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500">{d.title}</Link>
                  </td>
                  <td className="py-2 text-slate-600">{stageLabel(d.stage as OpportunityStage)}</td>
                  <td className="py-2 text-slate-600">{chLabel(d.channel)}</td>
                  <td className="py-2 text-slate-600">{d.campaign ?? <span className="text-slate-400">Unknown</span>}</td>
                  <td className="py-2 text-right tabular-nums font-medium text-slate-800">{d.feeUsd === 0 ? <span className="text-slate-400">Fee not set</span> : usd(d.feeUsd)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          </div>
        )}
      </div>
    </div>
  );
}

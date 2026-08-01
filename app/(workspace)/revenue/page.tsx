// CRE Operating Workspace — Revenue Workspace, Milestone 1 (Realized Revenue), Increments 1–2.
//
// Organization-level Executive Summary. A read-only CONSUMER of the business-intelligence authority (BI Rule 2 —
// it never computes a metric itself): every figure is REALIZED revenue = executed assignment fees, all-time,
// org-scoped. The realized total reuses the same reduction the Command Center uses (revenueAllTimeView). Expected
// and Projected are surfaced by the Revenue Health card as per-deal truths, not aggregated here (Financial
// Truthfulness). Increment 2 adds the org-level Realized-revenue deal list (one row per EXECUTED assignment) —
// each row traceable to its opportunity (Revenue Evidence). No new calculations; no accounting/forecasting.

import Link from "next/link";

import { requireUser } from "@/lib/auth";
import { channelLabel } from "@/lib/acquisition-options";
import { revenueByChannel, assignmentRevenueByCampaign, realizedRevenueEvents, pipelineValueSummary } from "@/lib/business-intelligence";
import type { AcquisitionChannel } from "@prisma/client";
import { PageHeader } from "@/components/workspace-ui/PageHeader";
import { WorkspaceSection } from "@/components/workspace-ui/WorkspaceSection";
import { TaxonomyBadge } from "@/components/workspace-ui/TaxonomyBadge";
import { StateBlock } from "@/components/workspace-ui/StateBlock";
import { RevenueHealthCard } from "@/components/workspace-ui/revenue/RevenueHealthCard";
import { PipelineValueSection } from "@/components/workspace-ui/revenue/PipelineValueSection";

export const dynamic = "force-dynamic";

function usd(n: number): string {
  return n.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });
}

function execDate(d: Date | null): string {
  return d ? new Date(d).toISOString().slice(0, 10) : "—";
}

export default async function RevenuePage() {
  const user = await requireUser();

  const [byChannel, byCampaign, events, pipelineValue] = await Promise.all([
    revenueByChannel(user.organizationId),
    assignmentRevenueByCampaign(user.organizationId),
    realizedRevenueEvents(user.organizationId),
    pipelineValueSummary(user.organizationId),
  ]);

  // Realized total — the SAME authoritative reduction the Command Center uses (executed assignment fees, all-time).
  const realizedUsd = byChannel.reduce((n, r) => n + r.executedRevenueUsd, 0);

  return (
    <div className="space-y-5">
      <PageHeader
        title="Revenue"
        description="What revenue has actually been earned? Realized revenue counts executed assignment fees only, all-time."
      />

      <RevenueHealthCard realizedUsd={realizedUsd} />

      {/* Pipeline Value — OPERATIONAL INVENTORY (Financial State Authority: owned by Revenue). Kept separate from
          Realized Revenue below; never a forecast. */}
      <WorkspaceSection title="Pipeline value" id="revenue-pipeline-value" actions={<TaxonomyBadge kind="computed" />}>
        <PipelineValueSection summary={pipelineValue} />
      </WorkspaceSection>

      <WorkspaceSection
        title="Realized revenue — deals"
        id="revenue-deals"
        actions={<TaxonomyBadge kind="computed" />}
      >
        {events.length === 0 ? (
          <StateBlock state="empty" message="No executed revenue yet — a deal appears here once its assignment is executed." />
        ) : (
          <div className="overflow-x-auto">
          <table className="w-full min-w-[32rem] text-sm">
            <thead>
              <tr className="border-b border-slate-100 text-left text-xs uppercase tracking-wide text-slate-400">
                <th className="py-2">Deal</th>
                <th className="py-2">Executed</th>
                <th className="py-2">Channel</th>
                <th className="py-2">Campaign</th>
                <th className="py-2 text-right">Realized revenue</th>
              </tr>
            </thead>
            <tbody>
              {events.map((e) => (
                <tr key={e.opportunityId} className="border-b border-slate-50">
                  <td className="py-2">
                    <Link href={`/opportunity-workspace/${e.opportunityId}`} className="font-medium text-brand-700 hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500">
                      {e.opportunityTitle}
                    </Link>
                  </td>
                  <td className="py-2 tabular-nums text-slate-500">{execDate(e.executedAt)}</td>
                  <td className="py-2 text-slate-600">{e.channel === "UNKNOWN" ? "Unknown" : channelLabel(e.channel as AcquisitionChannel)}</td>
                  <td className="py-2 text-slate-600">{e.campaign ?? <span className="text-slate-400">Unknown</span>}</td>
                  <td className="py-2 text-right tabular-nums font-medium text-slate-800">{usd(e.realizedUsd)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          </div>
        )}
      </WorkspaceSection>

      <WorkspaceSection title="Realized revenue by channel" id="revenue-by-channel" actions={<TaxonomyBadge kind="computed" />}>
        {byChannel.length === 0 ? (
          <StateBlock state="empty" message="No executed revenue yet — revenue appears once an assignment is executed." />
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-100 text-left text-xs uppercase tracking-wide text-slate-400">
                <th className="py-2">Channel</th>
                <th className="py-2 text-right">Deals</th>
                <th className="py-2 text-right">Realized revenue</th>
              </tr>
            </thead>
            <tbody>
              {byChannel.map((r) => (
                <tr key={r.channel} className="border-b border-slate-50">
                  <td className="py-2 text-slate-700">{r.channel === "UNKNOWN" ? "Unknown" : channelLabel(r.channel as AcquisitionChannel)}</td>
                  <td className="py-2 text-right tabular-nums text-slate-500">{r.dealCount}</td>
                  <td className="py-2 text-right tabular-nums font-medium text-slate-800">{usd(r.executedRevenueUsd)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </WorkspaceSection>

      <WorkspaceSection title="Realized revenue by campaign" id="revenue-by-campaign" actions={<TaxonomyBadge kind="computed" />}>
        {byCampaign.length === 0 ? (
          <StateBlock state="empty" message="No executed revenue yet — revenue appears once an assignment is executed." />
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-100 text-left text-xs uppercase tracking-wide text-slate-400">
                <th className="py-2">Campaign</th>
                <th className="py-2 text-right">Deals</th>
                <th className="py-2 text-right">Realized revenue</th>
              </tr>
            </thead>
            <tbody>
              {byCampaign.map((r) => (
                <tr key={r.campaign} className="border-b border-slate-50">
                  <td className="py-2 text-slate-700">{r.campaign === "UNKNOWN" ? "Unknown" : r.campaign}</td>
                  <td className="py-2 text-right tabular-nums text-slate-500">{r.dealCount}</td>
                  <td className="py-2 text-right tabular-nums font-medium text-slate-800">{usd(r.executedRevenueUsd)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </WorkspaceSection>
    </div>
  );
}

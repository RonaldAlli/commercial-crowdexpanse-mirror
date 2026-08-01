// CRE Operating Workspace — Revenue Workspace, Milestone 1 (Realized Revenue), Increment 1.
//
// Organization-level Executive Summary. A read-only CONSUMER of the business-intelligence authority (BI Rule 2 —
// it never computes a metric itself): every figure is REALIZED revenue = executed assignment fees, all-time,
// org-scoped. The realized total reuses the same reduction the Command Center uses (revenueAllTimeView). No
// deal-level work, no Opportunity Workspace integration, no new calculations (Increment 1 scope). Expected and
// Projected are surfaced by the Revenue Health card as per-deal truths, not aggregated here (Financial
// Truthfulness).

import { requireUser } from "@/lib/auth";
import { channelLabel } from "@/lib/acquisition-options";
import { revenueByChannel, assignmentRevenueByCampaign } from "@/lib/business-intelligence";
import type { AcquisitionChannel } from "@prisma/client";
import { PageHeader } from "@/components/workspace-ui/PageHeader";
import { WorkspaceSection } from "@/components/workspace-ui/WorkspaceSection";
import { TaxonomyBadge } from "@/components/workspace-ui/TaxonomyBadge";
import { StateBlock } from "@/components/workspace-ui/StateBlock";
import { RevenueHealthCard } from "@/components/workspace-ui/revenue/RevenueHealthCard";

export const dynamic = "force-dynamic";

function usd(n: number): string {
  return n.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });
}

export default async function RevenuePage() {
  const user = await requireUser();

  const [byChannel, byCampaign] = await Promise.all([
    revenueByChannel(user.organizationId),
    assignmentRevenueByCampaign(user.organizationId),
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

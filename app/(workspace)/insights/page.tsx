import { PageHeader } from "@/components/page-header";
import { EmptyState } from "@/components/empty-state";
import { requireUser } from "@/lib/auth";
import { channelLabel } from "@/lib/acquisition-options";
import {
  revenueByChannel,
  closedWonConversionByChannel,
  buyerCoverageByChannel,
  assignmentRevenueByCampaign,
  revenueByAcquisitionEvent,
} from "@/lib/business-intelligence";
import type { AcquisitionChannel } from "@prisma/client";

export const dynamic = "force-dynamic";

// Source performance — a CONSUMER of the business-intelligence primitives (BI Rule 2: it never computes
// a metric itself). Every number here comes from lib/business-intelligence, org-scoped and all-time.

function usd(n: number): string {
  return n.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });
}

// A rate is 0..1 or null ("not measurable" — no population). Null renders as an em dash, never "0%".
function pct(rate: number | null): string {
  return rate === null ? "—" : `${Math.round(rate * 100)}%`;
}

// Channel keys arrive as an AcquisitionChannel value or the literal "UNKNOWN"; campaign/event keys are
// free-form strings or "UNKNOWN". Present them readably without re-deriving anything.
function channelName(key: string): string {
  return key === "UNKNOWN" ? "Unknown source" : channelLabel(key as AcquisitionChannel);
}

function Card({ title, subtitle, children }: { title: string; subtitle: string; children: React.ReactNode }) {
  return (
    <article className="card overflow-hidden">
      <div className="border-b border-slate-100 px-5 py-4">
        <h2 className="text-base font-semibold text-slate-900">{title}</h2>
        <p className="text-xs text-slate-500">{subtitle}</p>
      </div>
      {children}
    </article>
  );
}

export default async function InsightsPage() {
  const user = await requireUser();
  const org = user.organizationId;

  const [revChannel, conversion, coverage, revCampaign, revEvent] = await Promise.all([
    revenueByChannel(org),
    closedWonConversionByChannel(org),
    buyerCoverageByChannel(org),
    assignmentRevenueByCampaign(org),
    revenueByAcquisitionEvent(org),
  ]);

  const hasConversion = conversion.length > 0;

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Business intelligence"
        title="Source performance"
        description="Realized revenue and conversion by acquisition source. Revenue counts executed assignments only."
      />

      <div className="grid gap-6 xl:grid-cols-2">
        <Card title="Revenue by channel" subtitle="Executed assignment fees, highest first">
          {revChannel.length === 0 ? (
            <EmptyState icon="analyzer" title="No executed revenue yet" description="Revenue appears once an assignment is executed." />
          ) : (
            <table className="w-full border-collapse">
              <thead className="border-b border-slate-200 bg-slate-50/60">
                <tr>
                  <th className="table-head">Channel</th>
                  <th className="table-head text-right">Revenue</th>
                  <th className="table-head text-right">Deals</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {revChannel.map((r) => (
                  <tr key={r.channel}>
                    <td className="table-cell font-medium text-slate-900">{channelName(r.channel)}</td>
                    <td className="table-cell text-right metric">{usd(r.executedRevenueUsd)}</td>
                    <td className="table-cell text-right metric">{r.dealCount}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Card>

        <Card title="Closed-won conversion by channel" subtitle="Opportunities with an executed assignment ÷ all opportunities">
          {!hasConversion ? (
            <EmptyState icon="pipeline" title="No opportunities yet" description="Conversion appears once opportunities exist." />
          ) : (
            <table className="w-full border-collapse">
              <thead className="border-b border-slate-200 bg-slate-50/60">
                <tr>
                  <th className="table-head">Channel</th>
                  <th className="table-head text-right">Opps</th>
                  <th className="table-head text-right">Won</th>
                  <th className="table-head text-right">Rate</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {conversion.map((r) => (
                  <tr key={r.channel}>
                    <td className="table-cell font-medium text-slate-900">{channelName(r.channel)}</td>
                    <td className="table-cell text-right metric">{r.opportunityCount}</td>
                    <td className="table-cell text-right metric">{r.convertedOpportunityCount}</td>
                    <td className="table-cell text-right metric">{pct(r.conversionRate)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Card>

        <Card title="Buyer coverage by channel" subtitle="Opportunities with ≥1 buyer match ÷ all opportunities">
          {coverage.length === 0 ? (
            <EmptyState icon="spark" title="No opportunities yet" description="Coverage appears once opportunities exist." />
          ) : (
            <table className="w-full border-collapse">
              <thead className="border-b border-slate-200 bg-slate-50/60">
                <tr>
                  <th className="table-head">Channel</th>
                  <th className="table-head text-right">Opps</th>
                  <th className="table-head text-right">Matched</th>
                  <th className="table-head text-right">Coverage</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {coverage.map((r) => (
                  <tr key={r.channel}>
                    <td className="table-cell font-medium text-slate-900">{channelName(r.channel)}</td>
                    <td className="table-cell text-right metric">{r.opportunityCount}</td>
                    <td className="table-cell text-right metric">{r.opportunitiesWithMatch}</td>
                    <td className="table-cell text-right metric">{pct(r.coverageRate)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Card>

        <Card title="Revenue by campaign" subtitle="Executed assignment fees by campaign">
          {revCampaign.length === 0 ? (
            <EmptyState icon="analyzer" title="No executed revenue yet" />
          ) : (
            <table className="w-full border-collapse">
              <thead className="border-b border-slate-200 bg-slate-50/60">
                <tr>
                  <th className="table-head">Campaign</th>
                  <th className="table-head text-right">Revenue</th>
                  <th className="table-head text-right">Deals</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {revCampaign.map((r) => (
                  <tr key={r.campaign}>
                    <td className="table-cell font-medium text-slate-900">{r.campaign === "UNKNOWN" ? "Unknown campaign" : r.campaign}</td>
                    <td className="table-cell text-right metric">{usd(r.executedRevenueUsd)}</td>
                    <td className="table-cell text-right metric">{r.dealCount}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Card>
      </div>

      <Card title="Revenue by acquisition event" subtitle="Executed assignment fees by import batch / acquisition event">
        {revEvent.length === 0 ? (
          <EmptyState icon="upload" title="No executed revenue yet" description="Each import batch is an acquisition event; revenue attributes back to it." />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[520px] border-collapse">
              <thead className="border-b border-slate-200 bg-slate-50/60">
                <tr>
                  <th className="table-head">Acquisition event</th>
                  <th className="table-head text-right">Revenue</th>
                  <th className="table-head text-right">Deals</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {revEvent.map((r) => (
                  <tr key={r.eventKey}>
                    <td className="table-cell font-mono text-xs text-slate-600">{r.eventKey === "UNKNOWN" ? "Unknown event" : r.eventKey}</td>
                    <td className="table-cell text-right metric">{usd(r.executedRevenueUsd)}</td>
                    <td className="table-cell text-right metric">{r.dealCount}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}

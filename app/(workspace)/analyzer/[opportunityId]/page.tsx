import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { Icon } from "@/components/icons";
import { PageHeader } from "@/components/page-header";
import { Badge } from "@/components/ui/badge";
import { requireUser } from "@/lib/auth";
import { computeAnalysis } from "@/lib/analysis";
import { prisma } from "@/lib/prisma";
import { titleCase } from "@/lib/property-options";

export const dynamic = "force-dynamic";

function usd(value: number | null) {
  return value == null ? "—" : new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(value);
}
function pct(value: number | null) {
  return value == null ? "—" : `${value}%`;
}

export default async function AnalysisViewPage({ params }: { params: { opportunityId: string } }) {
  const user = await requireUser();

  const opportunity = await prisma.opportunity.findFirst({
    where: { id: params.opportunityId, organizationId: user.organizationId },
    include: {
      property: { select: { id: true, name: true, assetType: true, unitCount: true, estimatedValueUsd: true } },
      analysis: true,
    },
  });

  if (!opportunity) {
    notFound();
  }
  if (!opportunity.analysis) {
    redirect(`/analyzer/${opportunity.id}/edit`);
  }

  const a = opportunity.analysis;
  const m = computeAnalysis({
    purchasePriceUsd: a.purchasePriceUsd,
    renovationBudgetUsd: a.renovationBudgetUsd,
    closingCostsUsd: a.closingCostsUsd,
    grossIncomeAnnualUsd: a.grossIncomeAnnualUsd,
    operatingExpensesUsd: a.operatingExpensesUsd,
    loanAmountUsd: a.loanAmountUsd,
    interestRatePct: a.interestRatePct,
    amortizationYears: a.amortizationYears,
    unitCount: opportunity.property.unitCount,
    estimatedValueUsd: opportunity.property.estimatedValueUsd,
  });

  const metrics: { label: string; value: string; accent?: boolean }[] = [
    { label: "NOI", value: usd(m.noiAnnualUsd) },
    { label: "Cap rate", value: pct(m.capRate) },
    { label: "Price / unit", value: usd(m.pricePerUnitUsd) },
    { label: "Expense ratio", value: pct(m.expenseRatioPct) },
    { label: "DSCR", value: m.dscr != null ? `${m.dscr}x` : "—" },
    { label: "Debt yield", value: pct(m.debtYieldPct) },
    { label: "Estimated value", value: usd(opportunity.property.estimatedValueUsd) },
    { label: "All-in cost", value: usd(m.allInCostUsd) },
    { label: "Contract value", value: usd(opportunity.contractValueUsd) },
    { label: "Assignment fee", value: usd(opportunity.assignmentFeeUsd), accent: true },
    { label: "Spread", value: usd(m.spreadUsd), accent: true },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Underwriting"
        title={opportunity.title}
        description={`${opportunity.property.name} · ${titleCase(opportunity.property.assetType)}`}
        actions={
          <>
            <Link className="btn-ghost" href={`/opportunities/${opportunity.id}`}>
              Opportunity
            </Link>
            <Link className="btn-primary" href={`/analyzer/${opportunity.id}/edit`}>
              <Icon name="notes" className="h-4 w-4" />
              Edit analysis
            </Link>
          </>
        }
      />

      <section className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
        {metrics.map((metric) => (
          <article key={metric.label} className="card p-5">
            <p className="eyebrow">{metric.label}</p>
            <p className={`metric mt-2 text-2xl font-semibold ${metric.accent ? "text-emerald-600" : "text-slate-900"}`}>
              {metric.value}
            </p>
          </article>
        ))}
      </section>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <article className="card p-6 lg:col-span-2">
          <p className="eyebrow">Inputs</p>
          <dl className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {[
              { label: "Purchase price", value: usd(a.purchasePriceUsd) },
              { label: "Renovation budget", value: usd(a.renovationBudgetUsd) },
              { label: "Closing costs", value: usd(a.closingCostsUsd) },
              { label: "Gross income / yr", value: usd(a.grossIncomeAnnualUsd) },
              { label: "Operating expenses / yr", value: usd(a.operatingExpensesUsd) },
              { label: "Loan amount", value: usd(a.loanAmountUsd) },
              { label: "Interest rate", value: a.interestRatePct != null ? `${a.interestRatePct}%` : "—" },
              { label: "Amortization", value: a.amortizationYears != null ? `${a.amortizationYears} yrs` : "—" },
              { label: "Annual debt service", value: usd(m.annualDebtServiceUsd) },
            ].map((d) => (
              <div key={d.label}>
                <dt className="text-xs text-slate-500">{d.label}</dt>
                <dd className="metric mt-0.5 text-sm font-medium text-slate-900">{d.value}</dd>
              </div>
            ))}
          </dl>
          {a.analystSummary ? (
            <div className="mt-6 border-t border-slate-100 pt-5">
              <p className="eyebrow">Analyst summary</p>
              <p className="mt-2 text-sm leading-relaxed text-slate-600">{a.analystSummary}</p>
            </div>
          ) : null}
        </article>

        <article className="card p-6 lg:col-span-1">
          <p className="eyebrow">Deal quality</p>
          <div className="mt-4 space-y-3 text-sm">
            <p className="text-slate-600">
              Spread of <span className="font-semibold text-emerald-600">{usd(m.spreadUsd)}</span> over an all-in cost of{" "}
              <span className="font-medium text-slate-900">{usd(m.allInCostUsd)}</span>.
            </p>
            {m.dscr != null ? (
              <p className="text-slate-600">
                DSCR <Badge tone={m.dscr >= 1.25 ? "success" : m.dscr >= 1 ? "warning" : "danger"}>{m.dscr}x</Badge>
              </p>
            ) : (
              <p className="text-slate-400">Add debt inputs to compute DSCR and debt yield.</p>
            )}
          </div>
        </article>
      </div>
    </div>
  );
}

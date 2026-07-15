import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { EmptyState } from "@/components/empty-state";
import { Icon } from "@/components/icons";
import { PageHeader } from "@/components/page-header";
import { Badge } from "@/components/ui/badge";
import { requireUser } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { titleCase } from "@/lib/property-options";
import { getActiveScenarioResult } from "@/lib/underwriting";
import type { AssumptionKey } from "@/lib/underwriting/assumptions";

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
      property: { select: { id: true, name: true, assetType: true } },
    },
  });

  if (!opportunity) {
    notFound();
  }

  const scenario = await getActiveScenarioResult(user.organizationId, opportunity.id);
  if (!scenario || !scenario.result) {
    // Writers go straight to the builder. Read-only roles can't create one and
    // would hit the guarded edit route's notFound() — show an empty view instead.
    if (can(user.role, "UPDATE", "UNDERWRITING")) {
      redirect(`/analyzer/${opportunity.id}/edit`);
    }
    return (
      <div className="space-y-6">
        <PageHeader
          eyebrow="Underwriting"
          title={opportunity.title}
          description={`${opportunity.property.name} · ${titleCase(opportunity.property.assetType)}`}
          actions={
            <Link className="btn-ghost" href={`/opportunities/${opportunity.id}`}>
              Opportunity
            </Link>
          }
        />
        <div className="card">
          <EmptyState icon="analyzer" title="No analysis yet" description="An analyst hasn't underwritten this opportunity yet." />
        </div>
      </div>
    );
  }

  // Read metrics from the persisted, deterministically-derived ScenarioResult and
  // the inputs from the scenario's frozen assumptions (the ScenarioSeed snapshot
  // supplies unit count + estimated value — no live Property read).
  const m = scenario.result;
  const a = new Map<AssumptionKey, number>();
  for (const row of scenario.assumptions) a.set(row.key as AssumptionKey, row.valueNumeric.toNumber());
  const val = (k: AssumptionKey): number | null => (a.has(k) ? (a.get(k) as number) : null);

  const metrics: { label: string; value: string; accent?: boolean }[] = [
    { label: "NOI", value: usd(m.noiAnnualUsd) },
    { label: "Cap rate", value: pct(m.capRate) },
    { label: "Price / unit", value: usd(m.pricePerUnitUsd) },
    { label: "Expense ratio", value: pct(m.expenseRatioPct) },
    { label: "DSCR", value: m.dscr != null ? `${m.dscr}x` : "—" },
    { label: "Debt yield", value: pct(m.debtYieldPct) },
    { label: "Estimated value", value: usd(val("ESTIMATED_VALUE")) },
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
            {can(user.role, "UPDATE", "UNDERWRITING") ? (
              <Link className="btn-primary" href={`/analyzer/${opportunity.id}/edit`}>
                <Icon name="notes" className="h-4 w-4" />
                Edit analysis
              </Link>
            ) : null}
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
              { label: "Purchase price", value: usd(val("PURCHASE_PRICE")) },
              { label: "Renovation budget", value: usd(val("RENOVATION_BUDGET")) },
              { label: "Closing costs", value: usd(val("CLOSING_COSTS")) },
              { label: "Gross income / yr", value: usd(val("GROSS_INCOME")) },
              { label: "Operating expenses / yr", value: usd(val("OPERATING_EXPENSES")) },
              { label: "Loan amount", value: usd(val("LOAN_AMOUNT")) },
              { label: "Interest rate", value: val("INTEREST_RATE") != null ? `${val("INTEREST_RATE")}%` : "—" },
              { label: "Amortization", value: val("AMORTIZATION_YEARS") != null ? `${val("AMORTIZATION_YEARS")} yrs` : "—" },
              { label: "Annual debt service", value: usd(m.annualDebtServiceUsd) },
            ].map((d) => (
              <div key={d.label}>
                <dt className="text-xs text-slate-500">{d.label}</dt>
                <dd className="metric mt-0.5 text-sm font-medium text-slate-900">{d.value}</dd>
              </div>
            ))}
          </dl>
          {scenario.analystSummary ? (
            <div className="mt-6 border-t border-slate-100 pt-5">
              <p className="eyebrow">Analyst summary</p>
              <p className="mt-2 text-sm leading-relaxed text-slate-600">{scenario.analystSummary}</p>
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

      {m.sizedLoanUsd != null ? (
        <article className="card p-6">
          <div className="flex items-center justify-between">
            <p className="eyebrow">Debt sizing</p>
            <span className="text-xs text-slate-500">
              Binding constraint: <span className="font-semibold text-slate-900">{m.bindingConstraint}</span>
            </span>
          </div>
          <dl className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {[
              { label: "By LTV", value: usd(m.loanByLtvUsd), binding: m.bindingConstraint === "LTV" },
              { label: "By LTC", value: usd(m.loanByLtcUsd), binding: m.bindingConstraint === "LTC" },
              { label: "By DSCR", value: usd(m.loanByDscrUsd), binding: m.bindingConstraint === "DSCR" },
              { label: "Sized loan", value: usd(m.sizedLoanUsd), accent: true },
            ].map((d) => (
              <div key={d.label}>
                <dt className="text-xs text-slate-500">
                  {d.label}
                  {d.binding ? <span className="ml-1 text-emerald-600">• binds</span> : null}
                </dt>
                <dd className={`metric mt-0.5 text-sm font-semibold ${d.accent ? "text-emerald-600" : "text-slate-900"}`}>{d.value}</dd>
              </div>
            ))}
          </dl>
          <p className="mt-4 text-xs text-slate-400">
            The sized loan is the smallest amount permitted by the provided constraints. Sizing is a derived suggestion — it is not
            automatically applied as the modeled loan amount.
          </p>
        </article>
      ) : null}
    </div>
  );
}

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

// --- sensitivity presentation (3b-v) -----------------------------------------
const SENS_METRIC_LABEL: Record<string, string> = {
  LEVERED_IRR_PCT: "Levered IRR",
  EQUITY_MULTIPLE: "Equity multiple",
  TOTAL_PROFIT_USD: "Total profit",
  CAP_RATE: "Cap rate",
  DSCR: "DSCR",
};
const SENS_AXIS_LABEL: Record<string, string> = {
  PURCHASE_PRICE: "Purchase price",
  RENOVATION_BUDGET: "Renovation budget",
  CLOSING_COSTS: "Closing costs",
  GROSS_INCOME: "Gross income",
  OPERATING_EXPENSES: "Operating expenses",
  INCOME_GROWTH_PCT: "Income growth %",
  EXPENSE_GROWTH_PCT: "Expense growth %",
  HOLD_YEARS: "Hold years",
  EXIT_CAP_RATE_PCT: "Exit cap rate %",
  SELLING_COSTS_PCT: "Selling costs %",
  ESTIMATED_VALUE: "Estimated value",
  LOAN_AMOUNT: "Loan amount",
  INTEREST_RATE: "Interest rate %",
  AMORTIZATION_YEARS: "Amortization yrs",
  TARGET_LTV_PCT: "Target LTV %",
  TARGET_LTC_PCT: "Target LTC %",
  MIN_DSCR: "Min DSCR",
};
const axisLabel = (k: string | null) => (k == null ? "" : (SENS_AXIS_LABEL[k] ?? k));
const axisNum = (v: number | null) => (v == null ? "" : new Intl.NumberFormat("en-US", { maximumFractionDigits: 4 }).format(v));
function sensCell(metric: string, v: number | null) {
  if (v == null) return "—";
  const r = Math.round(v * 100) / 100;
  switch (metric) {
    case "LEVERED_IRR_PCT":
    case "CAP_RATE":
      return `${r}%`;
    case "EQUITY_MULTIPLE":
    case "DSCR":
      return `${r}x`;
    case "TOTAL_PROFIT_USD":
      return usd(v);
    default:
      return String(r);
  }
}

// --- findings / recommendation presentation (3b-vi) --------------------------
const REC_LABEL: Record<string, string> = {
  PROCEED: "Proceed",
  PROCEED_WITH_CONDITIONS: "Proceed with conditions",
  PASS: "Pass",
};
const REC_TONE: Record<string, "success" | "warning" | "danger"> = {
  PROCEED: "success",
  PROCEED_WITH_CONDITIONS: "warning",
  PASS: "danger",
};
const SEV_CLASS: Record<string, string> = {
  CRITICAL: "bg-rose-50 text-rose-700 ring-rose-200",
  WARNING: "bg-amber-50 text-amber-700 ring-amber-200",
  INFO: "bg-slate-50 text-slate-600 ring-slate-200",
};

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

  // Financing is per-case (CF-2). The primary case (position 0) supplies the
  // headline DSCR / debt yield; all cases appear in the comparison card below.
  const cases = scenario.financingCases;
  const primary = cases[0]?.result ?? null;
  const capOf = (c: (typeof cases)[number], key: AssumptionKey): number | null => {
    const r = c.capitalAssumptions.find((x) => x.key === key);
    return r ? r.valueNumeric.toNumber() : null;
  };
  const binds = (c: (typeof cases)[number], k: string) => c.result?.bindingConstraint === k;
  // Rows of the financing comparison table: each renders one metric across all cases.
  const financingRows: { label: string; cell: (c: (typeof cases)[number]) => string }[] = [
    { label: "Loan amount", cell: (c) => usd(capOf(c, "LOAN_AMOUNT")) },
    { label: "Interest rate", cell: (c) => (capOf(c, "INTEREST_RATE") != null ? `${capOf(c, "INTEREST_RATE")}%` : "—") },
    { label: "Amortization", cell: (c) => (capOf(c, "AMORTIZATION_YEARS") != null ? `${capOf(c, "AMORTIZATION_YEARS")} yrs` : "—") },
    { label: "Annual debt service", cell: (c) => usd(c.result?.annualDebtServiceUsd ?? null) },
    { label: "DSCR (yr 1)", cell: (c) => (c.result?.dscr != null ? `${c.result.dscr}x` : "—") },
    { label: "Debt yield", cell: (c) => pct(c.result?.debtYieldPct ?? null) },
    { label: "By LTV", cell: (c) => usd(c.result?.loanByLtvUsd ?? null) + (binds(c, "LTV") ? " •" : "") },
    { label: "By LTC", cell: (c) => usd(c.result?.loanByLtcUsd ?? null) + (binds(c, "LTC") ? " •" : "") },
    { label: "By DSCR", cell: (c) => usd(c.result?.loanByDscrUsd ?? null) + (binds(c, "DSCR") ? " •" : "") },
    { label: "Sized loan", cell: (c) => usd(c.result?.sizedLoanUsd ?? null) },
    { label: "Avg DSCR", cell: (c) => (c.result?.avgDscr != null ? `${c.result.avgDscr}x` : "—") },
    { label: "Cumulative cash flow", cell: (c) => usd(c.result?.cumulativeCashFlowUsd ?? null) },
  ];
  // Exit valuation + equity returns (3b-iv), per case. Shown only when modeled.
  const hasExit = cases.some((c) => c.result?.grossExitValueUsd != null);
  const exitRows: { label: string; cell: (c: (typeof cases)[number]) => string; accent?: boolean }[] = [
    { label: "Terminal NOI", cell: (c) => usd(c.result?.terminalNoiUsd ?? null) },
    { label: "Exit cap rate", cell: (c) => pct(c.result?.exitCapRatePct ?? null) },
    { label: "Gross exit value", cell: (c) => usd(c.result?.grossExitValueUsd ?? null) },
    { label: "Selling costs", cell: (c) => usd(c.result?.sellingCostsUsd ?? null) },
    { label: "Debt payoff", cell: (c) => usd(c.result?.debtPayoffUsd ?? null) },
    { label: "Net sale proceeds", cell: (c) => usd(c.result?.netSaleProceedsUsd ?? null) },
    { label: "Contributed equity", cell: (c) => usd(c.result?.contributedEquityUsd ?? null) },
    { label: "Equity multiple", cell: (c) => (c.result?.equityMultiple != null ? `${c.result.equityMultiple}x` : "—"), accent: true },
    { label: "Levered IRR", cell: (c) => pct(c.result?.leveredIrrPct ?? null), accent: true },
    { label: "Total profit", cell: (c) => usd(c.result?.totalProfitUsd ?? null), accent: true },
  ];

  const metrics: { label: string; value: string; accent?: boolean }[] = [
    { label: "NOI", value: usd(m.noiAnnualUsd) },
    { label: "Cap rate", value: pct(m.capRate) },
    { label: "Price / unit", value: usd(m.pricePerUnitUsd) },
    { label: "Expense ratio", value: pct(m.expenseRatioPct) },
    { label: "DSCR", value: primary?.dscr != null ? `${primary.dscr}x` : "—" },
    { label: "Debt yield", value: pct(primary?.debtYieldPct ?? null) },
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

      {scenario.recommendation ? (
        <article className="card p-6">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="eyebrow">Suggested recommendation</p>
              <p className="mt-1 text-xs text-slate-400">
                Advisory only — a deterministic reading of the findings below. The engine reports and recommends; the decision stays
                with you.
              </p>
            </div>
            <Badge tone={REC_TONE[scenario.recommendation.level] ?? "warning"}>{REC_LABEL[scenario.recommendation.level] ?? scenario.recommendation.level}</Badge>
          </div>
          {scenario.findings.length > 0 ? (
            <ul className="mt-5 space-y-2.5">
              {scenario.findings.map((f) => (
                <li key={f.id} className="flex items-start gap-3">
                  <span className={`mt-0.5 inline-flex shrink-0 rounded px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide ring-1 ring-inset ${SEV_CLASS[f.severity] ?? SEV_CLASS.INFO}`}>
                    {f.severity}
                  </span>
                  <div>
                    <p className="text-sm font-medium text-slate-800">{f.title}</p>
                    <p className="text-xs text-slate-500">{f.detail}</p>
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-4 text-sm text-slate-500">No findings — the scenario cleared every rule in the current ruleset.</p>
          )}
        </article>
      ) : null}

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
              { label: "Income growth / yr", value: val("INCOME_GROWTH_PCT") != null ? `${val("INCOME_GROWTH_PCT")}%` : "—" },
              { label: "Expense growth / yr", value: val("EXPENSE_GROWTH_PCT") != null ? `${val("EXPENSE_GROWTH_PCT")}%` : "—" },
              { label: "Hold period", value: val("HOLD_YEARS") != null ? `${val("HOLD_YEARS")} yrs` : "—" },
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
            {primary?.dscr != null ? (
              <p className="text-slate-600">
                DSCR <Badge tone={primary.dscr >= 1.25 ? "success" : primary.dscr >= 1 ? "warning" : "danger"}>{primary.dscr}x</Badge>
                <span className="ml-1 text-xs text-slate-400">({cases[0]?.label})</span>
              </p>
            ) : (
              <p className="text-slate-400">Add a financing case to compute DSCR and debt yield.</p>
            )}
          </div>
        </article>
      </div>

      {scenario.lineItems.length > 0 ? (
        <article className="card p-6">
          <p className="eyebrow">Income &amp; expense schedule</p>
          <div className="mt-4 grid gap-8 sm:grid-cols-2">
            {(["INCOME", "EXPENSE"] as const).map((kind) => {
              const rows = scenario.lineItems.filter((l) => l.kind === kind);
              if (rows.length === 0) return <div key={kind} />;
              const total = kind === "INCOME" ? m.grossIncomeAnnualUsd : m.operatingExpensesUsd;
              return (
                <div key={kind}>
                  <p className="text-sm font-medium text-slate-700">{kind === "INCOME" ? "Income" : "Operating expenses"}</p>
                  <dl className="mt-2 divide-y divide-slate-100">
                    {rows.map((l) => (
                      <div key={l.id} className="flex items-center justify-between py-1.5 text-sm">
                        <dt className="text-slate-500">{l.category}</dt>
                        <dd className="metric font-medium text-slate-900">{usd(l.amountAnnualUsd.toNumber())}</dd>
                      </div>
                    ))}
                    <div className="flex items-center justify-between py-1.5 text-sm">
                      <dt className="font-semibold text-slate-700">Effective total</dt>
                      <dd className="metric font-semibold text-emerald-600">{usd(total)}</dd>
                    </div>
                  </dl>
                </div>
              );
            })}
          </div>
        </article>
      ) : null}

      {cases.length > 0 ? (
        <article className="card p-6">
          <p className="eyebrow">Financing comparison</p>
          <p className="mt-1 text-xs text-slate-400">
            Each capital structure consumes the same operating NOI; only its debt differs. Sized loans are suggestions (• marks the
            binding constraint) — never auto-applied.
          </p>
          <div className="mt-4 overflow-x-auto">
            <table className="w-full min-w-[560px] text-sm">
              <thead>
                <tr className="text-left text-xs text-slate-500">
                  <th className="py-2 pr-4 font-medium">Metric</th>
                  {cases.map((c) => (
                    <th key={c.id} className="px-3 py-2 font-medium text-slate-700">{c.label}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {financingRows.map((row) => (
                  <tr key={row.label}>
                    <td className="py-2 pr-4 text-xs text-slate-500">{row.label}</td>
                    {cases.map((c) => (
                      <td key={c.id} className="metric px-3 py-2 text-slate-900">{row.cell(c)}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </article>
      ) : null}

      {cases.some((c) => c.cashFlow.length > 0) ? (
        <article className="card p-6">
          <p className="eyebrow">Cash-flow projection</p>
          <p className="mt-1 text-xs text-slate-400">Operating cash flow before tax — no sale, refinance, or terminal value.</p>
          <div className="mt-4 space-y-6">
            {cases
              .filter((c) => c.cashFlow.length > 0)
              .map((c) => (
                <div key={c.id}>
                  <p className="text-sm font-medium text-slate-700">{c.label}</p>
                  <div className="mt-2 overflow-x-auto">
                    <table className="w-full min-w-[560px] text-sm">
                      <thead>
                        <tr className="text-left text-xs text-slate-500">
                          <th className="py-1.5 pr-4 font-medium">Year</th>
                          <th className="px-3 py-1.5 font-medium">NOI</th>
                          <th className="px-3 py-1.5 font-medium">Debt service</th>
                          <th className="px-3 py-1.5 font-medium">Cash flow (pre-tax)</th>
                          <th className="px-3 py-1.5 font-medium">DSCR</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {c.cashFlow.map((y) => (
                          <tr key={y.year}>
                            <td className="py-1.5 pr-4 text-slate-500">{y.year}</td>
                            <td className="metric px-3 py-1.5 text-slate-900">{usd(y.noiUsd)}</td>
                            <td className="metric px-3 py-1.5 text-slate-900">{usd(y.debtServiceUsd)}</td>
                            <td className="metric px-3 py-1.5 font-medium text-emerald-600">{usd(y.cashFlowBeforeTaxUsd)}</td>
                            <td className="metric px-3 py-1.5 text-slate-900">{y.dscr != null ? `${y.dscr}x` : "—"}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              ))}
          </div>
        </article>
      ) : null}

      {hasExit ? (
        <article className="card p-6">
          <p className="eyebrow">Exit &amp; equity returns</p>
          <p className="mt-1 text-xs text-slate-400">
            Terminal value capitalizes the exit-year NOI at the exit cap rate; each case nets its own amortized debt payoff. Returns
            are derived from the equity cash-flow series — operating cash flow only (no tax, refinance, or promote).
          </p>
          <div className="mt-4 overflow-x-auto">
            <table className="w-full min-w-[560px] text-sm">
              <thead>
                <tr className="text-left text-xs text-slate-500">
                  <th className="py-2 pr-4 font-medium">Metric</th>
                  {cases.map((c) => (
                    <th key={c.id} className="px-3 py-2 font-medium text-slate-700">{c.label}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {exitRows.map((row) => (
                  <tr key={row.label}>
                    <td className="py-2 pr-4 text-xs text-slate-500">{row.label}</td>
                    {cases.map((c) => (
                      <td key={c.id} className={`metric px-3 py-2 ${row.accent ? "font-semibold text-emerald-600" : "text-slate-900"}`}>
                        {row.cell(c)}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </article>
      ) : null}

      {cases.some((c) => c.equityCashFlow.length > 0) ? (
        <article className="card p-6">
          <p className="eyebrow">Equity cash-flow series</p>
          <p className="mt-1 text-xs text-slate-400">Year 0 is the equity contribution; the final year combines operating cash flow and net sale proceeds.</p>
          <div className="mt-4 space-y-6">
            {cases
              .filter((c) => c.equityCashFlow.length > 0)
              .map((c) => (
                <div key={c.id}>
                  <p className="text-sm font-medium text-slate-700">{c.label}</p>
                  <div className="mt-2 overflow-x-auto">
                    <table className="w-full min-w-[480px] text-sm">
                      <thead>
                        <tr className="text-left text-xs text-slate-500">
                          <th className="py-1.5 pr-4 font-medium">Year</th>
                          <th className="px-3 py-1.5 font-medium">Equity cash flow</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {c.equityCashFlow.map((y) => (
                          <tr key={y.year}>
                            <td className="py-1.5 pr-4 text-slate-500">{y.year === 0 ? "0 (equity in)" : y.year}</td>
                            <td className={`metric px-3 py-1.5 ${y.equityCashFlowUsd < 0 ? "text-rose-600" : "font-medium text-emerald-600"}`}>
                              {usd(y.equityCashFlowUsd)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              ))}
          </div>
        </article>
      ) : null}

      {cases.some((c) => c.sensitivity && c.sensitivity.cells.length > 0) ? (
        <article className="card p-6">
          <p className="eyebrow">Sensitivity</p>
          <p className="mt-1 text-xs text-slate-400">
            Each cell re-derives the metric under its axis overrides — a what-if reading over the frozen baseline that never changes
            it. The baseline cell (▪) is marked only when the current values fall exactly on the axes.
          </p>
          <div className="mt-4 space-y-8">
            {cases
              .filter((c) => c.sensitivity && c.sensitivity.cells.length > 0)
              .map((c) => {
                const s = c.sensitivity!;
                const hasY = s.yKey != null;
                const xVals = Array.from(new Set(s.cells.map((cell) => cell.xValue))).sort((p, q) => p - q);
                const yVals = hasY
                  ? Array.from(new Set(s.cells.map((cell) => cell.yValue).filter((v): v is number => v != null))).sort((p, q) => p - q)
                  : [null];
                const at = (x: number, y: number | null) =>
                  s.cells.find((cell) => cell.xValue === x && (y == null ? cell.yValue == null : cell.yValue === y));
                return (
                  <div key={c.id}>
                    <p className="text-sm font-medium text-slate-700">
                      {c.label} — {SENS_METRIC_LABEL[s.targetMetric] ?? s.targetMetric}
                      <span className="ml-1 text-xs font-normal text-slate-400">
                        (x: {axisLabel(s.xKey)}
                        {hasY ? `, y: ${axisLabel(s.yKey)}` : ""})
                      </span>
                    </p>
                    <div className="mt-2 overflow-x-auto">
                      <table className="text-sm">
                        <thead>
                          <tr className="text-xs text-slate-500">
                            <th className="py-1.5 pr-3 text-left font-medium">{hasY ? `${axisLabel(s.yKey)} ╲ ${axisLabel(s.xKey)}` : axisLabel(s.xKey)}</th>
                            {xVals.map((x) => (
                              <th key={x} className="metric px-3 py-1.5 font-medium text-slate-700">
                                {axisNum(x)}
                              </th>
                            ))}
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                          {yVals.map((y) => (
                            <tr key={String(y)}>
                              <td className="metric py-1.5 pr-3 text-xs font-medium text-slate-500">
                                {y == null ? SENS_METRIC_LABEL[s.targetMetric] ?? s.targetMetric : axisNum(y)}
                              </td>
                              {xVals.map((x) => {
                                const cell = at(x, y);
                                return (
                                  <td
                                    key={x}
                                    className={`metric px-3 py-1.5 ${
                                      cell?.isBaseline
                                        ? "bg-emerald-50 font-semibold text-emerald-700 ring-1 ring-inset ring-emerald-200"
                                        : "text-slate-900"
                                    }`}
                                  >
                                    {cell?.isBaseline ? "▪ " : ""}
                                    {sensCell(s.targetMetric, cell?.metricValue ?? null)}
                                  </td>
                                );
                              })}
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                );
              })}
          </div>
        </article>
      ) : null}
    </div>
  );
}

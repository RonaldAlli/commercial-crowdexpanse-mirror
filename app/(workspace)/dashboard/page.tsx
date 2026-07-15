import { EmptyState } from "@/components/empty-state";
import { PageHeader } from "@/components/page-header";
import { StatCard } from "@/components/stat-card";
import { Badge, type Tone } from "@/components/ui/badge";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

function titleCase(value: string) {
  return value
    .toLowerCase()
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function formatUsd(value: number | null | undefined, compact = false) {
  if (value == null) return "—";
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: compact ? 1 : 0,
    notation: compact ? "compact" : "standard",
  }).format(value);
}

function formatPercent(value: number | null | undefined) {
  if (value == null) return "—";
  return `${value.toFixed(2)}%`;
}

const taskTone: Record<string, Tone> = {
  BACKLOG: "warning",
  IN_PROGRESS: "info",
  BLOCKED: "danger",
  COMPLETE: "success",
};

/** The latest underwriting's active scenario, shaped like the legacy latestAnalysis. */
async function latestUnderwritingSummary(organizationId: string) {
  const uw = await prisma.underwriting.findFirst({
    where: { organizationId, activeScenarioId: { not: null } },
    orderBy: { updatedAt: "desc" },
    include: { opportunity: { select: { title: true } } },
  });
  if (!uw?.activeScenarioId) return null;
  const scenario = await prisma.underwritingScenario.findFirst({
    where: { id: uw.activeScenarioId, organizationId },
    include: { result: true, assumptions: { where: { key: "PURCHASE_PRICE" } } },
  });
  if (!scenario?.result) return null;
  return {
    purchasePriceUsd: scenario.assumptions[0]?.valueNumeric.toNumber() ?? null,
    noiAnnualUsd: scenario.result.noiAnnualUsd,
    capRate: scenario.result.capRate,
    debtYield: scenario.result.debtYieldPct,
    dscr: scenario.result.dscr,
    pricePerUnitUsd: scenario.result.pricePerUnitUsd,
    analystSummary: scenario.analystSummary,
    opportunity: { title: uw.opportunity.title },
  };
}

export default async function DashboardPage() {
  const user = await requireUser();
  const where = { organizationId: user.organizationId };

  const [
    sellerCount,
    buyerCount,
    propertyCount,
    opportunityCount,
    taskCount,
    documentCount,
    opportunities,
    openTasks,
    activity,
  ] = await Promise.all([
    prisma.seller.count({ where }),
    prisma.buyer.count({ where }),
    prisma.property.count({ where }),
    prisma.opportunity.count({ where }),
    prisma.task.count({ where }),
    prisma.document.count({ where }),
    prisma.opportunity.findMany({
      where,
      include: { property: true, seller: true },
      orderBy: { updatedAt: "desc" },
      take: 6,
    }),
    prisma.task.findMany({
      where: { ...where, status: { not: "COMPLETE" } },
      include: { opportunity: true },
      orderBy: { dueDate: "asc" },
      take: 6,
    }),
    prisma.activityLog.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take: 6,
    }),
  ]);

  // Latest underwriting = the most recently touched Underwriting's active scenario
  // result (the canonical successor to the latest DealAnalysis). Shaped to match
  // the fields the analyzer card renders.
  const latestAnalysis = await latestUnderwritingSummary(user.organizationId);

  const stats = [
    { label: "Sellers", value: String(sellerCount), detail: "Motivated sellers tracked in acquisitions." },
    { label: "Buyers", value: String(buyerCount), detail: "Capital partners on file for matching." },
    { label: "Properties", value: String(propertyCount), detail: "Commercial assets in the system." },
    { label: "Opportunities", value: String(opportunityCount), detail: "Deals across the 13-stage pipeline." },
    { label: "Tasks", value: String(taskCount), detail: "Execution items, open and completed." },
    { label: "Documents", value: String(documentCount), detail: "Files uploaded across deals." },
  ];

  const analyzerMetrics = latestAnalysis
    ? [
        { label: "Purchase price", value: formatUsd(latestAnalysis.purchasePriceUsd, true) },
        { label: "NOI", value: formatUsd(latestAnalysis.noiAnnualUsd, true) },
        { label: "Cap rate", value: formatPercent(latestAnalysis.capRate) },
        { label: "Debt yield", value: formatPercent(latestAnalysis.debtYield) },
        { label: "DSCR", value: latestAnalysis.dscr != null ? `${latestAnalysis.dscr.toFixed(2)}x` : "—" },
        { label: "Price / unit", value: formatUsd(latestAnalysis.pricePerUnitUsd, true) },
      ]
    : [];

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Acquisitions command center"
        title={`Welcome back, ${user.name.split(" ")[0]}`}
        description={`${user.organizationName} · sellers, asset performance, buyer pull, and closing moves in one view.`}
      />

      <section className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {stats.map((stat) => (
          <StatCard key={stat.label} {...stat} />
        ))}
      </section>

      <section className="grid grid-cols-1 gap-6 lg:grid-cols-5">
        {/* Recent opportunities */}
        <article className="card lg:col-span-3">
          <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
            <div>
              <p className="eyebrow">Pipeline</p>
              <h2 className="mt-0.5 text-base font-semibold text-slate-900">Recent opportunities</h2>
            </div>
            {opportunities.length > 0 ? (
              <Badge tone="brand">{opportunityCount} total</Badge>
            ) : null}
          </div>
          {opportunities.length > 0 ? (
            <ul className="divide-y divide-slate-100">
              {opportunities.map((opportunity) => (
                <li
                  key={opportunity.id}
                  className="flex items-center justify-between gap-4 px-5 py-4 transition-colors hover:bg-slate-50/60"
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-slate-900">{opportunity.title}</p>
                    <p className="mt-0.5 text-xs text-slate-500">
                      {titleCase(opportunity.property.assetType)} · {opportunity.property.city},{" "}
                      {opportunity.property.state}
                    </p>
                  </div>
                  <div className="flex shrink-0 flex-col items-end gap-1.5">
                    <Badge tone="info" dot>
                      {titleCase(opportunity.stage)}
                    </Badge>
                    <span className="metric text-sm font-medium text-emerald-600">
                      {formatUsd(opportunity.assignmentFeeUsd ?? opportunity.contractValueUsd, true)}
                    </span>
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <EmptyState
              icon="pipeline"
              title="No opportunities yet"
              description="Deals will appear here as you add sellers and move properties into the pipeline."
            />
          )}
        </article>

        {/* Analyzer snapshot */}
        <article className="card lg:col-span-2">
          <div className="border-b border-slate-100 px-5 py-4">
            <p className="eyebrow">Underwriting focus</p>
            <h2 className="mt-0.5 text-base font-semibold text-slate-900">Analyzer snapshot</h2>
            {latestAnalysis ? (
              <p className="mt-1 truncate text-xs text-slate-500">
                {latestAnalysis.opportunity.title}
              </p>
            ) : null}
          </div>
          {latestAnalysis ? (
            <>
              <div className="grid grid-cols-2 gap-px bg-slate-100">
                {analyzerMetrics.map((m) => (
                  <div key={m.label} className="bg-white px-5 py-3.5">
                    <p className="text-xs text-slate-500">{m.label}</p>
                    <p className="metric mt-1 text-lg font-semibold text-slate-900">{m.value}</p>
                  </div>
                ))}
              </div>
              {latestAnalysis.analystSummary ? (
                <p className="px-5 py-4 text-sm leading-relaxed text-slate-600">
                  {latestAnalysis.analystSummary}
                </p>
              ) : null}
            </>
          ) : (
            <EmptyState
              icon="analyzer"
              title="No underwriting yet"
              description="Run the Deal Analyzer on an opportunity to see the latest snapshot here."
            />
          )}
        </article>
      </section>

      <section className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* Open tasks */}
        <article className="card">
          <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
            <div>
              <p className="eyebrow">Task pressure</p>
              <h2 className="mt-0.5 text-base font-semibold text-slate-900">Next execution moves</h2>
            </div>
          </div>
          {openTasks.length > 0 ? (
            <ul className="divide-y divide-slate-100">
              {openTasks.map((task) => (
                <li key={task.id} className="flex items-center justify-between gap-4 px-5 py-3.5">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-slate-900">{task.title}</p>
                    {task.opportunity ? (
                      <p className="mt-0.5 truncate text-xs text-slate-500">{task.opportunity.title}</p>
                    ) : null}
                  </div>
                  <div className="flex shrink-0 flex-col items-end gap-1">
                    <Badge tone={taskTone[task.status] ?? "neutral"}>{titleCase(task.status)}</Badge>
                    {task.dueDate ? (
                      <span className="text-xs text-slate-400">
                        Due {task.dueDate.toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                      </span>
                    ) : null}
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <EmptyState
              icon="tasks"
              title="No open tasks"
              description="Execution items you create on deals will show up here."
            />
          )}
        </article>

        {/* Activity */}
        <article className="card">
          <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
            <div>
              <p className="eyebrow">Latest movement</p>
              <h2 className="mt-0.5 text-base font-semibold text-slate-900">Activity</h2>
            </div>
          </div>
          {activity.length > 0 ? (
            <ul className="px-5 py-2">
              {activity.map((entry, i) => (
                <li key={entry.id} className="flex gap-4 py-3">
                  <div className="flex flex-col items-center">
                    <span className="mt-1 h-2.5 w-2.5 shrink-0 rounded-full bg-brand-500 ring-4 ring-brand-50" />
                    {i < activity.length - 1 ? (
                      <span className="mt-1 w-px flex-1 bg-slate-200" />
                    ) : null}
                  </div>
                  <div className="min-w-0 pb-1">
                    <div className="flex items-baseline justify-between gap-3">
                      <p className="text-sm font-medium text-slate-900">{entry.eventLabel}</p>
                      <span className="shrink-0 text-xs text-slate-400">
                        {entry.createdAt.toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                      </span>
                    </div>
                    {entry.eventBody ? (
                      <p className="mt-0.5 text-sm text-slate-500">{entry.eventBody}</p>
                    ) : null}
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <EmptyState
              icon="activity"
              title="No activity yet"
              description="Deal movements and updates will be logged here as the team works."
            />
          )}
        </article>
      </section>
    </div>
  );
}

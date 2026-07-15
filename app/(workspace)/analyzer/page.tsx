import Link from "next/link";

import { EmptyState } from "@/components/empty-state";
import { PageHeader } from "@/components/page-header";
import { Badge } from "@/components/ui/badge";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { titleCase } from "@/lib/property-options";

export const dynamic = "force-dynamic";

function pct(value: number | null) {
  return value == null ? "—" : `${value}%`;
}

export default async function AnalyzerPage() {
  const user = await requireUser();

  const opportunities = await prisma.opportunity.findMany({
    where: { organizationId: user.organizationId },
    include: {
      property: { select: { name: true, assetType: true } },
    },
    orderBy: { updatedAt: "desc" },
  });

  // Map each opportunity → its active scenario's persisted result (the canonical
  // successor to opportunity.analysis). An opportunity is "analyzed" iff its active
  // scenario has a ScenarioResult.
  const underwritings = await prisma.underwriting.findMany({
    where: { organizationId: user.organizationId },
    select: { opportunityId: true, activeScenarioId: true },
  });
  const activeScenarioIds = underwritings.map((u) => u.activeScenarioId).filter((id): id is string => id != null);
  const resultRows = await prisma.scenarioResult.findMany({
    where: { organizationId: user.organizationId, scenarioId: { in: activeScenarioIds } },
    select: { scenarioId: true, capRate: true, noiAnnualUsd: true, dscr: true },
  });
  const resultByScenario = new Map(resultRows.map((r) => [r.scenarioId, r]));
  const resultByOpp = new Map<string, { capRate: number | null; noiAnnualUsd: number | null; dscr: number | null }>();
  for (const u of underwritings) {
    const r = u.activeScenarioId ? resultByScenario.get(u.activeScenarioId) : undefined;
    if (r) resultByOpp.set(u.opportunityId, r);
  }

  const analyzed = opportunities.filter((o) => resultByOpp.has(o.id));
  const needsAnalysis = opportunities.filter((o) => !resultByOpp.has(o.id));

  const header = (
    <PageHeader
      eyebrow="Underwriting"
      title="Deal Analyzer"
      description="Underwrite each opportunity — NOI, cap rate, DSCR, debt yield, and spread."
    />
  );

  if (opportunities.length === 0) {
    return (
      <div className="space-y-6">
        {header}
        <div className="card">
          <EmptyState
            icon="analyzer"
            title="No opportunities to analyze"
            description="Create an opportunity first, then underwrite it here."
            action={
              <Link className="btn-primary" href="/opportunities/new">
                New opportunity
              </Link>
            }
          />
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      {header}

      <section className="space-y-4">
        <div className="flex items-center gap-2">
          <h2 className="text-base font-semibold text-slate-900">Analyzed</h2>
          <Badge tone="brand">{analyzed.length}</Badge>
        </div>
        {analyzed.length > 0 ? (
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
            {analyzed.map((o) => {
              const r = resultByOpp.get(o.id)!;
              return (
              <Link key={o.id} href={`/analyzer/${o.id}`} className="card p-5 transition-shadow hover:shadow-md">
                <p className="truncate font-semibold text-slate-900">{o.title}</p>
                <p className="mt-0.5 truncate text-xs text-slate-500">
                  {o.property.name} · {titleCase(o.property.assetType)}
                </p>
                <div className="mt-4 grid grid-cols-3 gap-2 text-center">
                  <div>
                    <p className="text-[0.7rem] uppercase tracking-wide text-slate-400">Cap</p>
                    <p className="metric text-sm font-semibold text-slate-900">{pct(r.capRate)}</p>
                  </div>
                  <div>
                    <p className="text-[0.7rem] uppercase tracking-wide text-slate-400">NOI</p>
                    <p className="metric text-sm font-semibold text-slate-900">
                      {r.noiAnnualUsd != null ? new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", notation: "compact", maximumFractionDigits: 1 }).format(r.noiAnnualUsd) : "—"}
                    </p>
                  </div>
                  <div>
                    <p className="text-[0.7rem] uppercase tracking-wide text-slate-400">DSCR</p>
                    <p className="metric text-sm font-semibold text-slate-900">{r.dscr != null ? `${r.dscr}x` : "—"}</p>
                  </div>
                </div>
              </Link>
              );
            })}
          </div>
        ) : (
          <div className="card">
            <EmptyState icon="analyzer" title="No analyzed deals yet" description="Run analysis on an opportunity below to see its metrics here." />
          </div>
        )}
      </section>

      <section className="space-y-4">
        <div className="flex items-center gap-2">
          <h2 className="text-base font-semibold text-slate-900">Needs analysis</h2>
          <Badge tone="warning">{needsAnalysis.length}</Badge>
        </div>
        {needsAnalysis.length > 0 ? (
          <div className="card overflow-hidden">
            <ul className="divide-y divide-slate-100">
              {needsAnalysis.map((o) => (
                <li key={o.id} className="flex items-center justify-between gap-4 px-5 py-4">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-slate-900">{o.title}</p>
                    <p className="mt-0.5 truncate text-xs text-slate-500">
                      {o.property.name} · {titleCase(o.property.assetType)}
                    </p>
                  </div>
                  <Link className="btn-ghost shrink-0" href={`/analyzer/${o.id}/edit`}>
                    Run analysis
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        ) : (
          <p className="text-sm text-slate-500">Every opportunity has been analyzed.</p>
        )}
      </section>
    </div>
  );
}

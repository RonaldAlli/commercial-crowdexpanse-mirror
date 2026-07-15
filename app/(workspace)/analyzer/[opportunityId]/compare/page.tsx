import Link from "next/link";
import { notFound } from "next/navigation";

import { EmptyState } from "@/components/empty-state";
import { PageHeader } from "@/components/page-header";
import { requireUser } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { titleCase } from "@/lib/property-options";
import { getScenarioComparison } from "@/lib/underwriting";

export const dynamic = "force-dynamic";

function usd(value: number | null | undefined) {
  return value == null ? "—" : new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(value);
}
function pct(value: number | null | undefined) {
  return value == null ? "—" : `${value}%`;
}
function mult(value: number | null | undefined) {
  return value == null ? "—" : `${value}x`;
}

const STATUS_CLASS: Record<string, string> = {
  DRAFT: "bg-slate-50 text-slate-600 ring-slate-200",
  LOCKED: "bg-emerald-50 text-emerald-700 ring-emerald-200",
  SUPERSEDED: "bg-amber-50 text-amber-700 ring-amber-200",
};
const REC_LABEL: Record<string, string> = { PROCEED: "Proceed", PROCEED_WITH_CONDITIONS: "Proceed w/ conditions", PASS: "Pass" };
const DECISION_LABEL: Record<string, string> = { APPROVED: "Approved", DECLINED: "Declined", DEFERRED: "Deferred" };

type Scenario = Awaited<ReturnType<typeof getScenarioComparison>>[number];

export default async function ScenarioComparePage({ params }: { params: { opportunityId: string } }) {
  const user = await requireUser();
  if (!can(user.role, "READ", "UNDERWRITING")) notFound();

  const opportunity = await prisma.opportunity.findFirst({
    where: { id: params.opportunityId, organizationId: user.organizationId },
    include: { property: { select: { name: true, assetType: true } } },
  });
  if (!opportunity) notFound();

  const scenarios = await getScenarioComparison(user.organizationId, opportunity.id);

  const primary = (s: Scenario) => s.financingCases[0] ?? null;
  // Each row renders one metric across every version. Reads only persisted, independently-
  // computed values (Principle 5) — the comparison never recomputes or entangles them.
  const rows: { label: string; cell: (s: Scenario) => string }[] = [
    { label: "NOI", cell: (s) => usd(s.result?.noiAnnualUsd) },
    { label: "Cap rate", cell: (s) => pct(s.result?.capRate) },
    { label: "All-in cost", cell: (s) => usd(s.result?.allInCostUsd) },
    { label: "Spread", cell: (s) => usd(s.result?.spreadUsd) },
    { label: "Price / unit", cell: (s) => usd(s.result?.pricePerUnitUsd) },
    { label: "Expense ratio", cell: (s) => pct(s.result?.expenseRatioPct) },
    { label: "Primary case", cell: (s) => primary(s)?.label ?? "—" },
    { label: "DSCR (yr 1)", cell: (s) => mult(primary(s)?.result?.dscr ?? null) },
    { label: "Debt yield", cell: (s) => pct(primary(s)?.result?.debtYieldPct ?? null) },
    { label: "Levered IRR", cell: (s) => pct(primary(s)?.result?.leveredIrrPct ?? null) },
    { label: "Equity multiple", cell: (s) => mult(primary(s)?.result?.equityMultiple ?? null) },
    { label: "Suggested", cell: (s) => (s.recommendation ? REC_LABEL[s.recommendation.level] ?? s.recommendation.level : "—") },
    { label: "Decision", cell: (s) => (s.decisions[0] ? DECISION_LABEL[s.decisions[0].decision] ?? s.decisions[0].decision : "—") },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Underwriting"
        title={`Compare scenarios: ${opportunity.title}`}
        description={`${opportunity.property.name} · ${titleCase(opportunity.property.assetType)}`}
        actions={
          <Link className="btn-ghost" href={`/analyzer/${opportunity.id}`}>
            Back to analysis
          </Link>
        }
      />

      {scenarios.length === 0 ? (
        <div className="card">
          <EmptyState icon="analyzer" title="No scenarios yet" description="Underwrite this opportunity to create a scenario version." />
        </div>
      ) : (
        <article className="card p-6">
          <p className="eyebrow">Scenario versions</p>
          <p className="mt-1 text-xs text-slate-400">
            Every version is computed independently from its own frozen assumptions — comparing them is a read, never a recomputation
            (Calculation Principle 5).
          </p>
          <div className="mt-4 overflow-x-auto">
            <table className="w-full min-w-[560px] text-sm">
              <thead>
                <tr className="text-left text-xs text-slate-500">
                  <th className="py-2 pr-4 font-medium">Metric</th>
                  {scenarios.map((s) => (
                    <th key={s.id} className="px-3 py-2">
                      <div className="font-medium text-slate-700">{s.label}</div>
                      <span className={`mt-1 inline-flex rounded px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide ring-1 ring-inset ${STATUS_CLASS[s.status] ?? STATUS_CLASS.DRAFT}`}>
                        {s.status.toLowerCase()}
                      </span>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {rows.map((row) => (
                  <tr key={row.label}>
                    <td className="py-2 pr-4 text-xs text-slate-500">{row.label}</td>
                    {scenarios.map((s) => (
                      <td key={s.id} className="metric px-3 py-2 text-slate-900">
                        {row.cell(s)}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </article>
      )}
    </div>
  );
}

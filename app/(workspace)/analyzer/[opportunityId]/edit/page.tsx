import Link from "next/link";
import { notFound } from "next/navigation";

import { AnalysisForm } from "@/components/analysis-form";
import { PageHeader } from "@/components/page-header";
import { requireUser } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { getActiveScenarioResult } from "@/lib/underwriting";
import type { AssumptionKey } from "@/lib/underwriting/assumptions";

import { saveAnalysis } from "../../actions";

export const dynamic = "force-dynamic";

function usd(value: number | null) {
  return value == null ? "—" : new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(value);
}

export default async function EditAnalysisPage({ params }: { params: { opportunityId: string } }) {
  const user = await requireUser();
  if (!can(user.role, "UPDATE", "UNDERWRITING")) notFound();

  const opportunity = await prisma.opportunity.findFirst({
    where: { id: params.opportunityId, organizationId: user.organizationId },
    include: {
      property: { select: { name: true, unitCount: true, estimatedValueUsd: true } },
    },
  });

  if (!opportunity) {
    notFound();
  }

  const scenario = await getActiveScenarioResult(user.organizationId, opportunity.id);
  const a = new Map<AssumptionKey, number>();
  for (const row of scenario?.assumptions ?? []) a.set(row.key as AssumptionKey, row.valueNumeric.toNumber());
  const val = (k: AssumptionKey): number | null => (a.has(k) ? (a.get(k) as number) : null);

  const action = saveAnalysis.bind(null, opportunity.id);
  const existed = scenario != null;

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <PageHeader
        eyebrow="Underwriting"
        title={`${existed ? "Edit analysis" : "Run analysis"}: ${opportunity.title}`}
        description={`${opportunity.property.name} · price/unit uses ${opportunity.property.unitCount ?? "—"} units · spread uses estimated value ${usd(opportunity.property.estimatedValueUsd)}`}
      />
      <div className="card p-6">
        <AnalysisForm
          action={action}
          values={
            existed
              ? {
                  purchasePriceUsd: val("PURCHASE_PRICE"),
                  renovationBudgetUsd: val("RENOVATION_BUDGET"),
                  closingCostsUsd: val("CLOSING_COSTS"),
                  grossIncomeAnnualUsd: val("GROSS_INCOME"),
                  operatingExpensesUsd: val("OPERATING_EXPENSES"),
                  loanAmountUsd: val("LOAN_AMOUNT"),
                  interestRatePct: val("INTEREST_RATE"),
                  amortizationYears: val("AMORTIZATION_YEARS"),
                  targetLtvPct: val("TARGET_LTV_PCT"),
                  targetLtcPct: val("TARGET_LTC_PCT"),
                  minDscr: val("MIN_DSCR"),
                  lines: (scenario?.lineItems ?? []).map((l) => ({
                    kind: l.kind,
                    category: l.category,
                    amountAnnualUsd: l.amountAnnualUsd.toNumber(),
                  })),
                  analystSummary: scenario?.analystSummary ?? null,
                }
              : undefined
          }
          submitLabel={existed ? "Save analysis" : "Create analysis"}
          cancelHref={existed ? `/analyzer/${opportunity.id}` : "/analyzer"}
        />
      </div>
      <p className="text-center text-sm text-slate-400">
        <Link href="/analyzer" className="hover:text-slate-600">
          ← Back to analyzer
        </Link>
      </p>
    </div>
  );
}

import Link from "next/link";
import { notFound } from "next/navigation";

import { AnalysisForm } from "@/components/analysis-form";
import { PageHeader } from "@/components/page-header";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

import { saveAnalysis } from "../../actions";

export const dynamic = "force-dynamic";

function usd(value: number | null) {
  return value == null ? "—" : new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(value);
}

export default async function EditAnalysisPage({ params }: { params: { opportunityId: string } }) {
  const user = await requireUser();

  const opportunity = await prisma.opportunity.findFirst({
    where: { id: params.opportunityId, organizationId: user.organizationId },
    include: {
      property: { select: { name: true, unitCount: true, estimatedValueUsd: true } },
      analysis: true,
    },
  });

  if (!opportunity) {
    notFound();
  }

  const a = opportunity.analysis;
  const action = saveAnalysis.bind(null, opportunity.id);

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <PageHeader
        eyebrow="Underwriting"
        title={`${a ? "Edit analysis" : "Run analysis"}: ${opportunity.title}`}
        description={`${opportunity.property.name} · price/unit uses ${opportunity.property.unitCount ?? "—"} units · spread uses estimated value ${usd(opportunity.property.estimatedValueUsd)}`}
      />
      <div className="card p-6">
        <AnalysisForm
          action={action}
          values={
            a
              ? {
                  purchasePriceUsd: a.purchasePriceUsd,
                  renovationBudgetUsd: a.renovationBudgetUsd,
                  closingCostsUsd: a.closingCostsUsd,
                  grossIncomeAnnualUsd: a.grossIncomeAnnualUsd,
                  operatingExpensesUsd: a.operatingExpensesUsd,
                  loanAmountUsd: a.loanAmountUsd,
                  interestRatePct: a.interestRatePct,
                  amortizationYears: a.amortizationYears,
                  analystSummary: a.analystSummary,
                }
              : undefined
          }
          submitLabel={a ? "Save analysis" : "Create analysis"}
          cancelHref={a ? `/analyzer/${opportunity.id}` : "/analyzer"}
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

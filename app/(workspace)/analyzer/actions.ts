"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { requireUser } from "@/lib/auth";
import { checkAuthorized, GENERIC_DENIAL } from "@/lib/authorize";
import { computeAnalysis } from "@/lib/analysis";
import { prisma } from "@/lib/prisma";

export type AnalysisFormState = { error?: string } | undefined;

function intOrNull(raw: string) {
  const cleaned = raw.replace(/[,$%\s]/g, "");
  if (!cleaned) return null;
  const n = Number.parseInt(cleaned, 10);
  return Number.isFinite(n) ? n : null;
}

function floatOrNull(raw: string) {
  const cleaned = raw.replace(/[,$%\s]/g, "");
  if (!cleaned) return null;
  const n = Number.parseFloat(cleaned);
  return Number.isFinite(n) ? n : null;
}

function orNull(value: string) {
  return value.length ? value : null;
}

export async function saveAnalysis(
  opportunityId: string,
  _prev: AnalysisFormState,
  formData: FormData,
): Promise<AnalysisFormState> {
  const user = await requireUser();
  if (!(await checkAuthorized(user, "UPDATE", "DEAL_ANALYSIS", { opportunityId }))) {
    return { error: GENERIC_DENIAL };
  }

  // Org-scope through the opportunity, and pull property context for the math.
  const opportunity = await prisma.opportunity.findFirst({
    where: { id: opportunityId, organizationId: user.organizationId },
    include: {
      property: { select: { id: true, unitCount: true, estimatedValueUsd: true } },
      analysis: { select: { id: true } },
    },
  });
  if (!opportunity) return { error: "Opportunity not found." };

  const str = (key: string) => String(formData.get(key) ?? "").trim();

  const purchasePriceUsd = intOrNull(str("purchasePriceUsd"));
  if (purchasePriceUsd == null || purchasePriceUsd <= 0) {
    return { error: "Purchase price is required and must be greater than zero." };
  }

  const inputs = {
    purchasePriceUsd,
    renovationBudgetUsd: intOrNull(str("renovationBudgetUsd")),
    closingCostsUsd: intOrNull(str("closingCostsUsd")),
    grossIncomeAnnualUsd: intOrNull(str("grossIncomeAnnualUsd")),
    operatingExpensesUsd: intOrNull(str("operatingExpensesUsd")),
    loanAmountUsd: intOrNull(str("loanAmountUsd")),
    interestRatePct: floatOrNull(str("interestRatePct")),
    amortizationYears: intOrNull(str("amortizationYears")),
  };

  const metrics = computeAnalysis({
    ...inputs,
    unitCount: opportunity.property.unitCount,
    estimatedValueUsd: opportunity.property.estimatedValueUsd,
  });

  const data = {
    ...inputs,
    noiAnnualUsd: metrics.noiAnnualUsd,
    capRate: metrics.capRate,
    dscr: metrics.dscr,
    debtYield: metrics.debtYieldPct,
    pricePerUnitUsd: metrics.pricePerUnitUsd,
    analystSummary: orNull(str("analystSummary")),
  };

  const existed = opportunity.analysis != null;

  await prisma.dealAnalysis.upsert({
    where: { opportunityId: opportunity.id },
    update: data,
    create: {
      organizationId: user.organizationId,
      propertyId: opportunity.property.id,
      opportunityId: opportunity.id,
      ...data,
    },
  });

  await prisma.activityLog.create({
    data: {
      organizationId: user.organizationId,
      opportunityId: opportunity.id,
      propertyId: opportunity.property.id,
      actorId: user.id,
      eventType: existed ? "analysis.updated" : "analysis.created",
      eventLabel: `${existed ? "Analysis updated" : "Analysis created"}: ${opportunity.title}`,
      eventBody: metrics.capRate != null ? `Cap rate ${metrics.capRate}%` : null,
    },
  });

  revalidatePath("/analyzer");
  revalidatePath(`/analyzer/${opportunity.id}`);
  revalidatePath("/dashboard");
  redirect(`/analyzer/${opportunity.id}`);
}

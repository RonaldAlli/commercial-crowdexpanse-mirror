"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { requireUser } from "@/lib/auth";
import { checkAuthorized, GENERIC_DENIAL } from "@/lib/authorize";
import { prisma } from "@/lib/prisma";
import { saveAnalyzerScenario } from "@/lib/underwriting";
import type { AssumptionKey } from "@/lib/underwriting/assumptions";

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
  if (!(await checkAuthorized(user, "UPDATE", "UNDERWRITING", { opportunityId }))) {
    return { error: GENERIC_DENIAL };
  }

  // Org-scope through the opportunity. Property context is no longer read here —
  // it is snapshotted as SEEDED assumptions inside the underwriting service.
  const opportunity = await prisma.opportunity.findFirst({
    where: { id: opportunityId, organizationId: user.organizationId },
    include: { property: { select: { id: true } } },
  });
  if (!opportunity) return { error: "Opportunity not found." };

  const str = (key: string) => String(formData.get(key) ?? "").trim();

  const purchasePriceUsd = intOrNull(str("purchasePriceUsd"));
  if (purchasePriceUsd == null || purchasePriceUsd <= 0) {
    return { error: "Purchase price is required and must be greater than zero." };
  }

  // Map the form to the MANUAL assumption set (the 8 analyst-authored inputs).
  const manual: { key: AssumptionKey; value: number | null }[] = [
    { key: "PURCHASE_PRICE", value: purchasePriceUsd },
    { key: "RENOVATION_BUDGET", value: intOrNull(str("renovationBudgetUsd")) },
    { key: "CLOSING_COSTS", value: intOrNull(str("closingCostsUsd")) },
    { key: "GROSS_INCOME", value: intOrNull(str("grossIncomeAnnualUsd")) },
    { key: "OPERATING_EXPENSES", value: intOrNull(str("operatingExpensesUsd")) },
    { key: "LOAN_AMOUNT", value: intOrNull(str("loanAmountUsd")) },
    { key: "INTEREST_RATE", value: floatOrNull(str("interestRatePct")) },
    { key: "AMORTIZATION_YEARS", value: intOrNull(str("amortizationYears")) },
    // Debt-sizing constraints (3b-i) — optional; not kernel inputs.
    { key: "TARGET_LTV_PCT", value: floatOrNull(str("targetLtvPct")) },
    { key: "TARGET_LTC_PCT", value: floatOrNull(str("targetLtcPct")) },
    { key: "MIN_DSCR", value: floatOrNull(str("minDscr")) },
  ];

  // Optional income/expense schedule (3b-ii). The client serializes rows to JSON; a
  // present-but-empty array clears the schedule. Unparseable input leaves it untouched.
  let lines: { kind: "INCOME" | "EXPENSE"; category: string; amountAnnualUsd: number }[] | undefined;
  const scheduleRaw = str("scheduleJson");
  if (scheduleRaw) {
    try {
      const parsed: unknown = JSON.parse(scheduleRaw);
      if (Array.isArray(parsed)) {
        lines = parsed
          .filter(
            (l): l is { kind: "INCOME" | "EXPENSE"; category: string; amountAnnualUsd: number } =>
              !!l &&
              (l.kind === "INCOME" || l.kind === "EXPENSE") &&
              typeof l.category === "string" &&
              l.category.trim().length > 0 &&
              Number.isFinite(Number(l.amountAnnualUsd)),
          )
          .map((l) => ({ kind: l.kind, category: l.category.trim().slice(0, 120), amountAnnualUsd: Math.round(Number(l.amountAnnualUsd)) }));
      }
    } catch {
      lines = undefined;
    }
  }

  const existed = (await prisma.underwriting.findUnique({ where: { opportunityId: opportunity.id } })) != null;

  const { result } = await saveAnalyzerScenario(user.organizationId, opportunity.id, manual, {
    createdByUserId: user.id,
    analystSummary: orNull(str("analystSummary")),
    lines,
  });

  await prisma.activityLog.create({
    data: {
      organizationId: user.organizationId,
      opportunityId: opportunity.id,
      propertyId: opportunity.property.id,
      actorId: user.id,
      eventType: existed ? "analysis.updated" : "analysis.created",
      eventLabel: `${existed ? "Analysis updated" : "Analysis created"}: ${opportunity.title}`,
      eventBody: result.capRate != null ? `Cap rate ${result.capRate}%` : null,
    },
  });

  revalidatePath("/analyzer");
  revalidatePath(`/analyzer/${opportunity.id}`);
  revalidatePath("/dashboard");
  redirect(`/analyzer/${opportunity.id}`);
}

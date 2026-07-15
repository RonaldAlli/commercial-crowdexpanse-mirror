"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { requireUser } from "@/lib/auth";
import { checkAuthorized, GENERIC_DENIAL } from "@/lib/authorize";
import { prisma } from "@/lib/prisma";
import { saveAnalyzerScenario, type FinancingCaseEntry } from "@/lib/underwriting";
import type { AssumptionKey } from "@/lib/underwriting/assumptions";
import type { SensitivityMetric, SensitivitySpec } from "@/lib/underwriting/sensitivity";

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

  // Map the form to the OPERATING MANUAL assumption set. Capital (loan/rate/amort +
  // sizing) is no longer here — it lives on the FinancingCase (3b-iii, CF-1).
  const manual: { key: AssumptionKey; value: number | null }[] = [
    { key: "PURCHASE_PRICE", value: purchasePriceUsd },
    { key: "RENOVATION_BUDGET", value: intOrNull(str("renovationBudgetUsd")) },
    { key: "CLOSING_COSTS", value: intOrNull(str("closingCostsUsd")) },
    { key: "GROSS_INCOME", value: intOrNull(str("grossIncomeAnnualUsd")) },
    { key: "OPERATING_EXPENSES", value: intOrNull(str("operatingExpensesUsd")) },
    // Projection assumptions (3b-iii) — operating, financing-independent.
    { key: "INCOME_GROWTH_PCT", value: floatOrNull(str("incomeGrowthPct")) },
    { key: "EXPENSE_GROWTH_PCT", value: floatOrNull(str("expenseGrowthPct")) },
    { key: "HOLD_YEARS", value: intOrNull(str("holdYears")) },
    // Exit assumptions (3b-iv) — operating, financing-independent.
    { key: "EXIT_CAP_RATE_PCT", value: floatOrNull(str("exitCapRatePct")) },
    { key: "SELLING_COSTS_PCT", value: floatOrNull(str("sellingCostsPct")) },
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

  // Optional financing cases (3b-iii). Client serializes rows to JSON; a present-
  // but-empty array clears all cases. Only capital keys are carried; a case may be
  // all-cash (no capital) — a valid unlevered structure.
  let financingCases: FinancingCaseEntry[] | undefined;
  const capNum = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : null);
  // Per-case sensitivity spec (3b-v). Coerced from the serialized case; incomplete
  // drafts (metric/axis/bounds not all filled) attach no analysis. The service
  // re-validates against the authoritative allow-lists (UW-6).
  const parseSensitivity = (raw: unknown): SensitivitySpec | null => {
    if (!raw || typeof raw !== "object") return null;
    const s = raw as Record<string, unknown>;
    if (typeof s.targetMetric !== "string" || !s.targetMetric || typeof s.xKey !== "string" || !s.xKey) return null;
    const xMin = capNum(s.xMin);
    const xMax = capNum(s.xMax);
    const xSteps = capNum(s.xSteps);
    if (xMin == null || xMax == null || xSteps == null) return null;
    const hasY = typeof s.yKey === "string" && s.yKey.length > 0;
    const ySteps = hasY ? capNum(s.ySteps) : null;
    return {
      targetMetric: s.targetMetric as SensitivityMetric,
      xKey: s.xKey as AssumptionKey,
      xMin,
      xMax,
      xSteps: Math.round(xSteps),
      yKey: hasY ? (s.yKey as AssumptionKey) : null,
      yMin: hasY ? capNum(s.yMin) : null,
      yMax: hasY ? capNum(s.yMax) : null,
      ySteps: ySteps == null ? null : Math.round(ySteps),
    };
  };
  const fcRaw = str("financingCasesJson");
  if (fcRaw) {
    try {
      const parsed: unknown = JSON.parse(fcRaw);
      if (Array.isArray(parsed)) {
        financingCases = parsed
          .filter((c): c is Record<string, unknown> => !!c && typeof c === "object")
          .map((c) => ({
            label: String(c.label ?? "Financing").trim().slice(0, 120) || "Financing",
            capital: (
              [
                { key: "LOAN_AMOUNT" as const, value: capNum(c.loanAmountUsd) },
                { key: "INTEREST_RATE" as const, value: capNum(c.interestRatePct) },
                { key: "AMORTIZATION_YEARS" as const, value: capNum(c.amortizationYears) },
                { key: "TARGET_LTV_PCT" as const, value: capNum(c.targetLtvPct) },
                { key: "TARGET_LTC_PCT" as const, value: capNum(c.targetLtcPct) },
                { key: "MIN_DSCR" as const, value: capNum(c.minDscr) },
              ] as { key: AssumptionKey; value: number | null }[]
            ).filter((x) => x.value != null),
            sensitivity: parseSensitivity(c.sensitivity),
          }));
      }
    } catch {
      financingCases = undefined;
    }
  }

  const existed = (await prisma.underwriting.findUnique({ where: { opportunityId: opportunity.id } })) != null;

  let result;
  try {
    ({ result } = await saveAnalyzerScenario(user.organizationId, opportunity.id, manual, {
      createdByUserId: user.id,
      analystSummary: orNull(str("analystSummary")),
      lines,
      financingCases,
    }));
  } catch (e) {
    // Surface an engine-level validation error (e.g. an invalid sensitivity spec)
    // as a form message rather than an unhandled crash.
    return { error: e instanceof Error ? e.message : "Could not save the analysis." };
  }

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

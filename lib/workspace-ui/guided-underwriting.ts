// CRE Operating Workspace — UI Milestone 2, Increment 1: Guided Underwriting (Scenario Result Workspace).
//
// PURE PRESENTATION LOGIC ONLY — deterministic, no data access, no clock/random, no calculation. It maps
// ALREADY-PERSISTED underwriting outputs (the ScenarioResult / ScenarioRecommendation / ScenarioFinding /
// primary FinancingCaseResult returned by getActiveScenarioResult) into an operator-facing view that answers
// the workspace question: "Can we structure this deal?".
//
// BOUNDARIES (Increment 1): read-only. It NEVER recomputes a metric, synthesizes a recommendation, performs
// missing-assumption synthesis (Increment 2), or surfaces decision history / decision contrast (Increment 3).
// The structurability verdict is a 1:1 PRESENTATION MAPPING of the existing engine RecommendationLevel; when
// none is persisted it is honestly "Not yet assessed" — never fabricated. The primary constraint is simply
// the top decisive finding already produced by the engine. `/analyzer/[opportunityId]` remains authoritative
// for advanced work; this view only points to it.

import { usd } from "@/lib/workspace-ui/opportunity-view";

export type RecommendationLevel = "PROCEED" | "PROCEED_WITH_CONDITIONS" | "PASS";
export type FindingSeverity = "INFO" | "WARNING" | "CRITICAL";
export type StructurableVerdict = "yes" | "conditional" | "no" | "not-assessed";

export type GuidedFindingInput = {
  severity: FindingSeverity;
  decisive: boolean;
  title: string;
  detail: string;
  position: number;
};

export type GuidedScenarioInput = {
  label: string;
  version: number;
  status: string; // DRAFT | LOCKED | SUPERSEDED (Observed, presented verbatim)
  scenarioVersion: string;
  recommendationLevel: RecommendationLevel | null;
  result: { noiAnnualUsd: number | null; capRate: number | null; pricePerUnitUsd: number | null } | null;
  primaryFinancing: { dscr: number | null; sizedLoanUsd: number | null; leveredIrrPct: number | null } | null;
  findings: GuidedFindingInput[];
};

export type GuidedUnderwritingInput = {
  opportunityName: string;
  propertyLabel: string | null;
  scenario: GuidedScenarioInput | null; // null = no active underwriting scenario for this opportunity
};

export type StructurabilityView = {
  verdict: StructurableVerdict;
  label: string; // "Yes" | "Conditional" | "No" | "Not yet assessed"
  srLabel: string; // full sentence — meaning never depends on color alone
  toneClass: string;
  /** The existing engine recommendation label, or null when none is persisted. Presentation of an output. */
  recommendation: string | null;
};

export type PrimaryConstraintView = { title: string; detail: string; severityLabel: string } | null;

export type MetricView = { label: string; value: string; available: boolean };

export type GuidedUnderwritingView =
  | { state: "no-underwriting" }
  | {
      state: "present";
      observed: { opportunity: string; property: string; scenarioLabel: string; version: string; status: string };
      structurability: StructurabilityView;
      primaryConstraint: PrimaryConstraintView;
      metrics: MetricView[];
    };

const SEVERITY_RANK: Record<FindingSeverity, number> = { CRITICAL: 3, WARNING: 2, INFO: 1 };
const SEVERITY_LABEL: Record<FindingSeverity, string> = { CRITICAL: "Critical", WARNING: "Warning", INFO: "Info" };

const VERDICT: Record<RecommendationLevel, { verdict: StructurableVerdict; label: string; tone: string; rec: string }> = {
  PROCEED: { verdict: "yes", label: "Yes", tone: "bg-emerald-50 text-emerald-800 ring-emerald-200", rec: "Proceed" },
  PROCEED_WITH_CONDITIONS: { verdict: "conditional", label: "Conditional", tone: "bg-amber-50 text-amber-800 ring-amber-200", rec: "Proceed with conditions" },
  PASS: { verdict: "no", label: "No", tone: "bg-rose-50 text-rose-800 ring-rose-200", rec: "Pass" },
};

/** Format a percent-valued number (stored as e.g. 6.2 = 6.2%). Pure. */
export function pct(v: number | null | undefined): string {
  return v == null ? "Not available" : `${v.toFixed(1)}%`;
}
/** Format a DSCR-style ratio (1.35 -> "1.35×"). Pure. */
export function ratio(v: number | null | undefined): string {
  return v == null ? "Not available" : `${v.toFixed(2)}×`;
}
function money(v: number | null | undefined): string {
  return v == null ? "Not available" : usd(v);
}

/** Map the persisted engine recommendation to the operator's structurability verdict. Never fabricates. */
export function structurabilityOf(level: RecommendationLevel | null): StructurabilityView {
  if (level == null) {
    return {
      verdict: "not-assessed",
      label: "Not yet assessed",
      srLabel: "Structurability: not yet assessed — the underwriting engine has not produced a recommendation for this scenario.",
      toneClass: "bg-slate-100 text-slate-600 ring-slate-200",
      recommendation: null,
    };
  }
  const m = VERDICT[level];
  return {
    verdict: m.verdict,
    label: m.label,
    srLabel: `Structurable: ${m.label}. Based on the underwriting engine recommendation "${m.rec}".`,
    toneClass: m.tone,
    recommendation: m.rec,
  };
}

/** The single most important existing decisive finding, or null. Presentation of an existing output. */
export function primaryConstraintOf(findings: GuidedFindingInput[]): PrimaryConstraintView {
  const decisive = findings.filter((f) => f.decisive);
  if (decisive.length === 0) return null;
  const top = [...decisive].sort(
    (a, b) => SEVERITY_RANK[b.severity] - SEVERITY_RANK[a.severity] || a.position - b.position,
  )[0];
  // INFO findings are not constraints — they are positive/neutral notes; only surface WARNING/CRITICAL.
  if (top.severity === "INFO") return null;
  return { title: top.title, detail: top.detail, severityLabel: SEVERITY_LABEL[top.severity] };
}

/** Deterministic, read-only operator view of an opportunity's active underwriting scenario. */
export function buildGuidedUnderwritingView(input: GuidedUnderwritingInput): GuidedUnderwritingView {
  const s = input.scenario;
  if (!s) return { state: "no-underwriting" };

  const r = s.result;
  const f = s.primaryFinancing;
  const metrics: MetricView[] = [
    { label: "NOI (annual)", value: money(r?.noiAnnualUsd ?? null), available: r?.noiAnnualUsd != null },
    { label: "Cap rate", value: pct(r?.capRate ?? null), available: r?.capRate != null },
    { label: "DSCR", value: ratio(f?.dscr ?? null), available: f?.dscr != null },
    { label: "Sized debt", value: money(f?.sizedLoanUsd ?? null), available: f?.sizedLoanUsd != null },
    { label: "Levered IRR (exit)", value: pct(f?.leveredIrrPct ?? null), available: f?.leveredIrrPct != null },
  ];

  return {
    state: "present",
    observed: {
      opportunity: input.opportunityName,
      property: input.propertyLabel ?? "Not available",
      scenarioLabel: s.label,
      version: `v${s.version}`,
      status: s.status,
    },
    structurability: structurabilityOf(s.recommendationLevel),
    primaryConstraint: primaryConstraintOf(s.findings),
    metrics,
  };
}

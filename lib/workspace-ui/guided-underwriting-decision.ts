// CRE Operating Workspace — UI Milestone 2, Increment 3: Decision Contrast + Approval History (read-first).
//
// PURE PRESENTATION LOGIC ONLY — deterministic, no data access, no clock/random, no calculation. Answers the
// operator's third question — "Why does the engine recommend this, and what decision history already exists?"
// — by presenting ONLY already-persisted records: the engine recommendation, the findings behind it, and the
// human decision history. It records nothing, approves nothing, and reinterprets nothing.
//
// CONTRAST STATUS is derived from the records alone (no inference of intent, no correctness judgement):
//   • no decision records .......................... "Awaiting decision"
//   • latest decision APPROVED + engine positive ... "Agreement"   (engine positive = PROCEED / PROCEED_WITH_CONDITIONS)
//   • latest decision DECLINED + engine PASS ....... "Agreement"
//   • latest decision opposes the engine ........... "Override"
//   • latest decision DEFERRED ..................... "Deferred" (a recorded hold — not a proceed/decline)
//   • no engine level to compare against ........... "Recorded" (indeterminate, stated honestly)
// The engine level used is the one the decision itself captured (suggestedLevel), falling back to the current
// persisted recommendation — both existing records.

export type RecommendationLevel = "PROCEED" | "PROCEED_WITH_CONDITIONS" | "PASS";
export type DecisionLevel = "APPROVED" | "DECLINED" | "DEFERRED";
export type ContrastStatus = "agreement" | "override" | "awaiting-decision" | "deferred" | "recorded";

const REC_LABEL: Record<RecommendationLevel, string> = {
  PROCEED: "Proceed",
  PROCEED_WITH_CONDITIONS: "Proceed with conditions",
  PASS: "Pass",
};
const DECISION_LABEL: Record<DecisionLevel, string> = { APPROVED: "Approved", DECLINED: "Declined", DEFERRED: "Deferred" };
const SEVERITY_LABEL: Record<string, string> = { CRITICAL: "Critical", WARNING: "Warning", INFO: "Info" };

export type DecisionRecordInput = {
  decision: DecisionLevel;
  suggestedLevel: RecommendationLevel | null; // the engine's recommendation captured at decision time
  rationale: string;
  actor: string | null; // resolved display name/email, or null when not available
  at: string; // ISO timestamp
  sequence: number;
};
export type FindingInput = { severity: string; title: string; detail: string; position: number };

export type GuidedDecisionInput = {
  hasScenario: boolean;
  recommendationLevel: RecommendationLevel | null;
  findings: FindingInput[];
  decisions: DecisionRecordInput[]; // as persisted (sequence desc)
};

export type ContrastView = { status: ContrastStatus; label: string; srLabel: string; toneClass: string };
export type FindingView = { severityLabel: string; title: string; detail: string };
export type DecisionView = { decisionLabel: string; at: string; actor: string | null; rationale: string; engineSuggested: string | null };

export type GuidedDecisionView =
  | { state: "no-underwriting" }
  | {
      state: "present";
      engineRecommendation: { level: RecommendationLevel | null; label: string | null };
      contrast: ContrastView;
      findings: FindingView[];
      decisions: DecisionView[];
    };

const CONTRAST: Record<ContrastStatus, { label: string; srLabel: string; tone: string }> = {
  agreement: { label: "Agreement", srLabel: "The human decision agrees with the engine recommendation.", tone: "bg-emerald-50 text-emerald-800 ring-emerald-200" },
  override: { label: "Override", srLabel: "The human decision differs from the engine recommendation.", tone: "bg-amber-50 text-amber-800 ring-amber-200" },
  "awaiting-decision": { label: "Awaiting decision", srLabel: "No human decision has been recorded yet.", tone: "bg-slate-100 text-slate-600 ring-slate-200" },
  deferred: { label: "Deferred", srLabel: "The latest human decision is a recorded deferral — neither proceed nor decline.", tone: "bg-slate-100 text-slate-600 ring-slate-200" },
  recorded: { label: "Decision recorded", srLabel: "A decision exists but there is no engine recommendation to compare against.", tone: "bg-slate-100 text-slate-600 ring-slate-200" },
};

const isEnginePositive = (l: RecommendationLevel) => l === "PROCEED" || l === "PROCEED_WITH_CONDITIONS";

/** Derive the contrast status from the latest persisted decision + the engine level it captured. Pure. */
export function contrastStatusOf(recommendationLevel: RecommendationLevel | null, decisions: DecisionRecordInput[]): ContrastStatus {
  if (decisions.length === 0) return "awaiting-decision";
  const latest = decisions[0]; // input is sequence desc
  if (latest.decision === "DEFERRED") return "deferred";
  const engineLevel = latest.suggestedLevel ?? recommendationLevel;
  if (!engineLevel) return "recorded";
  const positive = isEnginePositive(engineLevel);
  const aligned = (positive && latest.decision === "APPROVED") || (!positive && latest.decision === "DECLINED");
  return aligned ? "agreement" : "override";
}

export function buildGuidedDecisionView(input: GuidedDecisionInput): GuidedDecisionView {
  if (!input.hasScenario) return { state: "no-underwriting" };

  const status = contrastStatusOf(input.recommendationLevel, input.decisions);
  const c = CONTRAST[status];

  return {
    state: "present",
    engineRecommendation: {
      level: input.recommendationLevel,
      label: input.recommendationLevel ? REC_LABEL[input.recommendationLevel] : null,
    },
    contrast: { status, label: c.label, srLabel: c.srLabel, toneClass: c.tone },
    // Findings kept in their PERSISTED order (position) — never reordered by an invented priority.
    findings: [...input.findings]
      .sort((a, b) => a.position - b.position)
      .map((f) => ({ severityLabel: SEVERITY_LABEL[f.severity] ?? f.severity, title: f.title, detail: f.detail })),
    // Decision history as persisted (sequence desc = most recent first).
    decisions: input.decisions.map((d) => ({
      decisionLabel: DECISION_LABEL[d.decision] ?? d.decision,
      at: d.at.slice(0, 10),
      actor: d.actor,
      rationale: d.rationale,
      engineSuggested: d.suggestedLevel ? REC_LABEL[d.suggestedLevel] : null,
    })),
  };
}

// CRE Operating Workspace — UI Milestone 1, Increment 1 (presentational primitives).
//
// UI evidence model: Recommendation -> Supporting evidence -> Missing evidence -> Confidence -> Next action.
// PRESENTATION LOGIC ONLY — pure, deterministic, no data access, no clock/random. It does NOT compute
// recommendations or infer evidence from domain records (that is later-increment synthesis). It only
// derives an honest VIEW of an already-assembled evidence chain, and NEVER fabricates a value: absent
// confidence renders "Not yet scored", an absent recommendation renders "No recommendation available",
// and an uncertain next action renders a neutral review state rather than false certainty.

export type Confidence = "high" | "medium" | "low";

export type EvidenceItem = {
  /** What the fact is (e.g., "Qualification checklist complete"). */
  label: string;
  /** True when the supporting fact is present; false marks it visibly as missing. */
  present: boolean;
};

export type EvidenceChainInput = {
  /** The recommendation text, or null when none is available. */
  recommendation: string | null;
  /** Supporting facts; each carries its own present/missing flag. */
  supporting: EvidenceItem[];
  /** Named missing facts that would raise confidence. */
  missing: string[];
  /** Confidence, or null when there is no basis to score it. */
  confidence: Confidence | null;
  /**
   * The single next action. `null` = none; `{ review: true }` = uncertain -> neutral review prompt;
   * `{ label }` = an actionable step.
   */
  nextAction: { label: string } | { review: true } | null;
};

export type EvidenceChainView = {
  recommendation: { state: "present"; text: string } | { state: "none"; text: string };
  supporting: Array<{ label: string; state: "present" | "missing" }>;
  missing: string[];
  confidence:
    | { state: "scored"; level: Confidence; label: string }
    | { state: "not-scored"; label: string };
  nextAction:
    | { state: "actionable"; label: string }
    | { state: "review"; label: string }
    | { state: "none"; label: string };
};

const CONFIDENCE_LABEL: Record<Confidence, string> = { high: "High", medium: "Medium", low: "Low" };
const NOT_SCORED = "Not yet scored";
const NO_RECOMMENDATION = "No recommendation available";
const REVIEW = "Review — not enough certainty to recommend a step";
const NO_NEXT_ACTION = "No next action";

/**
 * Derive an honest, deterministic view of an evidence chain. Same input -> same output. Never invents a
 * confidence, a recommendation, or a next action.
 */
export function deriveEvidenceView(input: EvidenceChainInput): EvidenceChainView {
  const recommendation =
    input.recommendation && input.recommendation.trim() !== ""
      ? ({ state: "present", text: input.recommendation } as const)
      : ({ state: "none", text: NO_RECOMMENDATION } as const);

  const supporting = input.supporting.map((item) => ({
    label: item.label,
    state: item.present ? ("present" as const) : ("missing" as const),
  }));

  const confidence =
    input.confidence === null
      ? ({ state: "not-scored", label: NOT_SCORED } as const)
      : ({ state: "scored", level: input.confidence, label: CONFIDENCE_LABEL[input.confidence] } as const);

  let nextAction: EvidenceChainView["nextAction"];
  if (input.nextAction === null) nextAction = { state: "none", label: NO_NEXT_ACTION };
  else if ("review" in input.nextAction) nextAction = { state: "review", label: REVIEW };
  else nextAction = { state: "actionable", label: input.nextAction.label };

  return { recommendation, supporting, missing: input.missing.slice(), confidence, nextAction };
}

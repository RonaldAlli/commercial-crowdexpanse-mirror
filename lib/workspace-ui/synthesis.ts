// CRE Operating Workspace — UI M1 Increment 5: Next Best Action + Missing Information synthesis.
//
// The first genuinely-new-logic layer. DETERMINISTIC, PURE, EXPLAINABLE, REPRODUCIBLE synthesis over
// ONLY existing governed facts. No AI, no probabilistic inference, no numeric score, no clock/random
// (any "now" is injected), no mutation, no new source of truth. Recommendations ADVISE; existing
// workflows (stage policy, promotion rules, comms gates, authority) DECIDE. Every recommendation is
// explained through the Increment-1 Evidence Chain and never appears without its supporting evidence;
// certainty is never fabricated.

import type { ContactOutreachStatus } from "@prisma/client";

import type { EvidenceChainInput } from "@/lib/workspace-ui/evidence";
import type { MissingInfoState } from "@/lib/workspace-ui/missing-info";
import { followUpUrgency, type PromotionView } from "@/lib/workspace-ui/seller-view";
import type { StageEval } from "@/lib/workspace-ui/opportunity-view";

// Categorical confidence ONLY (never a numeric/probabilistic score).
export type ConfidenceCategory = "High" | "Medium" | "Low" | "Review Required" | "Not Yet Scored";

export type MissingInfoItem = {
  state: MissingInfoState;
  label: string;
  why: string; // why it is missing/incomplete/conflicting/unavailable
  source: string; // which existing fact it came from
  resolution: string; // what action would resolve it
};

export type Recommendation = {
  recommendation: string | null; // null when there is nothing to honestly recommend
  confidence: ConfidenceCategory;
  evidenceUsed: string[];
  evidenceMissing: string[];
  competingRejected: { candidate: string; reason: string }[];
  chain: EvidenceChainInput; // for the Increment-1 EvidenceChain primitive
};

export type Synthesis = { nextBestAction: Recommendation; missingInformation: MissingInfoItem[] };

// A candidate action is applicable when its condition holds; precedence is the array order (documented).
type Candidate = { key: string; recommendation: string; confidence: ConfidenceCategory; evidenceUsed: string[]; evidenceMissing: string[] };

function assemble(candidates: Candidate[], conflict: { present: boolean; note?: string }, missing: MissingInfoItem[]): Synthesis {
  if (candidates.length === 0) {
    return {
      nextBestAction: {
        recommendation: null,
        confidence: "Not Yet Scored",
        evidenceUsed: [],
        evidenceMissing: missing.map((m) => m.label),
        competingRejected: [],
        chain: { recommendation: null, supporting: [], missing: missing.map((m) => m.label), confidence: null, nextAction: null },
      },
      missingInformation: missing,
    };
  }
  const chosen = candidates[0];
  const rejected = candidates.slice(1).map((c) => ({ candidate: c.recommendation, reason: `not selected: "${chosen.recommendation}" takes documented precedence` }));
  // A conflict downgrades confidence to Review Required and routes the next action to a neutral review.
  const confidence: ConfidenceCategory = conflict.present ? "Review Required" : chosen.confidence;
  const chainConfidence = confidence === "High" ? "high" : confidence === "Medium" ? "medium" : confidence === "Low" ? "low" : null;
  const nextAction = confidence === "Review Required" ? ({ review: true } as const) : ({ label: chosen.recommendation } as const);
  return {
    nextBestAction: {
      recommendation: chosen.recommendation,
      confidence,
      evidenceUsed: chosen.evidenceUsed,
      evidenceMissing: chosen.evidenceMissing.concat(conflict.present && conflict.note ? [conflict.note] : []),
      competingRejected: rejected,
      chain: {
        recommendation: chosen.recommendation,
        supporting: chosen.evidenceUsed.map((e) => ({ label: e, present: true })).concat(chosen.evidenceMissing.map((e) => ({ label: e, present: false }))),
        missing: chosen.evidenceMissing,
        confidence: chainConfidence,
        nextAction,
      },
    },
    missingInformation: missing,
  };
}

// ---- Seller synthesis ----
export type SellerFacts = {
  outreachStatus: ContactOutreachStatus;
  checklist: { items: { label: string; done: boolean }[]; progress: { done: number; total: number } };
  nextFollowUpAt: Date | null;
  promotion: PromotionView;
  hasContact: boolean;
  now: Date;
};

// DOCUMENTED PRECEDENCE (seller): opt-out > promotion > qualification > follow-up. Deterministic; based
// only on existing facts. A conflicting-evidence case routes to Review Required (no invented tie-break).
export const SELLER_PRECEDENCE = "opt-out → promotion → complete-qualification → follow-up";

export function synthesizeSeller(f: SellerFacts): Synthesis {
  const { done, total } = f.checklist.progress;
  const firstUndone = f.checklist.items.find((i) => !i.done)?.label ?? null;
  const optedOut = f.outreachStatus === "DO_NOT_CONTACT" || f.outreachStatus === "DEAD";
  const urgency = followUpUrgency(f.nextFollowUpAt, f.now);

  const candidates: Candidate[] = [];
  if (optedOut) candidates.push({ key: "opt-out", recommendation: `Do not contact — seller is ${f.outreachStatus === "DEAD" ? "Dead" : "Do Not Contact"}`, confidence: "High", evidenceUsed: [`Outreach status is ${f.outreachStatus}`], evidenceMissing: [] });
  if (!optedOut && f.promotion.state === "eligible") candidates.push({ key: "promote", recommendation: f.promotion.label, confidence: "High", evidenceUsed: ["Seller is Qualified", "A property is linked"], evidenceMissing: [] });
  if (!optedOut && firstUndone && done < total) candidates.push({ key: "qualify", recommendation: `Complete qualification: ${firstUndone}`, confidence: done / total >= 0.6 ? "Medium" : "Low", evidenceUsed: [`Qualification ${done} of ${total} complete`], evidenceMissing: f.checklist.items.filter((i) => !i.done).map((i) => i.label) });
  if (!optedOut && (urgency === "overdue" || urgency === "due-today")) candidates.push({ key: "follow-up", recommendation: urgency === "overdue" ? "Follow up now — overdue" : "Follow up today", confidence: "Medium", evidenceUsed: [`Follow-up ${urgency}`], evidenceMissing: [] });

  // Conflict: status says Qualified but the qualification checklist is not complete.
  const conflict = { present: f.outreachStatus === "QUALIFIED" && done < total, note: "Outreach status is Qualified but the qualification checklist is incomplete" };

  const missing: MissingInfoItem[] = [];
  if (!f.hasContact) missing.push({ state: "missing", label: "Contact details", why: "No phone or email is on file", source: "Seller record", resolution: "Add a phone number or email" });
  if (done < total) missing.push({ state: "incomplete", label: "Qualification checklist", why: `${done} of ${total} items complete`, source: "Qualification checklist", resolution: `Complete: ${f.checklist.items.filter((i) => !i.done).map((i) => i.label).join(", ")}` });
  if (conflict.present) missing.push({ state: "conflicting", label: "Qualification vs status", why: conflict.note, source: "Outreach status vs qualification checklist", resolution: "Reconcile the status or complete the checklist" });
  missing.push({ state: "unavailable", label: "Motivation score", why: "No motivation/priority scoring exists in the backend", source: "Not modeled", resolution: "Not yet available" });

  return assemble(candidates, conflict, missing);
}

// ---- Opportunity synthesis ----
export type OpportunityFacts = {
  stageEval: StageEval | { error: string } | null; // evaluateStageMove for the next stage (null = terminal)
  diligence: { missing: number; total: number; readyForUnderwriting: boolean };
  closing: { ready: boolean; blockerLabels: string[] };
};

// DOCUMENTED PRECEDENCE (opportunity): advance (ALLOW) > advance-with-attestation > resolve-stage-block
// (DENY) > complete-diligence > clear-closing-blockers. Deterministic; based only on existing facts.
export const OPPORTUNITY_PRECEDENCE = "advance → advance-with-attestation → resolve-stage-block → complete-diligence → clear-closing-blockers";

export function synthesizeOpportunity(f: OpportunityFacts): Synthesis {
  const candidates: Candidate[] = [];
  const missing: MissingInfoItem[] = [];
  const evalErr = f.stageEval !== null && "error" in f.stageEval;
  const ev = f.stageEval !== null && !("error" in f.stageEval) ? f.stageEval : null;

  if (evalErr) missing.push({ state: "unavailable", label: "Stage evaluation", why: (f.stageEval as { error: string }).error, source: "evaluateStageMove", resolution: "Not currently evaluable" });

  if (ev) {
    if (ev.outcome === "ALLOW") candidates.push({ key: "advance", recommendation: `Advance to ${ev.stageLabel}`, confidence: "High", evidenceUsed: [`Stage policy allows advancing to ${ev.stageLabel}`], evidenceMissing: [] });
    else if (ev.outcome === "REQUIRES_ATTESTATION") candidates.push({ key: "advance-attest", recommendation: `Advance to ${ev.stageLabel} (attestation required)`, confidence: "Medium", evidenceUsed: [`Stage policy permits ${ev.stageLabel} with an attestation`], evidenceMissing: ev.missingTruth });
    else candidates.push({ key: "resolve", recommendation: ev.suggestedAction || `Resolve blockers to reach ${ev.stageLabel}`, confidence: ev.missingTruth.length ? "Low" : "Medium", evidenceUsed: [ev.message || `Blocked from ${ev.stageLabel}`], evidenceMissing: ev.missingTruth.concat(ev.missingArtifacts) });
    for (const t of ev.missingTruth) missing.push({ state: "missing", label: t, why: "Required truth for the next stage is absent", source: "Stage policy (missingTruth)", resolution: `Provide: ${t}` });
    for (const a of ev.missingArtifacts) missing.push({ state: "incomplete", label: a, why: "A supporting artifact for the next stage is missing", source: "Stage policy (missingArtifacts)", resolution: `Upload: ${a}` });
  }

  if (!f.diligence.readyForUnderwriting && f.diligence.missing > 0) {
    candidates.push({ key: "diligence", recommendation: `Complete diligence — ${f.diligence.missing} outstanding`, confidence: "Medium", evidenceUsed: [`${f.diligence.missing} of ${f.diligence.total} diligence items outstanding`], evidenceMissing: [] });
    missing.push({ state: "incomplete", label: "Diligence", why: `${f.diligence.missing} of ${f.diligence.total} items outstanding`, source: "summarizeDiligence", resolution: "Request/receive the outstanding items" });
  }
  if (!f.closing.ready && f.closing.blockerLabels.length > 0) {
    candidates.push({ key: "closing", recommendation: `Clear closing blockers (${f.closing.blockerLabels.length})`, confidence: "Medium", evidenceUsed: [`${f.closing.blockerLabels.length} closing blocker(s)`], evidenceMissing: f.closing.blockerLabels });
    for (const b of f.closing.blockerLabels) missing.push({ state: "missing", label: b, why: "Required closing item is not satisfied", source: "Closing gate", resolution: `Complete: ${b}` });
  }

  return assemble(candidates, { present: false }, missing);
}

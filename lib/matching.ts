// Pure buyer↔opportunity matching — deterministic scoring, no Prisma, no framework,
// no AI. Safe to unit-test and to import from both server actions and server components.
//
// First-pass weights (total 100):
//   Asset type fit ............ 40
//   State / location fit ...... 25
//   Price range fit ........... 25
//   Data completeness ......... 10
//
// A model may later *draft* the human-readable thesis text for a match, but the
// score and the match set are always computed here in code (see ADR-0004).

import type { AssetType } from "@prisma/client";

export const MATCH_WEIGHTS = {
  assetType: 40,
  state: 25,
  price: 25,
  completeness: 10,
} as const;

// Buyer targeting criteria (a subset of the Buyer model).
export type MatchBuyer = {
  targetAssetTypes: AssetType[];
  targetStates: string[];
  minimumPurchaseUsd: number | null;
  maximumPurchaseUsd: number | null;
};

// Opportunity criteria, denormalized from the opportunity and its property.
// valueUsd is the best available deal value (contract value, else estimated value).
export type MatchOpportunity = {
  assetType: AssetType | null;
  state: string | null;
  valueUsd: number | null;
};

export type MatchResult = {
  score: number; // integer 0–100
  reasons: string[]; // positive contributions to the score
  warnings: string[]; // missing/ambiguous data that limited the score
};

function normState(s: string): string {
  return s.trim().toUpperCase();
}

function usd(n: number): string {
  return "$" + Math.round(n).toLocaleString("en-US");
}

export function scoreBuyerForOpportunity(
  buyer: MatchBuyer,
  opp: MatchOpportunity,
): MatchResult {
  const reasons: string[] = [];
  const warnings: string[] = [];
  let score = 0;

  // Track how many of the six key inputs are present, for the confidence score.
  const inputs = {
    buyerAssetTypes: buyer.targetAssetTypes.length > 0,
    buyerStates: buyer.targetStates.length > 0,
    buyerPrice: buyer.minimumPurchaseUsd != null || buyer.maximumPurchaseUsd != null,
    oppAssetType: opp.assetType != null,
    oppState: opp.state != null && opp.state.trim() !== "",
    oppValue: opp.valueUsd != null,
  };

  // --- Asset type fit (40) ---
  if (!inputs.buyerAssetTypes) {
    warnings.push("Buyer has no target asset types set — asset-type fit unscored.");
  } else if (!inputs.oppAssetType) {
    warnings.push("Opportunity has no asset type — asset-type fit unscored.");
  } else if (buyer.targetAssetTypes.includes(opp.assetType as AssetType)) {
    score += MATCH_WEIGHTS.assetType;
    reasons.push(`Asset type ${opp.assetType} matches buyer targets (+${MATCH_WEIGHTS.assetType}).`);
  } else {
    reasons.push(`Asset type ${opp.assetType} is not in buyer targets (+0).`);
  }

  // --- State / location fit (25) ---
  if (!inputs.buyerStates) {
    warnings.push("Buyer has no target states set — location fit unscored.");
  } else if (!inputs.oppState) {
    warnings.push("Opportunity property has no state — location fit unscored.");
  } else {
    const targets = buyer.targetStates.map(normState);
    if (targets.includes(normState(opp.state as string))) {
      score += MATCH_WEIGHTS.state;
      reasons.push(`Location ${normState(opp.state as string)} is in buyer target states (+${MATCH_WEIGHTS.state}).`);
    } else {
      reasons.push(`Location ${normState(opp.state as string)} is not in buyer target states (+0).`);
    }
  }

  // --- Price range fit (25) ---
  if (!inputs.buyerPrice) {
    warnings.push("Buyer has no purchase range set — price fit unscored.");
  } else if (!inputs.oppValue) {
    warnings.push("Opportunity has no contract or estimated value — price fit unscored.");
  } else {
    const value = opp.valueUsd as number;
    const min = buyer.minimumPurchaseUsd;
    const max = buyer.maximumPurchaseUsd;
    const aboveMin = min == null || value >= min;
    const belowMax = max == null || value <= max;
    if (aboveMin && belowMax) {
      score += MATCH_WEIGHTS.price;
      reasons.push(`Deal value ${usd(value)} is within buyer range (+${MATCH_WEIGHTS.price}).`);
    } else {
      const lo = min != null ? usd(min) : "—";
      const hi = max != null ? usd(max) : "—";
      reasons.push(`Deal value ${usd(value)} is outside buyer range ${lo}–${hi} (+0).`);
    }
  }

  // --- Data completeness / confidence (10) ---
  const present = Object.values(inputs).filter(Boolean).length;
  const total = Object.keys(inputs).length; // 6
  const completeness = Math.round((MATCH_WEIGHTS.completeness * present) / total);
  score += completeness;
  reasons.push(`Data completeness ${present}/${total} inputs (+${completeness}).`);

  // Clamp defensively to 0–100.
  score = Math.max(0, Math.min(100, Math.round(score)));

  return { score, reasons, warnings };
}

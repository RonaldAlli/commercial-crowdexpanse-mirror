// BE-3 Candidate Lineage — Increment 3 (rename, baseline evolution, reintroduction classification).
//
// ISOLATED, DIAGNOSTIC, NON-AUTHORITATIVE. Determines whether a current finding is the SAME review item
// as a previous candidate across repository evolution, using the civ-2 identity module (Increment 1) as
// a READ-ONLY interface. It does NOT change identity generation, compatibility, candidate
// classification, the detector, accepted evidence, or accepted baselines; it performs no migration and
// makes no hardened identity authoritative. History is treated append-only (prior states are echoed,
// never rewritten).
//
// Principle: lineage continuity REQUIRES evidence. Filename similarity alone is insufficient. When
// predecessors are competing/uncertain, the outcome is `ambiguous` — lineage is never invented, and
// ambiguity takes precedence over false certainty (no silent false negatives).

import { generateIdentities, type IdentityInput } from "@/lib/governance/be3-candidate-identity";

export const LINEAGE_VERSION = "lin-1";

export type LineageStatus = "sameCandidate" | "renamed" | "reintroduced" | "split" | "merged" | "ambiguous" | "unrelated";
export type PriorState = "existing" | "resolved";

export type PreviousCandidate = { ruleId: string; lId?: string; matched: string; path: string; contextAnchor?: string | null; priorState: PriorState };
export type CurrentFinding = { ruleId: string; lId?: string; matched: string; path: string; contextAnchor?: string | null };
export type VerifiedRename = { from: string; to: string; source: "repo-metadata" | "content-continuity" };

export type CurrentLineage = { index: number; status: LineageStatus; candidateId: string | null; explanation: string };
export type PreviousLineage = { index: number; priorState: PriorState; transition: "matched" | "resolved"; candidateId: string | null };
export type LineageReport = {
  lineageVersion: string;
  current: CurrentLineage[];
  previous: PreviousLineage[]; // append-only echo of prior candidates + their transition; never rewritten
};

function toInput(c: { ruleId: string; lId?: string; matched: string; path: string; contextAnchor?: string | null }): IdentityInput {
  return { rule: { ruleId: c.ruleId, lId: c.lId }, matched: c.matched, path: c.path, contextAnchor: c.contextAnchor ?? null };
}
function rslOf(components: { ruleIdentity: string | null; canonicalSubject: string | null; canonicalLocation: string | null } | null): string | null {
  if (!components || components.ruleIdentity == null || components.canonicalSubject == null || components.canonicalLocation == null) return null;
  return `${components.ruleIdentity}${components.canonicalSubject}${components.canonicalLocation}`;
}
function locOf(components: { canonicalLocation: string | null } | null): string | null {
  return components?.canonicalLocation ?? null;
}

export function evaluateLineage(previous: PreviousCandidate[], current: CurrentFinding[], renames: VerifiedRename[]): LineageReport {
  // Verified-rename map (evidence-backed only). Detect competing targets (>1 distinct source → same target).
  const renameMap = new Map<string, string>();
  const targetSources = new Map<string, Set<string>>();
  for (const r of renames) {
    renameMap.set(r.from, r.to);
    (targetSources.get(r.to) ?? targetSources.set(r.to, new Set()).get(r.to)!).add(r.from);
  }
  const competingTarget = (to: string) => (targetSources.get(to)?.size ?? 0) > 1;

  // Identities: previous are RENAME-NORMALIZED (path aligned to current naming); current as-is.
  const prevInputs = previous.map((p) => toInput({ ...p, path: renameMap.get(p.path) ?? p.path }));
  const prevRes = generateIdentities(prevInputs).results;
  const curRes = generateIdentities(current.map(toInput)).results;
  const prevViaRename = previous.map((p) => renameMap.has(p.path));

  // Indexes over previous.
  const prevById = new Map<string, number[]>();
  const prevByRsl = new Map<string, number[]>();
  const prevByLoc = new Map<string, number[]>();
  prevRes.forEach((r, i) => {
    if (r.candidateId) (prevById.get(r.candidateId) ?? prevById.set(r.candidateId, []).get(r.candidateId)!).push(i);
    const rsl = rslOf(r.components); if (rsl) (prevByRsl.get(rsl) ?? prevByRsl.set(rsl, []).get(rsl)!).push(i);
    const loc = locOf(r.components); if (loc) (prevByLoc.get(loc) ?? prevByLoc.set(loc, []).get(loc)!).push(i);
  });
  const curByRsl = new Map<string, number[]>();
  curRes.forEach((r, i) => { const rsl = rslOf(r.components); if (rsl) (curByRsl.get(rsl) ?? curByRsl.set(rsl, []).get(rsl)!).push(i); });

  const matchedPrev = new Set<number>();
  const current_out: CurrentLineage[] = current.map((_, i) => {
    const cr = curRes[i];
    if (cr.status !== "resolved" || !cr.candidateId) return { index: i, status: "ambiguous", candidateId: null, explanation: `identity ${cr.status}: ${cr.reason ?? "no stable identity"}` };
    const id = cr.candidateId;
    const P = prevById.get(id) ?? [];
    const rsl = rslOf(cr.components);
    const loc = locOf(cr.components);

    if (P.length === 1) {
      const p = P[0]; matchedPrev.add(p);
      const via = prevViaRename[p];
      if (via && competingTarget(renameMap.get(previous[p].path) ?? "")) return { index: i, status: "ambiguous", candidateId: id, explanation: "competing verified-rename predecessors; lineage not invented" };
      if (previous[p].priorState === "resolved") return { index: i, status: "reintroduced", candidateId: id, explanation: "deterministic identity match to a resolved predecessor → reopened" };
      if (via) return { index: i, status: "renamed", candidateId: id, explanation: `identity preserved across verified rename (${previous[p].path} → ${loc})` };
      return { index: i, status: "sameCandidate", candidateId: id, explanation: "exact identity match to an existing predecessor" };
    }
    if (P.length > 1) { for (const p of P) matchedPrev.add(p); return { index: i, status: "merged", candidateId: id, explanation: `multiple predecessors share this identity (${P.length}) → merged` }; }

    // No identity match. Move+edit? (at a rename target, a same-rule predecessor at the source, id changed)
    if (loc && competingTarget(loc)) return { index: i, status: "ambiguous", candidateId: id, explanation: "current occupies a competing rename target; predecessor uncertain" };
    const renamePredecessorSameRuleDiffId = previous.some((p, pi) => renameMap.get(p.path) === loc && p.ruleId === current[i].ruleId && prevRes[pi].candidateId !== id);
    if (renamePredecessorSameRuleDiffId) return { index: i, status: "ambiguous", candidateId: id, explanation: "moved via verified rename but content changed (move+edit); same candidate not confirmable" };
    // Split? same rule+subject+location as a previous candidate but a new discriminator.
    if (rsl && (prevByRsl.get(rsl)?.length ?? 0) > 0) return { index: i, status: "split", candidateId: id, explanation: "new occurrence at an existing candidate's rule/subject/location (different context) → split" };
    return { index: i, status: "unrelated", candidateId: id, explanation: "no evidence of lineage to any predecessor → unrelated (new)" };
  });

  // rsl-group MERGED override: a group whose predecessor count exceeds current count (survivors are merges).
  for (const [rsl, curIdx] of curByRsl) {
    const nPrev = prevByRsl.get(rsl)?.length ?? 0;
    if (nPrev > curIdx.length && curIdx.length >= 1) {
      for (const i of curIdx) if (["sameCandidate", "renamed"].includes(current_out[i].status)) current_out[i] = { ...current_out[i], status: "merged", explanation: `predecessor count (${nPrev}) exceeds current (${curIdx.length}) at this rule/subject/location → merged` };
    }
  }

  const previous_out: PreviousLineage[] = previous.map((p, i) => ({
    index: i,
    priorState: p.priorState,
    transition: matchedPrev.has(i) ? "matched" : "resolved",
    candidateId: prevRes[i].candidateId,
  }));

  return { lineageVersion: LINEAGE_VERSION, current: current_out, previous: previous_out };
}

function sortKeysDeep(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortKeysDeep);
  if (value && typeof value === "object") return Object.fromEntries(Object.keys(value as Record<string, unknown>).sort().map((k) => [k, sortKeysDeep((value as Record<string, unknown>)[k])]));
  return value;
}
export function stableStringifyLineage(report: LineageReport): string {
  return JSON.stringify(sortKeysDeep(report), null, 2) + "\n";
}

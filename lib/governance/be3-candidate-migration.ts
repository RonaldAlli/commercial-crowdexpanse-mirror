// BE-3 Candidate Migration — Increment 4 (civ-1 → proposed civ-2 migration EVIDENCE tooling).
//
// ISOLATED, READ-ONLY, DIAGNOSTIC, NON-AUTHORITATIVE. It PROPOSES mappings from the current
// authoritative civ-1 candidates to the proposed civ-2 identities; it does NOT perform migration and
// switches NO authority. It CONSUMES Identity (civ-2, Increment 1, read-only) and Lineage (Increment 3
// LineageStatus, provided as input) — it never DETERMINES lineage or classification. It mutates nothing,
// rewrites no civ-1 IDs, and touches no accepted evidence/baseline/records.
//
// Dependency direction (enforced): Candidate Identity → Lineage → Classification. Migration consumes
// Identity + Lineage; it never determines them.

import { generateIdentities, type IdentityInput } from "@/lib/governance/be3-candidate-identity";
import type { LineageStatus } from "@/lib/governance/be3-candidate-lineage";

export const MIGRATION_VERSION = "mig-1";
export const MIGRATION_STATEMENT = "This tooling proposes mappings. It does not migrate authority.";

const DETERMINISTIC_LINEAGE: LineageStatus[] = ["sameCandidate", "renamed", "reintroduced"];

export type MappingClassification = "oneToOne" | "oneToMany" | "manyToOne" | "unmapped" | "ambiguous";

// A civ-1 candidate being migrated (authoritative id only; never altered).
export type OldCandidate = { oldId: string };
// A civ-2 re-identification target (evidence to compute the proposed identity).
export type NewCandidate = { identity: IdentityInput };
// Provided correspondence: which old candidate links to which new candidate, with the CONSUMED lineage.
export type Linkage = { oldId: string; newIndex: number; lineageStatus: LineageStatus };
export type MigrationInput = { old: OldCandidate[]; new: NewCandidate[]; linkage: Linkage[] };

export type MigrationMapping = {
  oldCandidateId: string;
  proposedNewIds: (string | null)[];
  mappingClassification: MappingClassification;
  lineageStatuses: LineageStatus[];
  reason: string;
  evidence: { linkedNewIndices: number[]; newIdentityStatuses: string[]; lineageStatuses: LineageStatus[]; duplicateOldId: boolean };
  reviewRequired: boolean;
};

export type MigrationReport = {
  migrationVersion: string;
  statement: string;
  mappings: MigrationMapping[];
  reviewQueue: string[]; // oldCandidateIds requiring review, deterministic order
  summary: Record<string, number>;
};

export function evaluateMigration(input: MigrationInput): MigrationReport {
  // Proposed civ-2 identities for the new candidates (read-only). We do NOT determine lineage here.
  const newRes = generateIdentities(input.new.map((n) => n.identity)).results;

  // Index the PROVIDED linkage (consumed; never inferred).
  const oldToLinks = new Map<string, Linkage[]>();
  const newToOlds = new Map<number, Set<string>>();
  for (const l of input.linkage) {
    (oldToLinks.get(l.oldId) ?? oldToLinks.set(l.oldId, []).get(l.oldId)!).push(l);
    (newToOlds.get(l.newIndex) ?? newToOlds.set(l.newIndex, new Set()).get(l.newIndex)!).add(l.oldId);
  }

  // Detect duplicate civ-1 ids (data hazard) — every old candidate still appears; nothing disappears.
  const oldIdCounts = new Map<string, number>();
  for (const o of input.old) oldIdCounts.set(o.oldId, (oldIdCounts.get(o.oldId) ?? 0) + 1);

  // Deterministic iteration order: by oldId, then original index for stable duplicates.
  const order = input.old.map((o, i) => ({ o, i })).sort((a, b) => a.o.oldId.localeCompare(b.o.oldId) || a.i - b.i);

  const mappings: MigrationMapping[] = order.map(({ o }) => {
    const links = (oldToLinks.get(o.oldId) ?? []).slice().sort((a, b) => a.newIndex - b.newIndex);
    const newIdxs = links.map((l) => l.newIndex);
    const lineageStatuses = links.map((l) => l.lineageStatus);
    const statuses = newIdxs.map((i) => newRes[i]?.status ?? "rejected");
    const proposedNewIds = newIdxs.map((i) => newRes[i]?.candidateId ?? null);
    const duplicateOldId = (oldIdCounts.get(o.oldId) ?? 0) > 1;
    const anyAmbiguous = statuses.some((s) => s !== "resolved") || lineageStatuses.includes("ambiguous");

    let cls: MappingClassification;
    let reason: string;
    let review: boolean;

    if (links.length === 0) {
      cls = "unmapped"; review = true; reason = "no linked civ-2 identity — remains visible for review";
    } else if (anyAmbiguous) {
      cls = "ambiguous"; review = true; reason = "ambiguous civ-2 identity or ambiguous lineage — ambiguity preserved, never downgraded";
    } else if (links.length > 1) {
      cls = "oneToMany"; review = true; reason = "one civ-1 candidate maps to multiple civ-2 identities (split) — review required";
    } else {
      const only = newIdxs[0];
      const oldsForNew = newToOlds.get(only)?.size ?? 0;
      if (oldsForNew > 1) {
        cls = "manyToOne"; review = true; reason = "multiple civ-1 candidates map to one civ-2 identity (merge) — review required";
      } else if (DETERMINISTIC_LINEAGE.includes(lineageStatuses[0])) {
        cls = "oneToOne"; review = false; reason = `deterministic one-to-one mapping (lineage: ${lineageStatuses[0]})`;
      } else {
        cls = "oneToOne"; review = true; reason = `one-to-one candidate but lineage '${lineageStatuses[0]}' is not deterministic — review required`;
      }
    }
    if (duplicateOldId) { review = true; reason = `${reason}; NOTE: duplicate civ-1 id present in input`; }

    return {
      oldCandidateId: o.oldId,
      proposedNewIds,
      mappingClassification: cls,
      lineageStatuses,
      reason,
      evidence: { linkedNewIndices: newIdxs, newIdentityStatuses: statuses, lineageStatuses, duplicateOldId },
      reviewRequired: review,
    };
  });

  const reviewQueue = mappings.filter((m) => m.reviewRequired).map((m) => m.oldCandidateId);
  const summary: Record<string, number> = { oneToOne: 0, oneToMany: 0, manyToOne: 0, unmapped: 0, ambiguous: 0, total: mappings.length, reviewRequired: reviewQueue.length };
  for (const m of mappings) summary[m.mappingClassification] += 1;

  return { migrationVersion: MIGRATION_VERSION, statement: MIGRATION_STATEMENT, mappings, reviewQueue, summary };
}

function sortKeysDeep(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortKeysDeep);
  if (value && typeof value === "object") return Object.fromEntries(Object.keys(value as Record<string, unknown>).sort().map((k) => [k, sortKeysDeep((value as Record<string, unknown>)[k])]));
  return value;
}
export function stableStringifyMigration(report: MigrationReport): string {
  return JSON.stringify(sortKeysDeep(report), null, 2) + "\n";
}

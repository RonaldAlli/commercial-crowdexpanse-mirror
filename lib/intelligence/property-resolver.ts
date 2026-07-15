// Commercial Intelligence (v1.2, Commit 2c-ii) — Property identity RESOLUTION
// orchestration: the deterministic engine that decides how inbound evidence attaches
// to a canonical Property. It sits BETWEEN identity structure (2c-i) and human
// governance (2c-iii): a classification engine, not a workflow.
//
// It NEVER modifies evidence (locked invariant "Resolution never modifies evidence")
// and never merges / deletes / silently repoints — it only APPENDS (crosswalk rows,
// enrichment observations, audit + candidate rows) and deterministically REBUILDS the
// identity index. Every resolution follows the locked deterministic sequence:
//   Normalize → Lookup → Conflict Inspection → Classification → Decision →
//   Attachment → Audit → Candidate → Rebuild
// The pure classifier (property-resolution) owns Conflict Inspection + Classification;
// this module owns the DB-facing steps around it, all in ONE transaction. Org-scoped.
import type { Prisma, SourceCategory } from "@prisma/client";

import { prisma } from "@/lib/prisma";
import { normalizePropertyValue, type PropertyProjectedField } from "@/lib/intelligence/property-fields";
import { classifyResolution, type ResolutionEvidence, type ResolutionMatches, type ResolutionOutcome } from "@/lib/intelligence/property-resolution";
import { addPropertyExternalIdentifier, parcelKeyOf } from "@/lib/intelligence/property-identity";
import { applyPropertyProjectedValuesTx, createPropertyRecordTx, type PropertyOperationalPayload, type PropertyProjectedValues } from "@/lib/properties";
import { upsertPropertyMatchCandidateTx } from "@/lib/property-match";

export interface ExternalIdInput {
  provider: string;
  providerIdentifier: string;
  asOf?: Date | null;
}

export interface ResolveOpts {
  externalIds?: ExternalIdInput[];
  requestKey?: string; // idempotent replay of a Tier-1A resolve
  actorUserId?: string;
  method?: string;
  // Provenance carried onto enrichment observations (defaults to USER_ENTERED / actor / now).
  sourceCategory?: SourceCategory;
  sourceId?: string;
  asOf?: Date;
}

const toJson = (v: unknown): Prisma.InputJsonValue => v as Prisma.InputJsonValue;

/** Normalize raw inbound projected anchors + external ids into ResolutionEvidence (the Normalize step). */
export function buildEvidence(projected: PropertyProjectedValues, externalIds: ExternalIdInput[] = []): ResolutionEvidence {
  const anchorVal = (f: PropertyProjectedField): string | null => {
    const raw = projected[f];
    if (raw === null || raw === undefined) return null;
    return normalizePropertyValue(f, String(raw));
  };
  return {
    anchors: {
      countyFipsCode: anchorVal("countyFipsCode"),
      apnNormalized: anchorVal("apnNormalized"),
      addressNormalized: anchorVal("addressNormalized"),
    },
    externalIds: externalIds.map((x) => ({ provider: x.provider, providerIdentifier: x.providerIdentifier })),
  };
}

/** Org-scoped identity lookups feeding the pure classifier (the Lookup step). */
export async function lookupResolutionMatches(tx: Prisma.TransactionClient, organizationId: string, evidence: ResolutionEvidence): Promise<ResolutionMatches> {
  const { countyFipsCode, apnNormalized, addressNormalized } = evidence.anchors;
  const parcelKey = parcelKeyOf(countyFipsCode, apnNormalized);

  const parcelIds = parcelKey
    ? (await tx.propertyIdentity.findMany({ where: { organizationId, parcelKey }, select: { propertyId: true } })).map((r) => r.propertyId)
    : [];

  // Address matches are scoped to the jurisdiction (same county FIPS) when FIPS is present.
  const addrIds = addressNormalized
    ? (await tx.propertyIdentity.findMany({
        where: { organizationId, addressNormalized, ...(countyFipsCode ? { countyFipsCode } : {}) },
        select: { propertyId: true },
      })).map((r) => r.propertyId)
    : [];

  const xwalkTargets: string[] = [];
  for (const x of evidence.externalIds) {
    const active = await tx.propertyExternalIdentifier.findFirst({
      where: { organizationId, provider: x.provider, providerIdentifier: x.providerIdentifier, state: "ACTIVE" },
      select: { propertyId: true },
    });
    if (active) xwalkTargets.push(active.propertyId);
  }

  return { parcelIds, addrIds, xwalkTargets };
}

export interface ResolveResult {
  resolved: boolean;
  property: Prisma.PromiseReturnType<typeof prisma.property.findUniqueOrThrow>;
  outcome: ResolutionOutcome;
}

/**
 * Guarded deterministic resolve-before-create. Normalizes the inbound evidence, looks
 * up identity matches, classifies (pure), then:
 *   • Tier 1A → resolve to the existing property (do NOT create): enrich it with the
 *     inbound anchors as APPENDED observations, attach the supplied external ids, and
 *     record a RESOLVE audit event. Returns the existing property.
 *   • Tier 1B / 2 → create a new canonical property, then record candidate pair(s) for
 *     human review (never auto-attaches).
 *   • NONE → create a new canonical property.
 * All in ONE transaction. Idempotent on `requestKey` for the Tier-1A path.
 */
export async function resolveOrCreateProperty(
  organizationId: string,
  operational: PropertyOperationalPayload,
  projected: PropertyProjectedValues,
  opts: ResolveOpts = {},
): Promise<ResolveResult> {
  return prisma.$transaction(async (tx) => {
    // Idempotent replay: a RESOLVE already recorded for this (org, requestKey) returns
    // its target without re-resolving or re-creating.
    if (opts.requestKey) {
      const prior = await tx.propertyResolution.findFirst({ where: { organizationId, requestKey: opts.requestKey, kind: "RESOLVE" } });
      if (prior) {
        const property = await tx.property.findUniqueOrThrow({ where: { id: prior.resolvedPropertyId } });
        const basis = prior.basis as "UNIQUE_PARCEL" | "UNIQUE_EXTERNAL_IDENTIFIER";
        return { resolved: true, property, outcome: { tier: "1A", basis, targetPropertyId: prior.resolvedPropertyId, candidatePropertyIds: [], reason: "idempotent replay" } };
      }
    }

    const evidence = buildEvidence(projected, opts.externalIds);
    const matches = await lookupResolutionMatches(tx, organizationId, evidence);
    const outcome = classifyResolution(evidence, matches);

    // Enrichment / genesis provenance: default to USER_ENTERED / actor / now unless the
    // caller supplied the original source metadata.
    const writeOpts = { actorUserId: opts.actorUserId, method: opts.method, sourceCategory: opts.sourceCategory, sourceId: opts.sourceId, asOf: opts.asOf };

    if (outcome.tier === "1A") {
      const targetId = outcome.targetPropertyId;
      // Decision (resolve, don't create) → Attachment → Audit → Rebuild.
      // Enrich the resolved property with the inbound anchors as APPENDED observations
      // (never mutating prior evidence); applyPropertyProjectedValuesTx rebuilds the index.
      await applyPropertyProjectedValuesTx(tx, organizationId, targetId, projected, { ...writeOpts, method: opts.method ?? "resolve-enrich" });
      // Attach the supplied external ids to the resolved property (idempotent).
      const attached: string[] = [];
      for (const x of evidence.externalIds) {
        const row = await addPropertyExternalIdentifier(organizationId, targetId, x.provider, x.providerIdentifier, opts.asOf ?? null, tx);
        attached.push(row.id);
      }
      await tx.propertyResolution.create({
        data: {
          organizationId,
          kind: "RESOLVE",
          resolvedPropertyId: targetId,
          basis: outcome.basis,
          evidence: toJson(evidence),
          attachedExternalIdentifierIds: toJson(attached),
          reason: outcome.reason,
          requestKey: opts.requestKey ?? null,
          actorUserId: opts.actorUserId ?? null,
        },
      });
      const property = await tx.property.findUniqueOrThrow({ where: { id: targetId } });
      return { resolved: true, property, outcome };
    }

    // Tier 1B / 2 / NONE → create a new canonical property (never auto-attach).
    const property = await createPropertyRecordTx(tx, organizationId, operational, projected, writeOpts);
    if (outcome.tier === "1B" || outcome.tier === "2") {
      for (const candidateId of outcome.candidatePropertyIds) {
        await upsertPropertyMatchCandidateTx(tx, organizationId, property.id, candidateId, outcome.basis);
      }
    }
    return { resolved: false, property, outcome };
  });
}

/**
 * Reverse a Tier-1A resolution as a FIRST-CLASS historical event (Decision D): append
 * a REVERSAL event recording actor + reason + time + the affected resolution, then
 * revoke the crosswalk attachments that RESOLVE made (ACTIVE → SUPERSEDED, attributed
 * to the reversal — append-only, the identifier value is never rewritten). The
 * enrichment observations remain immutable in the ledger; a projection correction, if
 * ever needed, is a pinned override — never an evidence rewrite. Idempotent.
 */
export async function reversePropertyResolution(
  organizationId: string,
  resolutionId: string,
  opts: { actorUserId?: string; reason?: string } = {},
) {
  return prisma.$transaction(async (tx) => {
    const ev = await tx.propertyResolution.findFirst({ where: { id: resolutionId, organizationId, kind: "RESOLVE" } });
    if (!ev) throw new Error("Resolution not found in organization");
    const already = await tx.propertyResolution.findFirst({ where: { organizationId, kind: "REVERSAL", supersedesResolutionId: ev.id } });
    if (already) return already; // already reversed — idempotent

    // Audit first so the revocation can be attributed to the reversal event.
    const reversal = await tx.propertyResolution.create({
      data: {
        organizationId,
        kind: "REVERSAL",
        resolvedPropertyId: ev.resolvedPropertyId,
        basis: ev.basis,
        evidence: toJson(ev.evidence),
        attachedExternalIdentifierIds: toJson([]),
        reason: opts.reason ?? null,
        supersedesResolutionId: ev.id,
        actorUserId: opts.actorUserId ?? null,
      },
    });

    const ids = Array.isArray(ev.attachedExternalIdentifierIds) ? (ev.attachedExternalIdentifierIds as string[]) : [];
    for (const xid of ids) {
      const row = await tx.propertyExternalIdentifier.findFirst({ where: { id: xid, organizationId, state: "ACTIVE" } });
      if (row) await tx.propertyExternalIdentifier.update({ where: { id: row.id }, data: { state: "SUPERSEDED", revokedByResolutionId: reversal.id } });
    }
    return reversal;
  });
}

// Commercial Intelligence (v1.2, Commit 1b-1) — provenance ledger data-access.
//
// The append-only, immutable two-layer ledger: Observations (raw capture) →
// Signals (accepted intelligence). This commit is the LEDGER SUBSTRATE only —
// it records facts and supports supersession + a read API. It does NOT yet
// project to typed columns or rewire owner writes (that is Commit 1b-2). Every
// function is org-scoped by construction.
//
// Invariants upheld (Volume 12): the ledger is never edited or deleted — a
// correction is a new signal that SUPERSEDES the prior (state ACCEPTED →
// SUPERSEDED). Rejected observations still persist. Every row is version-stamped.
import type { IntelligenceEntityType, Prisma, SourceCategory } from "@prisma/client";

import { prisma } from "@/lib/prisma";
import { LEDGER_SCHEMA_VERSION, NORMALIZATION_VERSION, PROJECTION_VERSION, valueEnvelope } from "@/lib/intelligence/signal-value";

export interface FieldRef {
  entityType: IntelligenceEntityType;
  entityId: string;
  fieldKey: string;
}

export interface ObservationInput extends FieldRef {
  valueRaw: string;
  valueNormalized?: string | null;
  sourceCategory: SourceCategory;
  sourceId: string;
  licenseRef?: string | null;
  asOf: Date;
  confidence?: number;
  method: string;
}

/** Record a raw observation (append-only). Returns the created row. */
export async function recordObservation(organizationId: string, input: ObservationInput, tx: Prisma.TransactionClient = prisma) {
  const env = valueEnvelope(input.valueRaw, input.valueNormalized);
  return tx.observation.create({
    data: {
      organizationId,
      entityType: input.entityType,
      entityId: input.entityId,
      fieldKey: input.fieldKey,
      valueType: env.valueType,
      valueRaw: env.valueRaw,
      valueNormalized: env.valueNormalized,
      sourceCategory: input.sourceCategory,
      sourceId: input.sourceId,
      licenseRef: input.licenseRef ?? null,
      asOf: input.asOf,
      confidence: input.confidence ?? 1,
      method: input.method,
      schemaVersion: LEDGER_SCHEMA_VERSION,
      normalizationVersion: NORMALIZATION_VERSION,
    },
  });
}

/**
 * Accept an observation into the ledger as a Signal. Supersedes the current
 * ACCEPTED signal of the SAME source-category lineage for that field (a new
 * value replaces the prior one from the same source); other lineages are left
 * untouched. Transactional. The prior signal is marked SUPERSEDED, never deleted.
 */
export async function acceptObservationAsSignal(
  organizationId: string,
  observationId: string,
  opts: { isOverride?: boolean } = {},
) {
  return prisma.$transaction(async (tx) => {
    const obs = await tx.observation.findFirst({ where: { id: observationId, organizationId } });
    if (!obs) throw new Error("Observation not found in organization");
    if (await tx.intelligenceSignal.findUnique({ where: { observationId } })) {
      throw new Error("Observation already accepted");
    }

    const signal = await tx.intelligenceSignal.create({
      data: {
        organizationId,
        entityType: obs.entityType,
        entityId: obs.entityId,
        fieldKey: obs.fieldKey,
        valueType: obs.valueType,
        valueRaw: obs.valueRaw,
        valueNormalized: obs.valueNormalized,
        sourceCategory: obs.sourceCategory,
        sourceId: obs.sourceId,
        licenseRef: obs.licenseRef,
        asOf: obs.asOf,
        confidence: obs.confidence,
        method: obs.method,
        isOverride: opts.isOverride ?? false,
        observationId: obs.id,
        schemaVersion: LEDGER_SCHEMA_VERSION,
        normalizationVersion: NORMALIZATION_VERSION,
        projectionVersion: PROJECTION_VERSION,
      },
    });

    // Supersede the prior ACCEPTED signal from the same lineage (entity+field+category).
    const prior = await tx.intelligenceSignal.findFirst({
      where: {
        organizationId,
        entityType: obs.entityType,
        entityId: obs.entityId,
        fieldKey: obs.fieldKey,
        sourceCategory: obs.sourceCategory,
        state: "ACCEPTED",
        id: { not: signal.id },
      },
      orderBy: { createdAt: "asc" },
    });
    if (prior) {
      await tx.intelligenceSignal.update({ where: { id: prior.id }, data: { state: "SUPERSEDED", supersededById: signal.id } });
    }
    return signal;
  });
}

/** Convenience: record an observation and immediately accept it (the 1b USER_ENTERED path). */
export async function appendSignal(organizationId: string, input: ObservationInput, opts: { isOverride?: boolean } = {}) {
  const obs = await recordObservation(organizationId, input);
  return acceptObservationAsSignal(organizationId, obs.id, opts);
}

/** All signals for a field (full history, oldest first) — for provenance display. */
export async function getFieldSignals(organizationId: string, ref: FieldRef) {
  return prisma.intelligenceSignal.findMany({
    where: { organizationId, entityType: ref.entityType, entityId: ref.entityId, fieldKey: ref.fieldKey },
    orderBy: { createdAt: "asc" },
  });
}

/**
 * The read API the UI (1d) will use: the currently-ACCEPTED signals for a field
 * (one per lineage) plus a count of superseded history. Precedence selection of
 * the single winner is Commit 1b-2; here we expose the accepted set + history.
 */
export async function getFieldProvenance(organizationId: string, ref: FieldRef) {
  const all = await getFieldSignals(organizationId, ref);
  const accepted = all.filter((s) => s.state === "ACCEPTED");
  return {
    accepted: accepted.map((s) => ({ value: s.valueRaw, sourceCategory: s.sourceCategory, sourceId: s.sourceId, asOf: s.asOf, confidence: s.confidence, isOverride: s.isOverride })),
    supersededCount: all.length - accepted.length,
    total: all.length,
  };
}

/**
 * Seed genesis signals for owners created before the ledger existed (idempotent).
 * For each owner with no displayName signal, record + accept a USER_ENTERED
 * genesis observation from the current column values. In production this is a
 * no-op today (no owner-create path has shipped). Prepares the ledger so 1b-2's
 * reconstruction holds for every owner.
 */
export async function backfillOwnerGenesisSignals(organizationId: string) {
  const owners = await prisma.owner.findMany({ where: { organizationId }, select: { id: true, displayName: true, entityType: true, matchKey: true, createdAt: true } });
  let created = 0;
  for (const o of owners) {
    const has = await prisma.intelligenceSignal.findFirst({ where: { organizationId, entityType: "OWNER", entityId: o.id, fieldKey: "displayName" }, select: { id: true } });
    if (has) continue;
    await appendSignal(organizationId, { entityType: "OWNER", entityId: o.id, fieldKey: "displayName", valueRaw: o.displayName, valueNormalized: o.matchKey, sourceCategory: "USER_ENTERED", sourceId: "genesis", asOf: o.createdAt, method: "backfill" });
    await appendSignal(organizationId, { entityType: "OWNER", entityId: o.id, fieldKey: "entityType", valueRaw: o.entityType, sourceCategory: "USER_ENTERED", sourceId: "genesis", asOf: o.createdAt, method: "backfill" });
    created += 1;
  }
  return { owners: owners.length, backfilled: created };
}

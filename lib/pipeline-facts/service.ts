// E1 Core Fact Infrastructure — the persistence service (the ONLY API E1 exposes).
//
// This module RECORDS immutable facts and RECONSTRUCTS history. It contains NO projection,
// authorization, policy evaluation, or inconsistency computation (those are E2–E4 and CONSUME this
// ledger). Immutability is by construction: there is no update or delete function here — supersession
// is a new linked row (GI-1 / Constitution Law 5). Structural validation enforces the ontology and the
// GI-3 class↔operation rule (defense in depth; the authorization *decision* is E3). Org-scoped, fail
// closed. See docs/architecture/E1_CORE_FACT_INFRASTRUCTURE_DESIGN.md.

import { randomUUID } from "node:crypto";

import {
  Prisma,
  PipelineFactClass,
  PipelineFactOperation,
  PipelineActorType,
  PipelineFactProvenance,
  type PipelineFact,
} from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { factTypeSpec } from "./registry";

const SUPERSEDING_OPS = new Set<PipelineFactOperation>([
  PipelineFactOperation.RETRACT,
  PipelineFactOperation.CORRECT,
  PipelineFactOperation.INVALIDATE,
]);
const REASON_REQUIRED = new Set<PipelineFactOperation>([
  PipelineFactOperation.RETRACT,
  PipelineFactOperation.CORRECT,
  PipelineFactOperation.INVALIDATE,
  PipelineFactOperation.ACCEPT_EXCEPTION,
]);

/** The fresh-assertion operation permitted for each GI-3 class (evidence is never DECLAREd — AUTH-INV-3). */
function freshOpValidForClass(op: PipelineFactOperation, cls: PipelineFactClass): boolean {
  if (cls === PipelineFactClass.ARTIFACT) return op === PipelineFactOperation.DRAFT;
  if (cls === PipelineFactClass.EVIDENCE) return op === PipelineFactOperation.RECORD_EVIDENCE;
  // DECISION
  return op === PipelineFactOperation.DECLARE || op === PipelineFactOperation.ACCEPT_EXCEPTION;
}

export type RecordFactInput = {
  organizationId: string;
  opportunityId: string;
  factType: string;
  operation: PipelineFactOperation; // a FRESH-assertion op (DRAFT | RECORD_EVIDENCE | DECLARE | ACCEPT_EXCEPTION)
  subjectKey?: string | null;
  state?: string | null;
  payload?: Prisma.InputJsonValue | null;
  policyVersion?: string | null;
  ruleSetVersion?: string | null;
  artifactVersion?: string | null;
  actorType: PipelineActorType;
  actorId?: string | null;
  reason?: string | null;
  occurredAt?: Date | null;
};

function assertValidFresh(input: RecordFactInput): PipelineFactClass {
  const spec = factTypeSpec(input.factType);
  if (!spec) throw new Error(`unknown factType "${input.factType}" (not in the ontology registry)`);
  if (SUPERSEDING_OPS.has(input.operation)) {
    throw new Error(`operation ${input.operation} supersedes a prior fact — use recordSupersession()`);
  }
  if (!freshOpValidForClass(input.operation, spec.factClass)) {
    throw new Error(`operation ${input.operation} is invalid for a ${spec.factClass} fact "${input.factType}" (GI-3)`);
  }
  if (spec.collection && !input.subjectKey) {
    throw new Error(`factType "${input.factType}" is a collection fact — subjectKey is required`);
  }
  if (REASON_REQUIRED.has(input.operation) && !input.reason) {
    throw new Error(`operation ${input.operation} requires a recorded reason`);
  }
  const payloadErr = spec.validate?.(input.payload as Record<string, unknown> | null | undefined);
  if (payloadErr) throw new Error(`invalid payload for "${input.factType}": ${payloadErr}`);
  return spec.factClass;
}

function baseData(input: RecordFactInput, factClass: PipelineFactClass, provenance: PipelineFactProvenance) {
  return {
    organizationId: input.organizationId,
    opportunityId: input.opportunityId,
    factType: input.factType,
    factClass,
    subjectKey: input.subjectKey ?? null,
    state: input.state ?? null,
    payload: (input.payload ?? Prisma.JsonNull) as Prisma.InputJsonValue,
    policyVersion: input.policyVersion ?? null,
    ruleSetVersion: input.ruleSetVersion ?? null,
    artifactVersion: input.artifactVersion ?? null,
    operation: input.operation,
    actorType: input.actorType,
    actorId: input.actorId ?? null,
    provenance,
    reason: input.reason ?? null,
    occurredAt: input.occurredAt ?? null,
  };
}

/** Assert a FRESH fact (starts a new supersession chain). Insert-only. */
export async function recordFact(input: RecordFactInput): Promise<PipelineFact> {
  const factClass = assertValidFresh(input);
  return prisma.pipelineFact.create({
    data: { ...baseData(input, factClass, PipelineFactProvenance.VERIFIED), factChainId: randomUUID() },
  });
}

/** Record a MIGRATION-ORIGIN fact — provenance + migration principal enforced (STM §9c, AUTH-INV-9). */
export async function recordMigrationFact(
  input: Omit<RecordFactInput, "actorType" | "actorId"> & { actorId: string },
): Promise<PipelineFact> {
  const full: RecordFactInput = { ...input, actorType: PipelineActorType.MIGRATION_PRINCIPAL };
  const factClass = assertValidFresh(full);
  return prisma.pipelineFact.create({
    data: { ...baseData(full, factClass, PipelineFactProvenance.MIGRATION_ORIGIN), factChainId: randomUUID() },
  });
}

export type SupersedeInput = {
  operation: PipelineFactOperation; // RETRACT | CORRECT | INVALIDATE
  reason: string; // always required
  actorType: PipelineActorType;
  actorId?: string | null;
  state?: string | null;
  payload?: Prisma.InputJsonValue | null;
  policyVersion?: string | null;
  ruleSetVersion?: string | null;
  artifactVersion?: string | null;
  occurredAt?: Date | null;
};

/**
 * Supersede a prior fact via a NEW linked row (append-only — the prior is never mutated). The successor
 * inherits the prior's factType / factClass / subjectKey / factChainId; only the operation + reason (+
 * any corrected state/payload/versions) differ. RETRACT applies to a DECISION; INVALIDATE to an
 * ARTIFACT/EVIDENCE; CORRECT to any.
 */
export async function recordSupersession(
  organizationId: string,
  priorFactId: string,
  input: SupersedeInput,
): Promise<PipelineFact> {
  if (!SUPERSEDING_OPS.has(input.operation)) {
    throw new Error(`operation ${input.operation} is not a supersession — use recordFact()`);
  }
  if (!input.reason) throw new Error(`operation ${input.operation} requires a recorded reason`);
  const prior = await prisma.pipelineFact.findFirst({ where: { id: priorFactId, organizationId } });
  if (!prior) throw new Error(`prior fact ${priorFactId} not found in organization (fail closed)`);
  if (input.operation === PipelineFactOperation.RETRACT && prior.factClass !== PipelineFactClass.DECISION) {
    throw new Error(`RETRACT applies only to a DECISION fact (prior is ${prior.factClass})`);
  }
  if (input.operation === PipelineFactOperation.INVALIDATE && prior.factClass === PipelineFactClass.DECISION) {
    throw new Error(`INVALIDATE applies to ARTIFACT/EVIDENCE, not a DECISION (use RETRACT)`);
  }
  return prisma.pipelineFact.create({
    data: {
      organizationId,
      opportunityId: prior.opportunityId,
      factType: prior.factType,
      factClass: prior.factClass,
      subjectKey: prior.subjectKey,
      state: input.state ?? null,
      payload: (input.payload ?? Prisma.JsonNull) as Prisma.InputJsonValue,
      policyVersion: input.policyVersion ?? null,
      ruleSetVersion: input.ruleSetVersion ?? null,
      artifactVersion: input.artifactVersion ?? null,
      operation: input.operation,
      supersedesFactId: prior.id,
      factChainId: prior.factChainId, // constant across the chain (semantic identity)
      actorType: input.actorType,
      actorId: input.actorId ?? null,
      provenance: prior.provenance,
      reason: input.reason,
      occurredAt: input.occurredAt ?? null,
    },
  });
}

/** Complete, immutable history for an opportunity, in authoritative order (globalSequence). */
export async function reconstructHistory(organizationId: string, opportunityId: string): Promise<PipelineFact[]> {
  return prisma.pipelineFact.findMany({
    where: { organizationId, opportunityId },
    orderBy: { globalSequence: "asc" },
  });
}

/**
 * The ACTIVE fact set — DERIVED (a fact is active iff no row supersedes it). This is disposable
 * derived state (Constitution Law 4); the ledger stores no active/superseded flag.
 *
 * v1.1 (Law 12): a thin COMPATIBILITY FAÇADE delegating to the single Fact Graph Builder — active-fact
 * determination is structural (version-independent), so it delegates under the explicit STRUCTURAL_CONTEXT.
 * The signature/behavior are unchanged; there is now exactly one active-fact calculation (in the Builder).
 * Interpreting consumers should depend on the FactGraph, not on this convenience.
 */
export async function activeFacts(organizationId: string, opportunityId: string): Promise<PipelineFact[]> {
  const { buildFactGraph, STRUCTURAL_CONTEXT } = await import("./fact-graph");
  const graph = await buildFactGraph({ organizationId, opportunityId, versionContext: STRUCTURAL_CONTEXT });
  return [...graph.activeFacts];
}

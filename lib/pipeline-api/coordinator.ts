// E6 · API: the write Coordinator. Sequences the canonical subsystems and translates outcomes — it owns NO business
// logic (API-INV-1). Commit is transaction-scoped: every read+append runs on ONE tx client (API-INV-2); nothing
// authoritative happens before commit-revalidation succeeds (API-INV-3). Per-opportunity advisory lock + optimistic
// sequence guard make the append race-safe. Transport idempotency is a DEDICATED ApiIdempotencyRecord written
// atomically with the fact — a retry replays the ORIGINAL stored response (never re-projects). docs/architecture/E6_API_DESIGN.md.

import { createHash } from "node:crypto";

import { prisma } from "@/lib/prisma";
import { buildFactGraph, recordFact, type FactGraph } from "@/lib/pipeline-facts";
import { evaluateArtifact } from "@/lib/pipeline-predicates";
import { authorize, type AuthorizationDecision } from "@/lib/pipeline-authorization";
import { project } from "@/lib/pipeline-projection";
import type { ContractVersions, FactOperationRequest, FactOperationResponse } from "./types";
import { idempotencyConflictError, staleError, translateDenied } from "./errors";

const API_VERSION = "v1.0";

class CommitDenied extends Error {
  constructor(public readonly decision: AuthorizationDecision) { super("DENIED_IN_COMMIT"); }
}
class CommitStale extends Error {
  constructor(public readonly decision: AuthorizationDecision) { super("STALE_FACT_GRAPH"); }
}
class IdempotencyConflict extends Error {}

const contractVersions = (req: FactOperationRequest): ContractVersions => ({
  api: API_VERSION,
  ruleSetVersion: req.versionContext.ruleSetVersion,
  policyVersion: req.versionContext.policyVersion,
  authPolicyVersion: req.policy.policyVersion,
  spineVersion: req.spine.spineVersion,
  projectionVersion: req.projectionPolicy.projectionVersion,
});

const maxSeq = (graph: FactGraph): bigint => {
  const h = graph.history;
  return h.length ? h[h.length - 1].globalSequence : BigInt(0);
};

const sha = (v: unknown): string => createHash("sha256").update(JSON.stringify(v)).digest("hex").slice(0, 32);

/** Digest of the WRITE-defining request fields (not concurrency/presentation) — detects key-reuse-with-different-payload. */
function requestDigest(req: FactOperationRequest): string {
  return sha({
    org: req.organizationId, opp: req.opportunityId,
    actor: { id: req.actor.actorId, cls: req.actor.actorClass, caps: [...req.actor.capabilities].sort(), iv: req.actor.identityVersion ?? null },
    capability: req.capability, operation: req.operation, policy: [req.policy.policyId, req.policy.policyVersion],
    versionContext: req.versionContext, subjectKey: req.subjectKey ?? null, state: req.state ?? null, payload: req.payload ?? null, artifactVersion: req.artifactVersion ?? null,
  });
}

async function evaluateFor(req: FactOperationRequest, graph: FactGraph) {
  return req.policy.predicateRequirement === "REQUIRED" && req.policy.requiredPredicate
    ? evaluateArtifact(req.policy.requiredPredicate, { graph, ruleSetVersion: req.versionContext.ruleSetVersion, policyVersion: req.versionContext.policyVersion })
    : null;
}

const decide = (req: FactOperationRequest, graph: FactGraph, artifact: Awaited<ReturnType<typeof evaluateFor>>): AuthorizationDecision =>
  authorize({ actor: req.actor, capability: req.capability, operation: req.operation, policy: req.policy, evaluationArtifact: artifact });

/** Test-only hooks (never used in production paths). */
export type PerformOptions = { _faultAfterRecord?: boolean };

export async function perform(req: FactOperationRequest, opts: PerformOptions = {}): Promise<FactOperationResponse> {
  const cv = contractVersions(req);
  const graphReq = { organizationId: req.organizationId, opportunityId: req.opportunityId, versionContext: req.versionContext };
  const digest = requestDigest(req);

  // Pre-check — API-INV-3: no lock, no write.
  const graph0 = await buildFactGraph(graphReq);
  const decision0 = decide(req, graph0, await evaluateFor(req, graph0));
  if (!decision0.decision.allow) {
    return { requestId: req.requestId, outcome: "DENIED", decision: decision0, contractVersions: cv, error: translateDenied(decision0, cv) };
  }

  try {
    return await prisma.$transaction(async (tx) => {
      // §3 · per-opportunity advisory lock — serialize commits for this opportunity.
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`${req.organizationId}:${req.opportunityId}`})::bigint)`;

      // Transport idempotency: replay the ORIGINAL stored response for a known requestId (no second append).
      const prior = await tx.apiIdempotencyRecord.findUnique({ where: { organizationId_requestId: { organizationId: req.organizationId, requestId: req.requestId } } });
      if (prior) {
        if (prior.requestDigest !== digest) throw new IdempotencyConflict();
        return prior.originalResponse as unknown as FactOperationResponse;
      }

      // API-INV-2 · fresh validation on the SAME tx client.
      const graphF = await buildFactGraph(graphReq, tx);
      const decisionF = decide(req, graphF, await evaluateFor(req, graphF));
      if (!decisionF.decision.allow) throw new CommitDenied(decisionF);

      // Optimistic concurrency (§3): the ledger must not have advanced past the caller's expected state.
      const ev = req.expectedVersion ?? {};
      const seqAdvanced = ev.expectedGlobalSequence != null && maxSeq(graphF) > BigInt(ev.expectedGlobalSequence);
      const decisionChanged = ev.expectedDecisionId != null && decisionF.decision.decisionId !== ev.expectedDecisionId;
      if (seqAdvanced || decisionChanged) throw new CommitStale(decisionF);

      const fact = await recordFact(
        { organizationId: req.organizationId, opportunityId: req.opportunityId, factType: req.operation.factType, operation: req.operation.op as never, subjectKey: req.subjectKey ?? null, state: req.state ?? null, payload: (req.payload ?? null) as never, artifactVersion: req.artifactVersion ?? null, actorType: req.actor.actorClass as never, actorId: req.actor.actorId },
        tx,
      );
      if (opts._faultAfterRecord) throw new Error("INJECTED_FAULT_AFTER_RECORD"); // rollback test — tx must undo the append + record

      // Post-commit projection built INSIDE the tx (graph sees its own append — §5), so the STORED response is exact.
      const graphA = await buildFactGraph(graphReq, tx);
      const committedFact = graphA.history.find((f) => f.id === fact.id)!;
      const projection = project({ spine: req.spine, graph: graphA, projectionPolicy: req.projectionPolicy });
      const response: FactOperationResponse = {
        requestId: req.requestId,
        outcome: "COMMITTED",
        decision: decisionF,
        committedFact: { id: committedFact.id, factChainId: committedFact.factChainId, globalSequence: String(committedFact.globalSequence), provenance: committedFact.provenance },
        committedGlobalSequence: String(committedFact.globalSequence),
        projectedThroughGlobalSequence: String(maxSeq(graphA)),
        projection,
        contractVersions: cv,
      };

      // Idempotency record written ATOMICALLY with the fact — stores the ORIGINAL response for replay.
      await tx.apiIdempotencyRecord.create({
        data: { organizationId: req.organizationId, requestId: req.requestId, requestDigest: digest, factId: fact.id, decisionId: decisionF.decision.decisionId, originalResponse: response as never, responseDigest: sha(response) },
      });
      return response;
    });
  } catch (e) {
    if (e instanceof CommitStale) return { requestId: req.requestId, outcome: "STALE", decision: e.decision, contractVersions: cv, error: staleError(e.decision, cv) };
    if (e instanceof CommitDenied) return { requestId: req.requestId, outcome: "DENIED", decision: e.decision, contractVersions: cv, error: translateDenied(e.decision, cv) };
    if (e instanceof IdempotencyConflict) return { requestId: req.requestId, outcome: "DENIED", decision: decision0, contractVersions: cv, error: idempotencyConflictError(cv) };
    throw e; // rollback / infrastructure — no COMMITTED response, no partial ledger state
  }
}

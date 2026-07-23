// E6 · API: the write Coordinator. Sequences the canonical subsystems and translates outcomes — it owns NO business
// logic (API-INV-1). Commit is transaction-scoped: every read+append runs on ONE tx client (API-INV-2); nothing
// authoritative happens before commit-revalidation succeeds (API-INV-3). Per-opportunity advisory lock + optimistic
// sequence guard make the append race-safe. Transport idempotency via requestId. docs/architecture/E6_API_DESIGN.md.

import { prisma } from "@/lib/prisma";
import { buildFactGraph, recordFact, type FactGraph } from "@/lib/pipeline-facts";
import { evaluateArtifact } from "@/lib/pipeline-predicates";
import { authorize } from "@/lib/pipeline-authorization";
import { project } from "@/lib/pipeline-projection";
import type { ContractVersions, FactOperationRequest, FactOperationResponse } from "./types";
import { staleError, translateDenied } from "./errors";
import type { AuthorizationDecision } from "@/lib/pipeline-authorization";

const API_VERSION = "v1.0";

class CommitDenied extends Error {
  constructor(public readonly decision: AuthorizationDecision) { super("DENIED_IN_COMMIT"); }
}
class CommitStale extends Error {
  constructor(public readonly decision: AuthorizationDecision) { super("STALE_FACT_GRAPH"); }
}

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

async function evaluateFor(req: FactOperationRequest, graph: FactGraph) {
  return req.policy.predicateRequirement === "REQUIRED" && req.policy.requiredPredicate
    ? evaluateArtifact(req.policy.requiredPredicate, { graph, ruleSetVersion: req.versionContext.ruleSetVersion, policyVersion: req.versionContext.policyVersion })
    : null;
}

function decide(req: FactOperationRequest, graph: FactGraph, artifact: Awaited<ReturnType<typeof evaluateFor>>): AuthorizationDecision {
  return authorize({ actor: req.actor, capability: req.capability, operation: req.operation, policy: req.policy, evaluationArtifact: artifact });
}

/** Test-only hooks (never used in production paths). */
export type PerformOptions = { _faultAfterRecord?: boolean };

export async function perform(req: FactOperationRequest, opts: PerformOptions = {}): Promise<FactOperationResponse> {
  const cv = contractVersions(req);
  const graphReq = { organizationId: req.organizationId, opportunityId: req.opportunityId, versionContext: req.versionContext };

  // Pre-check — API-INV-3: no lock, no write.
  const graph0 = await buildFactGraph(graphReq);
  const decision0 = decide(req, graph0, await evaluateFor(req, graph0));
  if (!decision0.decision.allow) {
    return { requestId: req.requestId, outcome: "DENIED", decision: decision0, contractVersions: cv, error: translateDenied(decision0, cv) };
  }

  const reqReason = `API:req:${req.requestId}`;
  let committedFactId: string | null = null;
  let committedDecision = decision0;

  try {
    const out = await prisma.$transaction(async (tx) => {
      // §3 · per-opportunity advisory lock — serialize commits for this opportunity.
      // $executeRaw (not $queryRaw) — the lock function returns void, which $queryRaw cannot deserialize.
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`${req.organizationId}:${req.opportunityId}`})::bigint)`;

      // Transport idempotency: a fact already recorded for this requestId ⇒ replay (no second append).
      const existing = await tx.pipelineFact.findFirst({ where: { organizationId: req.organizationId, reason: reqReason } });
      if (existing) return { fact: existing, decision: decision0 };

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
        { organizationId: req.organizationId, opportunityId: req.opportunityId, factType: req.operation.factType, operation: req.operation.op as never, subjectKey: req.subjectKey ?? null, state: req.state ?? null, payload: (req.payload ?? null) as never, artifactVersion: req.artifactVersion ?? null, actorType: req.actor.actorClass as never, actorId: req.actor.actorId, reason: reqReason },
        tx,
      );

      if (opts._faultAfterRecord) throw new Error("INJECTED_FAULT_AFTER_RECORD"); // rollback test — tx must undo the append

      return { fact, decision: decisionF };
    });
    committedFactId = out.fact.id;
    committedDecision = out.decision;
  } catch (e) {
    if (e instanceof CommitStale) return { requestId: req.requestId, outcome: "STALE", decision: e.decision, contractVersions: cv, error: staleError(e.decision, cv) };
    if (e instanceof CommitDenied) return { requestId: req.requestId, outcome: "DENIED", decision: e.decision, contractVersions: cv, error: translateDenied(e.decision, cv) };
    throw e; // rollback / infrastructure — no COMMITTED response, no partial ledger state
  }

  // Post-commit projection — built from a graph that INCLUDES the committed fact (§5).
  const graphA = await buildFactGraph(graphReq);
  const committedFact = graphA.history.find((f) => f.id === committedFactId)!;
  const projection = project({ spine: req.spine, graph: graphA, projectionPolicy: req.projectionPolicy });
  return {
    requestId: req.requestId,
    outcome: "COMMITTED",
    decision: committedDecision,
    committedFact: { id: committedFact.id, factChainId: committedFact.factChainId, globalSequence: String(committedFact.globalSequence), provenance: committedFact.provenance },
    committedGlobalSequence: String(committedFact.globalSequence),
    projectedThroughGlobalSequence: String(maxSeq(graphA)),
    projection,
    contractVersions: cv,
  };
}

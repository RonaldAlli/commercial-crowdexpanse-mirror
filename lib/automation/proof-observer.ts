// The harmless internal PROOF automation for Phase 2.0.1 (Commit 6): a READ-ONLY
// closing-readiness observation. It exercises the entire spine — scheduling, queueing,
// policy, execution, audit, retry, idempotency, org isolation — with the safest possible
// payload: it reads the EXISTING shared closing projection (projectClosingBadges, TX-6),
// records an immutable AutomationExecution, and produces NO authoritative domain effect.
//
// It NEVER: writes any Opportunity/Closing/Escrow/Financing/Assignment/Underwriting/Document/
// Task row, moves a stage, completes/waives a checklist item, makes a PAID decision, sends a
// communication, calls AI, or re-derives closing logic. producedDomainEffect is ALWAYS false.

import type { AutomationJob } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import {
  projectClosingBadges,
  isClosingRelevantStage,
  IN_FLIGHT_STAGES,
  type ClosingBadgeSummary,
} from "@/lib/transaction-dashboard";
import type { AutomationHandler } from "./executor";
import type { Seeder } from "./scheduler";
import { evaluatePolicy, POLICY_VERSION, CLOSING_READINESS_POLICY_KEY, type PolicyContext } from "./policy";
import { contextFingerprint, hourBucket } from "./idempotency";
import { enqueueJob, markQueued } from "./job-service";
import { supersedeOlderOccurrences } from "./scheduler";

export const CLOSING_READINESS_AUTOMATION_TYPE = "closing_readiness_observation";
const SOURCE_TYPE = "opportunity";

// Off by default: the proof job records its immutable execution (self-auditing) and does NOT
// pollute ActivityLog. Set AUTOMATION_EMIT_OBSERVATION=1 to also emit one attributed,
// best-effort automation.*.observed row (the linkage seam, exercised on demand).
const EMIT_OBSERVATION = process.env.AUTOMATION_EMIT_OBSERVATION === "1";

type ClosingOpportunity = {
  id: string;
  stage: (typeof IN_FLIGHT_STAGES)[number] | "PAID" | string;
  escrow: { status: string } | null;
  financing: { status: string } | null;
  assignment: { status: string } | null;
  closingChecklist: { items: { required: boolean; status: string }[] } | null;
};

/** Org-scoped read of exactly the fields projectClosingBadges needs. Fail closed → null. */
async function readClosingOpportunity(
  organizationId: string,
  opportunityId: string,
): Promise<ClosingOpportunity | null> {
  return prisma.opportunity.findFirst({
    where: { id: opportunityId, organizationId },
    select: {
      id: true,
      stage: true,
      escrow: { select: { status: true } },
      financing: { select: { status: true } },
      assignment: { select: { status: true } },
      closingChecklist: { select: { items: { select: { required: true, status: true } } } },
    },
  }) as Promise<ClosingOpportunity | null>;
}

/** Build the ClosingBadgeSummary via the SHARED projection — never re-deriving closing logic. */
function observeClosing(opp: ClosingOpportunity): ClosingBadgeSummary {
  return projectClosingBadges({
    stage: opp.stage as never,
    checklistItems: opp.closingChecklist
      ? opp.closingChecklist.items.map((i) => ({ required: i.required, status: i.status as never }))
      : null,
    escrow: opp.escrow ? { status: opp.escrow.status as never } : null,
    financing: opp.financing ? { status: opp.financing.status as never } : null,
    assignment: opp.assignment ? { status: opp.assignment.status as never } : null,
  });
}

function summaryLabel(summary: ClosingBadgeSummary): string {
  if (!summary.readiness) return "closing not started";
  return summary.readiness.ready
    ? "closing ready"
    : `${summary.readiness.blockerCount} blocker(s)`;
}

/** The executor handler for the read-only closing-readiness observation. */
export const closingReadinessHandler: AutomationHandler = {
  automationType: CLOSING_READINESS_AUTOMATION_TYPE,
  policyKey: CLOSING_READINESS_POLICY_KEY,
  policyVersion: POLICY_VERSION,

  async gatherContext(job: AutomationJob) {
    const opp = await readClosingOpportunity(job.organizationId, job.sourceId);
    if (!opp) {
      const context: PolicyContext = {
        organizationId: job.organizationId,
        principalAllowed: true,
        targetPresent: false,
        targetInScope: false,
        currentContextFingerprint: "",
      };
      return { context, fingerprint: "" };
    }
    const summary = observeClosing(opp); // SHARED projection (TX-6) — not re-derived
    const fingerprint = contextFingerprint({ stage: opp.stage, summary });
    const context: PolicyContext = {
      organizationId: job.organizationId,
      principalAllowed: true, // the read-only automation principal may observe (AUTOMATION READ)
      targetPresent: true,
      targetInScope: isClosingRelevantStage(opp.stage as never),
      currentContextFingerprint: fingerprint,
    };
    return { context, fingerprint, observation: summary };
  },

  policy(context: PolicyContext) {
    return evaluatePolicy(context);
  },

  async perform(_job, _context, observation) {
    // READ-ONLY: no writes of any kind. producedDomainEffect is ALWAYS false.
    const summary = observation as ClosingBadgeSummary | undefined;
    const label = summary ? summaryLabel(summary) : "observed";
    return {
      producedDomainEffect: false,
      observationSummary: EMIT_OBSERVATION ? `Automation observed ${label}` : undefined,
    };
  },
};

/** The scheduler seeder: one job per in-flight opportunity per hour bucket, per org. */
export const closingReadinessSeeder: Seeder = async (organizationId, now) => {
  const occurrenceKey = hourBucket(now);
  const opps = await prisma.opportunity.findMany({
    where: { organizationId, stage: { in: IN_FLIGHT_STAGES } },
    select: { id: true },
  });
  let seeded = 0;
  for (const { id } of opps) {
    const job = await enqueueJob({
      organizationId,
      automationType: CLOSING_READINESS_AUTOMATION_TYPE,
      sourceType: SOURCE_TYPE,
      sourceId: id,
      policyKey: CLOSING_READINESS_POLICY_KEY,
      policyVersion: POLICY_VERSION,
      occurrenceKey,
    });
    if (job.status === "PENDING") {
      await markQueued(job.id, now);
      await supersedeOlderOccurrences(organizationId, CLOSING_READINESS_AUTOMATION_TYPE, SOURCE_TYPE, id, occurrenceKey);
      seeded++;
    }
  }
  return seeded;
};

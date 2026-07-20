// Attestation events record a CONTROLLED, AUDITED EXCEPTION — a policy-gated action taken without its
// usual authoritative truth (e.g. an imported/mid-lifecycle deal). One typed builder keeps the
// ActivityLog payload consistent across every current and future attestation type (stage, buyer,
// diligence, closing, assignment, …) instead of hand-assembling JSON in multiple places.
import type { OpportunityStage } from "@prisma/client";

export type AttestationKind = "stage" | "buyer" | "diligence" | "closing" | "assignment";

/** The ActivityLog fields an attestation writes (actor + timestamp are ActivityLog columns). */
export type AttestationEvent = { eventType: string; eventLabel: string; eventBody: string };

export type AttestationEventInput = {
  kind: AttestationKind;
  policyId: string;
  reason: string;
  source: string; // "ui" | "import" | "automation" | "api" ...
  missingTruth: string[];
  missingArtifacts: string[];
  label: string; // human summary for eventLabel
  detail?: Record<string, unknown>; // extra structured fields merged into the payload
};

/** Generic builder → `opportunity.<kind>_attested` with a structured JSON body. */
export function buildAttestationEvent(input: AttestationEventInput): AttestationEvent {
  return {
    eventType: `opportunity.${input.kind}_attested`,
    eventLabel: input.label,
    eventBody: JSON.stringify({
      kind: input.kind,
      policyId: input.policyId,
      missingTruth: input.missingTruth,
      missingArtifacts: input.missingArtifacts,
      reason: input.reason,
      source: input.source,
      ...(input.detail ?? {}),
    }),
  };
}

/** Stage-transition attestation (the Slice 1 case). Later kinds get their own thin wrappers. */
export function buildStageAttestationEvent(args: {
  stage: OpportunityStage;
  stageLabel: string;
  policyId: string;
  reason: string;
  source: string;
  missingTruth: string[];
  missingArtifacts: string[];
}): AttestationEvent {
  return buildAttestationEvent({
    kind: "stage",
    policyId: args.policyId,
    reason: args.reason,
    source: args.source,
    missingTruth: args.missingTruth,
    missingArtifacts: args.missingArtifacts,
    label: `Attested ${args.stageLabel} without ${args.missingArtifacts.join("; ")}`,
    detail: { stage: args.stage },
  });
}

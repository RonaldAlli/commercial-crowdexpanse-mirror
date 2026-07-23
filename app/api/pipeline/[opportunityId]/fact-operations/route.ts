// E7 · thin HTTP adapter — perform an authorized fact operation. Maps the transport DTO onto FactOperationRequest
// and delegates to the Coordinator; the response (COMMITTED/DENIED/STALE) is returned AS-IS. No business logic here.
import { type NextRequest, NextResponse } from "next/server";

import { perform } from "@/lib/pipeline-api";
import { getPolicy } from "@/lib/pipeline-authorization";
import { SS1 } from "@/lib/pipeline-projection";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest, { params }: { params: { opportunityId: string } }) {
  const body = await req.json();
  const policy = getPolicy(body.policyId, body.policyVersion ?? "ap-1");
  if (!policy) {
    return NextResponse.json({ error: { category: "validation", httpStatus: 400, detail: `unknown policyId ${body.policyId}` } }, { status: 400 });
  }
  const response = await perform({
    requestId: body.requestId,
    organizationId: body.organizationId,
    opportunityId: params.opportunityId,
    actor: body.actor,
    capability: body.capability,
    operation: body.operation,
    policy,
    versionContext: body.versionContext ?? { policyVersion: "p1", ruleSetVersion: "rs-1" },
    expectedVersion: body.expectedVersion,
    subjectKey: body.subjectKey ?? null,
    state: body.state ?? null,
    payload: body.payload ?? null,
    artifactVersion: body.artifactVersion ?? null,
    spine: SS1,
    projectionPolicy: body.projectionPolicy ?? { projectionVersion: "pp-1" },
  });
  const status = response.outcome === "COMMITTED" ? 200 : response.error?.httpStatus ?? 422;
  return NextResponse.json(response, { status });
}

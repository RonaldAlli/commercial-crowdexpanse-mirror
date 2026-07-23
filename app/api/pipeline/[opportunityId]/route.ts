// E7 · thin HTTP adapter — read the pipeline for an opportunity. Validates transport only; the read assembly
// (build FactGraph → project → view models) is the canonical path (API-INV-1 / UI-INV-1).
//
// Tenant scope is SESSION-AUTHORITATIVE (resolveOwnedPipelineScope): the organization is derived from the
// authenticated user, never from a request param. A cross-tenant or unknown opportunity is 404 with no body
// detail — tenant existence is never disclosed.
import { type NextRequest, NextResponse } from "next/server";

import { requireUser } from "@/lib/auth";
import { resolveOwnedPipelineScope } from "@/lib/pipeline-tenant";
import { readPipeline } from "@/lib/pipeline-view-models";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest, { params }: { params: { opportunityId: string } }) {
  const user = await requireUser();
  const scope = await resolveOwnedPipelineScope(user, params.opportunityId);
  if (!scope) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  const activeTab = req.nextUrl.searchParams.get("tab") ?? undefined;
  const { pipeline, render } = await readPipeline({ organizationId: scope.organizationId, opportunityId: scope.opportunityId, activeTab });
  return NextResponse.json({ pipeline, render });
}

// E7 · thin HTTP adapter — read the pipeline for an opportunity. Validates transport only; the read assembly
// (build FactGraph → project → view models) is the canonical path (API-INV-1 / UI-INV-1).
import { type NextRequest, NextResponse } from "next/server";

import { readPipeline } from "@/lib/pipeline-view-models";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest, { params }: { params: { opportunityId: string } }) {
  const organizationId = req.nextUrl.searchParams.get("organizationId") ?? "";
  if (!organizationId) {
    return NextResponse.json({ error: { category: "validation", httpStatus: 400, detail: "organizationId required" } }, { status: 400 });
  }
  const activeTab = req.nextUrl.searchParams.get("tab") ?? undefined;
  const { pipeline, render } = await readPipeline({ organizationId, opportunityId: params.opportunityId, activeTab });
  return NextResponse.json({ pipeline, render });
}

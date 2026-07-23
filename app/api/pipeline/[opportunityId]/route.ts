// E7 · pipeline READ route — DISABLED FOR LAUNCH.
//
// The Slice-2 pipeline is dormant and unlinked; it is not part of the launch workflow. Its HTTP surface
// is closed until the pipeline is activated (the Opportunity Pipeline Migration Initiative). The read
// assembly (lib/pipeline-view-models) remains intact for that work; only the exposed endpoint is gated.
// Returns 404 for every caller (non-disclosure).
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json({ error: "Not found" }, { status: 404 });
}

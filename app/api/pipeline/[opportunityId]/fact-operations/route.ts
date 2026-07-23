// E7 · pipeline fact-operations WRITE route — DISABLED FOR LAUNCH.
//
// The Slice-2 pipeline is dormant and not part of the launch workflow (the live app runs the legacy
// stage system). This write path previously accepted a CLIENT-SUPPLIED actor/capability, which an
// authenticated user could spoof. Rather than build session→actor derivation for a subsystem we are
// not activating, the endpoint is CLOSED until the pipeline is activated (the Opportunity Pipeline
// Migration Initiative) — at which point the actor MUST be derived from the authenticated session and
// its capabilities from the user's role. Returns 404 for every caller (non-disclosure).
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function POST() {
  return NextResponse.json({ error: "Not found" }, { status: 404 });
}

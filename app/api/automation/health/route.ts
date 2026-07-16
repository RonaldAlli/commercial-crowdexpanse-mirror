import { NextResponse } from "next/server";

import { getCurrentUser } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { fetchAutomationHealth } from "@/lib/automation/job-service";

// ADMIN-only, organization-scoped read of the Automation operational-health projection
// (v2.0.1). Automation is a system-owned domain: this is OPERATOR visibility, not a pipeline
// surface — the AUTOMATION resource is ADMIN read/write only. Returns only aggregate health
// counters (no per-row payloads, no secrets). A non-admin / cross-org caller sees a 404 so the
// surface is not disclosed. The projection is pure (lib/automation/health.ts); this route only
// scopes, authorizes, and serializes.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const user = await getCurrentUser();
  if (!user) {
    return new Response("Unauthorized", { status: 401 });
  }
  if (!can(user.role, "READ", "AUTOMATION")) {
    // Match the cross-org "pretend it doesn't exist" convention rather than leaking a 403.
    return new Response("Not found", { status: 404 });
  }

  const summary = await fetchAutomationHealth(user.organizationId, new Date());
  return NextResponse.json({ organizationId: user.organizationId, health: summary });
}

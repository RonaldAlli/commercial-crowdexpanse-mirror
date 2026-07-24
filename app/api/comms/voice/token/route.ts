// Branch 2 — WebRTC token endpoint. Org-scoped (Authority Rule 1). Reads the org's CommsProviderConfig
// and reports whether voice is configured. It NEVER returns the API key or any stored secret — when a real
// Telnyx adapter exists it will return only a short-lived WebRTC credential. Until configured, it returns
// { configured: false } so the softphone shows "Voice provider not configured" rather than failing.
import { NextResponse } from "next/server";

import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { resolveVoiceStatus } from "@/lib/comms/voice-provider";

export const dynamic = "force-dynamic";

export async function GET() {
  const user = await requireUser();
  const cfg = await prisma.commsProviderConfig.findUnique({
    where: { organizationId: user.organizationId },
    select: { voiceEnabled: true, apiKeyEnc: true, connectionId: true },
  });
  const status = resolveVoiceStatus(
    cfg ? { voiceEnabled: cfg.voiceEnabled, hasApiKey: Boolean(cfg.apiKeyEnc), hasConnectionId: Boolean(cfg.connectionId) } : null,
  );
  // configured=false today (no real Telnyx adapter yet). No secret is ever included in the response.
  return NextResponse.json({ configured: status.configured, reason: status.reason });
}

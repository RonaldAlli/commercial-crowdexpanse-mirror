"use server";

import { revalidatePath } from "next/cache";

import { requireUser } from "@/lib/auth";
import { checkAuthorized, GENERIC_DENIAL } from "@/lib/authorize";
import { prisma } from "@/lib/prisma";
import { encryptSecret, commsKeyHex } from "@/lib/comms/secret-box";
import { parseCommsSettingsForm } from "@/lib/comms/provider-settings";

export type CommsSettingsState = { ok?: boolean; error?: string; message?: string } | undefined;

/**
 * Save the org's Telnyx communications configuration. ADMIN-only (MANAGE ORGANIZATION), org-scoped
 * (Authority Rule 1). The API key is encrypted at rest with AES-256-GCM and NEVER returned to the browser;
 * a blank API-key field keeps the existing key. Fail-closed: storing a new key requires COMMS_ENCRYPTION_KEY.
 * Deterministic — no AI, no network. Providers remain inert until a real adapter ships.
 */
export async function saveCommsSettings(formData: FormData): Promise<CommsSettingsState> {
  const actor = await requireUser();
  if (!(await checkAuthorized(actor, "MANAGE", "ORGANIZATION"))) {
    return { error: GENERIC_DENIAL };
  }

  const parsed = parseCommsSettingsForm(formData);
  if (!parsed.ok) return { error: parsed.error };
  const v = parsed.value;

  // Encrypt a new API key only when one was supplied. Fail-closed if the key isn't configured yet.
  let apiKeyEnc: string | undefined;
  let apiKeyLast4: string | undefined;
  if (v.newApiKey) {
    let keyHex: string;
    try {
      keyHex = commsKeyHex();
    } catch {
      return { error: "Set COMMS_ENCRYPTION_KEY on the server before storing an API key (openssl rand -hex 32)." };
    }
    apiKeyEnc = encryptSecret(v.newApiKey, keyHex);
    apiKeyLast4 = v.newApiKey.slice(-4);
  }

  const common = {
    fromNumber: v.fromNumber,
    connectionId: v.connectionId,
    messagingProfileId: v.messagingProfileId,
    smsEnabled: v.smsEnabled,
    voiceEnabled: v.voiceEnabled,
    whatsappEnabled: v.whatsappEnabled,
    emailEnabled: v.emailEnabled,
    ...(apiKeyEnc ? { apiKeyEnc, apiKeyLast4 } : {}),
  };

  await prisma.commsProviderConfig.upsert({
    where: { organizationId: actor.organizationId },
    create: { organizationId: actor.organizationId, provider: "TELNYX", ...common },
    update: common,
  });

  revalidatePath("/settings/communications");
  revalidatePath("/acquire");
  return { ok: true, message: "Communications settings saved." };
}

/**
 * Test the provider connection. Inert until a real Telnyx adapter + credentials exist: it never dials out
 * today. It reports what still needs to be configured so an admin knows exactly why a live test isn't possible.
 */
export async function testCommsConnection(): Promise<CommsSettingsState> {
  const actor = await requireUser();
  if (!(await checkAuthorized(actor, "MANAGE", "ORGANIZATION"))) {
    return { error: GENERIC_DENIAL };
  }
  const cfg = await prisma.commsProviderConfig.findUnique({
    where: { organizationId: actor.organizationId },
    select: { apiKeyEnc: true, connectionId: true, voiceEnabled: true },
  });

  let keyReady = true;
  try {
    commsKeyHex();
  } catch {
    keyReady = false;
  }

  if (!keyReady) return { error: "COMMS_ENCRYPTION_KEY is not set — configure it before testing." };
  if (!cfg?.apiKeyEnc) return { error: "No API key saved yet — add your Telnyx API key first." };
  return {
    message: "Credentials stored. Live connection testing activates when the Telnyx adapter is enabled (a later step).",
  };
}

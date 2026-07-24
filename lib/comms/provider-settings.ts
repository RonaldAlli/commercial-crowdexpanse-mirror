// Branch 4 — pure logic for the operator communications settings screen. Validates the admin's Telnyx
// configuration input and summarizes per-channel readiness for display. No I/O, no secrets: encryption and
// persistence live in the server action; this module only decides "is the input valid" and "what's ready".

import { resolveChannelStatus, type ChannelConfig, type ChannelStatus } from "./conversation-view";
import { resolveVoiceStatus } from "./voice-provider";

export type VoiceReadinessInput = { voiceEnabled: boolean; hasApiKey: boolean; hasConnectionId: boolean } | null;

export type CommsSettingsInput = {
  fromNumber: string | null;
  connectionId: string | null;
  messagingProfileId: string | null;
  /** A NEW plaintext API key to store, or null to keep the existing one unchanged. */
  newApiKey: string | null;
  smsEnabled: boolean;
  voiceEnabled: boolean;
  whatsappEnabled: boolean;
  emailEnabled: boolean;
};

export type ParseResult =
  | { ok: true; value: CommsSettingsInput }
  | { ok: false; error: string };

const E164 = /^\+[1-9]\d{6,14}$/;

/** Trim to null so blank form fields become NULL rather than "" in the database. */
export function blankToNull(v: FormDataEntryValue | null): string | null {
  if (typeof v !== "string") return null;
  const t = v.trim();
  return t.length === 0 ? null : t;
}

/** Validate the settings form. Fail-closed: a present-but-malformed value is an error, not silently dropped. */
export function parseCommsSettingsForm(fd: FormData): ParseResult {
  const fromNumber = blankToNull(fd.get("fromNumber"));
  if (fromNumber && !E164.test(fromNumber)) {
    return { ok: false, error: "From number must be E.164 format, e.g. +14045551234." };
  }
  const newApiKey = blankToNull(fd.get("apiKey"));
  if (newApiKey && newApiKey.length < 10) {
    return { ok: false, error: "API key looks too short — paste the full Telnyx API key." };
  }
  return {
    ok: true,
    value: {
      fromNumber,
      connectionId: blankToNull(fd.get("connectionId")),
      messagingProfileId: blankToNull(fd.get("messagingProfileId")),
      newApiKey,
      smsEnabled: fd.get("smsEnabled") === "on",
      voiceEnabled: fd.get("voiceEnabled") === "on",
      whatsappEnabled: fd.get("whatsappEnabled") === "on",
      emailEnabled: fd.get("emailEnabled") === "on",
    },
  };
}

export type CommsReadiness = {
  /** COMMS_ENCRYPTION_KEY present — secrets can be stored/read. Everything below is moot without it. */
  encryptionReady: boolean;
  channels: { key: "SMS" | "VOICE" | "WHATSAPP" | "EMAIL"; label: string; status: ChannelStatus }[];
  /** A live connection test is possible only when the key is set and a provider secret + voice are configured. */
  canTest: boolean;
};

/** Summarize what's ready to show on the settings screen. Composes the existing channel/voice resolvers. */
export function commsReadiness(
  cfg: ChannelConfig,
  voice: VoiceReadinessInput,
  encryptionReady: boolean,
): CommsReadiness {
  const voiceStatus = resolveVoiceStatus(voice);
  const channels: CommsReadiness["channels"] = [
    { key: "SMS", label: "SMS", status: resolveChannelStatus(cfg, "SMS") },
    { key: "VOICE", label: "Voice", status: voiceStatus },
    { key: "WHATSAPP", label: "WhatsApp", status: resolveChannelStatus(cfg, "WHATSAPP") },
    { key: "EMAIL", label: "Email", status: resolveChannelStatus(cfg, "EMAIL") },
  ];
  const hasApiKey = Boolean(cfg?.hasApiKey);
  return { encryptionReady, channels, canTest: encryptionReady && hasApiKey && voiceStatus.configured };
}

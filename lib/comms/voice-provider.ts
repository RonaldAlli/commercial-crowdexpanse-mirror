// Voice-provider config resolution + adapter seam (Branch 2). "Configured" means the org enabled voice
// AND the required Telnyx credentials are present. Until then, the inert adapter reports not-configured so
// the softphone shows a clear message instead of failing.

export type VoiceStatus = { configured: boolean; reason: string | null };

export function resolveVoiceStatus(
  input: { voiceEnabled: boolean; hasApiKey: boolean; hasConnectionId: boolean } | null,
): VoiceStatus {
  if (!input || !input.voiceEnabled) return { configured: false, reason: "Voice provider not configured" };
  if (!input.hasApiKey || !input.hasConnectionId) {
    return { configured: false, reason: "Voice provider not fully configured (missing credentials)" };
  }
  return { configured: true, reason: null };
}

// A short-lived WebRTC credential the browser uses to register. NEVER contains the API key.
export type VoiceToken = { configured: boolean; reason: string | null; token?: string; expiresAt?: string };

// The provider seam. A real TelnyxVoiceAdapter (credential-gated, later) mints the WebRTC credential via
// the Telnyx API. The inert adapter stands in until credentials + a real adapter exist.
export interface VoiceAdapter {
  readonly name: string;
  issueToken(): Promise<VoiceToken>;
}

export const inertVoiceAdapter: VoiceAdapter = {
  name: "inert",
  async issueToken() {
    return { configured: false, reason: "Voice provider not configured" };
  },
};

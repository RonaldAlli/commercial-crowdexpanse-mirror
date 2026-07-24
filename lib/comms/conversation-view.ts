// Pure shaping for the operator communications workspace (Branch 3): the unified chronological history
// and per-channel "configured?" resolution. UI is a thin renderer; this is unit-tested without a DB.

export type ThreadMessage = {
  id: string;
  channel: "SMS" | "EMAIL" | "WHATSAPP";
  direction: "INBOUND" | "OUTBOUND";
  body: string;
  subject: string | null;
  status: string;
  createdAt: Date;
};

export type ThreadCall = {
  id: string;
  direction: "INBOUND" | "OUTBOUND";
  status: string;
  durationSec: number | null;
  disposition: string | null;
  createdAt: Date;
};

export type HistoryItem =
  | { kind: "message"; at: number; message: ThreadMessage }
  | { kind: "call"; at: number; call: ThreadCall };

/** Merge messages + calls into one timeline, oldest first (thread order; newest at the bottom). */
export function buildUnifiedHistory(messages: ThreadMessage[], calls: ThreadCall[]): HistoryItem[] {
  const items: HistoryItem[] = [
    ...messages.map((m): HistoryItem => ({ kind: "message", at: m.createdAt.getTime(), message: m })),
    ...calls.map((c): HistoryItem => ({ kind: "call", at: c.createdAt.getTime(), call: c })),
  ];
  return items.sort((a, b) => a.at - b.at);
}

export type MessagingChannel = "SMS" | "EMAIL" | "WHATSAPP";

export type ChannelConfig = {
  smsEnabled: boolean;
  emailEnabled: boolean;
  whatsappEnabled: boolean;
  hasApiKey: boolean;
  hasMessagingProfile: boolean;
  hasFromNumber: boolean;
} | null;

export type ChannelStatus = { configured: boolean; reason: string | null };

const CHANNEL_LABEL: Record<MessagingChannel, string> = { SMS: "SMS", EMAIL: "Email", WHATSAPP: "WhatsApp" };

/** A messaging channel is sendable only when enabled AND its provider requirements are present. */
export function resolveChannelStatus(config: ChannelConfig, channel: MessagingChannel): ChannelStatus {
  const label = CHANNEL_LABEL[channel];
  if (!config) return { configured: false, reason: `${label} not configured` };
  const enabled = channel === "SMS" ? config.smsEnabled : channel === "EMAIL" ? config.emailEnabled : config.whatsappEnabled;
  if (!enabled) return { configured: false, reason: `${label} is disabled` };
  if (channel === "EMAIL") {
    // Email uses the provider abstraction (SMTP / email API) configured separately; enabled is enough here.
    return { configured: true, reason: null };
  }
  if (!config.hasApiKey || !config.hasMessagingProfile || !config.hasFromNumber) {
    return { configured: false, reason: `${label} credentials incomplete` };
  }
  return { configured: true, reason: null };
}

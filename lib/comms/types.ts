import type { CommsChannel } from "@prisma/client";

// The provider-agnostic outbound result — mirrors lib/email's SendResult.
export type CommsSendResult = {
  ok: boolean;
  providerMessageId?: string;
  error?: string;
  permanent?: boolean; // non-retryable failure (bad number, auth, hard bounce)
};

export type OutboundSms = { to: string; from: string; body: string };
export type OutboundEmail = { to: string; from: string; subject: string; html: string; text: string };
export type OutboundWhatsApp = { to: string; from: string; body: string };

/**
 * The provider seam. The Telnyx adapter (a later, credential-gated branch) implements this; nothing
 * above the adapter knows the provider. Browser voice (WebRTC softphone) is a separate client flow.
 */
export interface CommsAdapter {
  readonly name: string;
  supports(channel: CommsChannel): boolean;
  sendSms(msg: OutboundSms): Promise<CommsSendResult>;
  sendEmail(msg: OutboundEmail): Promise<CommsSendResult>;
  sendWhatsApp(msg: OutboundWhatsApp): Promise<CommsSendResult>;
}

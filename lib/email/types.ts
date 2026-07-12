// ---------------------------------------------------------------------------
// Contracts for the communications layer. These types are the seam every future
// feature (invitation delivery, password reset, notification digests, campaigns)
// depends on — the concrete transports and templates stay internal to lib/email.
// ---------------------------------------------------------------------------

/**
 * The open vocabulary of message templates. Grows as features are added; stored
 * as a plain string on EmailMessage (like ActivityLog.eventType) so new kinds
 * never require a migration. Slice 3d-i ships only the reference "system_alert".
 */
export type MessageKind = "system_alert";

/** A fully rendered message, ready to hand to a transport. */
export interface RenderedEmail {
  subject: string;
  html: string;
  text: string;
}

/** A template turns typed data into a rendered email + records its version. */
export interface Template {
  /** Bumped whenever the rendered output changes, for audit reproducibility. */
  version: number;
  render(data: unknown): RenderedEmail;
}

/** The concrete payload a transport sends (already rendered + addressed). */
export interface OutboundPayload {
  to: string;
  from: string;
  replyTo?: string;
  subject: string;
  html: string;
  text: string;
  headers?: Record<string, string>;
}

/** A transport's report on a single send attempt. */
export interface SendResult {
  ok: boolean;
  providerMessageId?: string;
  error?: string;
  /** True for non-retryable failures (bad address, auth, 5xx). */
  permanent?: boolean;
}

/** The dumb pipe. Every provider (Console, SMTP, future Resend/SES) implements this. */
export interface EmailTransport {
  readonly name: string;
  send(payload: OutboundPayload): Promise<SendResult>;
}

/** What a feature asks MessageService to send. */
export interface SendRequest {
  kind: MessageKind;
  to: string;
  /** Org context for the audit ledger + ActivityLog mirror (system mail may omit). */
  organizationId?: string;
  /** Actor to attribute the ActivityLog mirror to (optional). */
  actorId?: string;
  /** Template data (typed per kind at the call site). */
  data: unknown;
  /** Links the ledger row to the triggering entity (e.g. an invitation id). */
  correlationId?: string;
}

// ---------------------------------------------------------------------------
// Contracts for the communications layer. These types are the seam every future
// feature (invitation delivery, password reset, notification digests, campaigns)
// depends on — the concrete transports and templates stay internal to lib/email.
//
// MessageKind is a CLOSED registry: adding a kind requires extending the union,
// adding its payload type to MessagePayloads, and registering a template + retry
// policy — or the code will not compile. That keeps the platform type-safe as it
// grows instead of relying on runtime validation of `data: unknown`.
// ---------------------------------------------------------------------------

/** The closed set of message kinds. Extend only alongside a payload + template. */
export type MessageKind = "system_alert" | "invitation";

/** The typed payload each kind renders from. One entry per MessageKind. */
export interface MessagePayloads {
  system_alert: SystemAlertData;
  invitation: InvitationEmailData;
}

// --- per-kind payloads ------------------------------------------------------

export interface SystemAlertData {
  heading: string;
  message: string;
  orgName?: string;
}

export interface InvitationEmailData {
  orgName: string;
  inviterName?: string;
  role: string;
  /** Absolute accept URL (built from APP_URL). Rendered into the body only —
   *  never persisted; the raw token lives solely in the sender's memory. */
  acceptUrl: string;
  expiresAt: Date;
}

/**
 * How undelivered messages of a kind may be retried.
 *  - inline-only : one best-effort inline attempt, never drained. For kinds whose
 *                  payload carries an unrecoverable secret (invitation token, and
 *                  later password-reset token) — a background retry can't reuse
 *                  the token without persisting it, and rotating on an automatic
 *                  retry is forbidden, so there is no automatic retry at all.
 *                  Recovery is an explicit administrative action (Resend).
 *  - drainable   : transient failures wait as PENDING; the outbox drain re-attempts
 *                  by reconstructing data from the source of truth (system alerts,
 *                  future notification digests).
 *  - manual-only : intentionally requires a human to reissue (reserved for future
 *                  compliance-sensitive communications).
 */
export type RetryPolicy = "inline-only" | "drainable" | "manual-only";

/** A fully rendered message, ready to hand to a transport. */
export interface RenderedEmail {
  subject: string;
  html: string;
  text: string;
}

/** A template turns a kind's typed data into a rendered email + records its version. */
export interface Template<T> {
  /** Bumped whenever the rendered output changes, for audit reproducibility. */
  version: number;
  render(data: T): RenderedEmail;
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

/**
 * What a feature asks MessageService to send. Generic over the kind, so `data`
 * is compile-time checked against that kind's payload — passing the wrong shape
 * is a type error, not a runtime surprise.
 */
export interface SendRequest<K extends MessageKind = MessageKind> {
  kind: K;
  to: string;
  /** Org context for the audit ledger + ActivityLog mirror (system mail may omit). */
  organizationId?: string;
  /** Actor to attribute the ActivityLog mirror to (optional). */
  actorId?: string;
  /** Template data, typed to the kind. */
  data: MessagePayloads[K];
  /** Links the ledger row to the triggering entity (e.g. an invitation id). */
  correlationId?: string;
}

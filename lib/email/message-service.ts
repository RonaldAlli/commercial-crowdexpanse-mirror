import type { EmailMessage } from "@prisma/client";
import { EmailStatus } from "@prisma/client";

import { getEnv } from "@/lib/env";
import { prisma } from "@/lib/prisma";
import { renderTemplate } from "@/lib/email/templates";
import type {
  EmailTransport,
  MessageKind,
  OutboundPayload,
  RenderedEmail,
  SendRequest,
} from "@/lib/email/types";

// ---------------------------------------------------------------------------
// MessageService — the ONE seam between feature code and email delivery.
//
// It owns: template selection, rendering, persistence (the EmailMessage outbox),
// retries (drain), and transport selection. Features call send() and nothing
// else; they never touch a transport or a template.
//
// Outbox-lite + metadata-only storage:
//   - A row is written BEFORE the transport is called, then advanced to
//     SENT/FAILED (audit ledger that survives a crash mid-send).
//   - We deliberately DO NOT persist the rendered body, links, or tokens. That
//     means the drain can't replay a stored body — instead it reconstructs fresh
//     data from the source of truth through a per-kind `ResendResolver` keyed by
//     correlationId (e.g. re-fetch the invitation, regenerate a fresh link).
//     Kinds without a resolver are left untouched (never silently dropped).
// ---------------------------------------------------------------------------

/** Rebuilds a message's template data from the source of truth at drain time. */
export type ResendResolver = (row: EmailMessage) => Promise<unknown | null>;

export interface MessageServiceDeps {
  transport: EmailTransport;
  /** Optional per-kind rebuilders enabling durable re-send without stored bodies. */
  resolvers?: Partial<Record<MessageKind, ResendResolver>>;
}

export interface DrainResult {
  attempted: number;
  sent: number;
  failed: number;
  /** Candidate rows skipped because no resolver is registered for their kind. */
  unresolved: number;
}

function buildPayload(to: string, rendered: RenderedEmail): OutboundPayload {
  const { email } = getEnv();
  return {
    to,
    from: email.from,
    replyTo: email.replyTo,
    subject: rendered.subject,
    html: rendered.html,
    text: rendered.text,
  };
}

export class MessageService {
  private readonly transport: EmailTransport;
  private readonly resolvers: Partial<Record<MessageKind, ResendResolver>>;

  constructor({ transport, resolvers = {} }: MessageServiceDeps) {
    this.transport = transport;
    this.resolvers = resolvers;
  }

  /**
   * Send a message. Writes the ledger row (PENDING) first, attempts delivery,
   * and returns the updated row. Never throws on a delivery failure — the row's
   * status carries the outcome so a caller's primary action is never blocked.
   */
  async send(req: SendRequest): Promise<EmailMessage> {
    const rendered = renderTemplate(req.kind, req.data);
    const row = await prisma.emailMessage.create({
      data: {
        organizationId: req.organizationId ?? null,
        toEmail: req.to,
        template: req.kind,
        templateVersion: rendered.version,
        subject: rendered.subject,
        correlationId: req.correlationId ?? null,
        status: EmailStatus.PENDING,
      },
    });
    return this.attempt(row, rendered, req.actorId);
  }

  /**
   * Re-attempt undelivered rows (PENDING or FAILED with attempts remaining),
   * oldest first. The future cron target. Reconstructs data per kind, so no
   * message body is ever needed at rest.
   */
  async drain({ limit = 50 }: { limit?: number } = {}): Promise<DrainResult> {
    const rows = await prisma.emailMessage.findMany({
      where: {
        status: { in: [EmailStatus.PENDING, EmailStatus.FAILED] },
        attempts: { lt: prisma.emailMessage.fields.maxAttempts },
      },
      orderBy: { createdAt: "asc" },
      take: limit,
    });

    const result: DrainResult = { attempted: 0, sent: 0, failed: 0, unresolved: 0 };
    for (const row of rows) {
      const resolver = this.resolvers[row.template as MessageKind];
      if (!resolver) {
        result.unresolved++;
        continue;
      }
      const data = await resolver(row);
      if (data === null) {
        // Source of truth is gone (e.g. invitation deleted) — stop retrying.
        await prisma.emailMessage.update({
          where: { id: row.id },
          data: { status: EmailStatus.FAILED, error: "resend source no longer exists" },
        });
        result.failed++;
        continue;
      }
      const rendered = renderTemplate(row.template as MessageKind, data);
      const updated = await this.attempt(row, rendered);
      result.attempted++;
      if (updated.status === EmailStatus.SENT) result.sent++;
      else if (updated.status === EmailStatus.FAILED) result.failed++;
    }
    return result;
  }

  /** One delivery attempt against the transport; advances the row's status. */
  private async attempt(
    row: EmailMessage,
    rendered: RenderedEmail,
    actorId?: string,
  ): Promise<EmailMessage> {
    const attempts = row.attempts + 1;
    const res = await this.transport.send(buildPayload(row.toEmail, rendered));

    let status: EmailStatus;
    if (res.ok) status = EmailStatus.SENT;
    else if (res.permanent || attempts >= row.maxAttempts) status = EmailStatus.FAILED;
    else status = EmailStatus.PENDING;

    const updated = await prisma.emailMessage.update({
      where: { id: row.id },
      data: {
        attempts,
        status,
        lastAttemptAt: new Date(),
        sentAt: res.ok ? new Date() : row.sentAt,
        providerMessageId: res.providerMessageId ?? row.providerMessageId,
        error: res.ok ? null : (res.error ?? "send failed"),
      },
    });

    // ActivityLog mirror: lightweight, user-visible, org-scoped, and only on a
    // terminal transition (SENT / FAILED) — never on a will-retry PENDING.
    if (row.organizationId && status !== EmailStatus.PENDING) {
      await this.mirror(updated, actorId ?? null);
    }
    return updated;
  }

  private async mirror(row: EmailMessage, actorId: string | null): Promise<void> {
    const sent = row.status === EmailStatus.SENT;
    await prisma.activityLog
      .create({
        data: {
          organizationId: row.organizationId!,
          actorId,
          eventType: sent ? "email.sent" : "email.failed",
          eventLabel: sent
            ? `Email sent: ${row.template} → ${row.toEmail}`
            : `Email failed: ${row.template} → ${row.toEmail}`,
          // Metadata only — never the body/link/token.
          eventBody: JSON.stringify({
            template: row.template,
            templateVersion: row.templateVersion,
            status: row.status,
            attempts: row.attempts,
            providerMessageId: row.providerMessageId,
            correlationId: row.correlationId,
          }),
        },
      })
      // Best-effort: the audit mirror must never fail the send outcome.
      .catch(() => undefined);
  }
}

/** Default service wired from env — the app-facing singleton. */
export function createMessageService(deps: MessageServiceDeps): MessageService {
  return new MessageService(deps);
}

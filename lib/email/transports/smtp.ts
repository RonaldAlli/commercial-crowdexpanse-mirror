import nodemailer, { type Transporter } from "nodemailer";

import type { SmtpConfig } from "@/lib/env";
import type { EmailTransport, OutboundPayload, SendResult } from "@/lib/email/types";

// SMTP transport (nodemailer). Provider-agnostic: works against any SMTP relay
// (SES, Mailgun, Postmark, a local Mailhog catcher). Never exercised in CI —
// tests inject a fake transport — so the error classification below is the part
// that carries unit-test value.

// Permanent (do-not-retry) SMTP/auth failures vs everything else (transient).
const PERMANENT_CODES = new Set(["EAUTH", "EENVELOPE", "EMESSAGE"]);

/** Pure: decide whether a nodemailer/SMTP error is worth retrying. Exported for tests. */
export function isPermanentSmtpError(err: unknown): boolean {
  const e = err as { code?: string; responseCode?: number } | undefined;
  if (e?.code && PERMANENT_CODES.has(e.code)) return true;
  // 5xx is a permanent SMTP rejection; 4xx is a transient "try again".
  if (typeof e?.responseCode === "number") return e.responseCode >= 500;
  return false;
}

export class SmtpTransport implements EmailTransport {
  readonly name = "smtp";
  private readonly from?: string;
  private transporter: Transporter;

  constructor(config: SmtpConfig) {
    this.transporter = nodemailer.createTransport({
      host: config.host,
      port: config.port,
      secure: config.secure,
      auth: { user: config.user, pass: config.pass },
    });
  }

  async send(payload: OutboundPayload): Promise<SendResult> {
    try {
      const info = await this.transporter.sendMail({
        from: payload.from,
        to: payload.to,
        replyTo: payload.replyTo,
        subject: payload.subject,
        text: payload.text,
        html: payload.html,
        headers: payload.headers,
      });
      return { ok: true, providerMessageId: info.messageId };
    } catch (err) {
      return {
        ok: false,
        error: err instanceof Error ? err.message : String(err),
        permanent: isPermanentSmtpError(err),
      };
    }
  }
}

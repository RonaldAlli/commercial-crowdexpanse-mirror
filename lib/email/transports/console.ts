import crypto from "node:crypto";

import type { EmailTransport, OutboundPayload, SendResult } from "@/lib/email/types";

// The default transport in dev / test / CI: it logs a structured line and never
// sends anything over the network. Only non-sensitive envelope fields are logged
// (recipient, subject) — never the rendered body, which may carry links/tokens.
export class ConsoleTransport implements EmailTransport {
  readonly name = "console";

  async send(payload: OutboundPayload): Promise<SendResult> {
    const providerMessageId = `console-${crypto.randomUUID()}`;
    // eslint-disable-next-line no-console
    console.log(
      `[email:console] → ${payload.to} · "${payload.subject}" · id=${providerMessageId}`,
    );
    return { ok: true, providerMessageId };
  }
}

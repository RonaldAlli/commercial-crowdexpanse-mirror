import { getEnv } from "@/lib/env";
import type { EmailTransport } from "@/lib/email/types";

import { ConsoleTransport } from "./console";
import { SmtpTransport } from "./smtp";

// Selects the concrete transport from validated config. Adding a provider later
// (Resend, SES, Postmark) is a new case here + a new class — no change to the
// EmailTransport interface or to any caller.
export function transportFromEnv(): EmailTransport {
  const { email } = getEnv();
  if (email.provider === "smtp" && email.smtp) {
    return new SmtpTransport(email.smtp);
  }
  return new ConsoleTransport();
}

export { ConsoleTransport } from "./console";
export { SmtpTransport, isPermanentSmtpError } from "./smtp";

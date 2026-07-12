// ---------------------------------------------------------------------------
// Centralized, fail-fast configuration for the communications layer.
//
// Scope (Slice 3d-i): email transport + the absolute base URL that future email
// links need. Existing env reads (SESSION_SECRET, UPLOAD_DIR, DATABASE_URL) are
// intentionally left where they are — routing them through here is a separate
// housekeeping follow-up, not part of this slice.
//
// Validation runs once, lazily, the first time the config is read. The default
// provider is "console" so dev / test / CI need no new variables and never send
// a real email. Selecting "smtp" requires the SMTP_* set to be present, or the
// process fails loudly rather than silently dropping mail.
// ---------------------------------------------------------------------------

export type EmailProvider = "console" | "smtp";

export interface SmtpConfig {
  host: string;
  port: number;
  user: string;
  pass: string;
  secure: boolean;
}

export interface EmailEnv {
  provider: EmailProvider;
  from: string;
  replyTo?: string;
  smtp?: SmtpConfig;
}

export interface AppEnv {
  /** Absolute base URL for links in emails (validated now, consumed in 3d-ii). */
  appUrl: string;
  email: EmailEnv;
}

const DEFAULT_FROM = "CrowdExpanse <no-reply@localhost>";
const DEFAULT_APP_URL = "http://localhost:3030";

function required(name: string, value: string | undefined): string {
  if (!value || value.trim() === "") {
    throw new Error(`[env] ${name} is required when EMAIL_PROVIDER=smtp.`);
  }
  return value;
}

function readEmailEnv(): EmailEnv {
  const raw = (process.env.EMAIL_PROVIDER ?? "console").trim().toLowerCase();
  if (raw !== "console" && raw !== "smtp") {
    throw new Error(`[env] EMAIL_PROVIDER must be "console" or "smtp" (got "${raw}").`);
  }
  const provider = raw as EmailProvider;
  const from = process.env.EMAIL_FROM?.trim() || DEFAULT_FROM;
  const replyTo = process.env.EMAIL_REPLY_TO?.trim() || undefined;

  if (provider === "console") {
    return { provider, from, replyTo };
  }

  // provider === "smtp" — every credential must be present.
  const portRaw = required("SMTP_PORT", process.env.SMTP_PORT);
  const port = Number.parseInt(portRaw, 10);
  if (!Number.isInteger(port) || port <= 0) {
    throw new Error(`[env] SMTP_PORT must be a positive integer (got "${portRaw}").`);
  }
  return {
    provider,
    from,
    replyTo,
    smtp: {
      host: required("SMTP_HOST", process.env.SMTP_HOST),
      port,
      user: required("SMTP_USER", process.env.SMTP_USER),
      pass: required("SMTP_PASS", process.env.SMTP_PASS),
      // SMTP_SECURE defaults to true only for the implicit-TLS port 465.
      secure: (process.env.SMTP_SECURE?.trim().toLowerCase() ?? "") === "true" || port === 465,
    },
  };
}

function readEnv(): AppEnv {
  return {
    appUrl: (process.env.APP_URL?.trim() || DEFAULT_APP_URL).replace(/\/+$/, ""),
    email: readEmailEnv(),
  };
}

let cached: AppEnv | undefined;

/** The validated app config. Computed once; throws on first read if invalid. */
export function getEnv(): AppEnv {
  if (!cached) cached = readEnv();
  return cached;
}

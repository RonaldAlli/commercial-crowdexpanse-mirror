// Encryption for the admin-managed AI provider key. Reuses the project's approved
// AES-256-GCM secret box (lib/comms/secret-box) so there is ONE crypto primitive,
// with a DEDICATED master key so AI and comms secrets are isolated.
//
// Master key: AI_CONFIG_ENCRYPTION_KEY (64-char hex = 32 bytes), supplied ONLY through
// the host environment — never the UI, never the database. Fail-closed: without it,
// no AI key can be stored or read. Decrypted keys are server-only and NEVER returned
// to a client; the UI only ever sees maskSecret()/last4.

import { encryptSecret, decryptSecret, maskSecret } from "@/lib/comms/secret-box";

export { encryptSecret, decryptSecret, maskSecret };

/** The configured AI-config encryption key (fail-closed). Required before any AI key is stored/read. */
export function aiConfigKeyHex(): string {
  const hex = process.env.AI_CONFIG_ENCRYPTION_KEY;
  if (!hex || hex.length !== 64) {
    throw new Error("AI_CONFIG_ENCRYPTION_KEY is not configured (needs a 64-char hex string; generate with: openssl rand -hex 32).");
  }
  return hex;
}

/** True when the master encryption key is present and well-formed — safe to expose to admins (boolean only). */
export function aiEncryptionReady(): boolean {
  try {
    aiConfigKeyHex();
    return true;
  } catch {
    return false;
  }
}

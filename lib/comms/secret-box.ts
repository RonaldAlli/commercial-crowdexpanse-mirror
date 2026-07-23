import crypto from "node:crypto";

// Reversible at-rest encryption for provider secrets (Telnyx API key, webhook key, WebRTC credential).
// AES-256-GCM; payload = base64(iv[12] || authTag[16] || ciphertext). Key = 32 bytes (64 hex chars).
// Server-only: decrypted secrets are NEVER returned to the browser — the UI only ever sees maskSecret().
const ALGO = "aes-256-gcm";
const IV_LEN = 12;
const TAG_LEN = 16;

function keyBuffer(keyHex: string): Buffer {
  if (!keyHex || keyHex.length !== 64) {
    throw new Error("comms encryption key must be a 64-char hex string (32 bytes). Generate with: openssl rand -hex 32");
  }
  return Buffer.from(keyHex, "hex");
}

export function encryptSecret(plaintext: string, keyHex: string): string {
  const iv = crypto.randomBytes(IV_LEN);
  const cipher = crypto.createCipheriv(ALGO, keyBuffer(keyHex), iv);
  const enc = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, enc]).toString("base64");
}

export function decryptSecret(payload: string, keyHex: string): string {
  const buf = Buffer.from(payload, "base64");
  const iv = buf.subarray(0, IV_LEN);
  const tag = buf.subarray(IV_LEN, IV_LEN + TAG_LEN);
  const ct = buf.subarray(IV_LEN + TAG_LEN);
  const decipher = crypto.createDecipheriv(ALGO, keyBuffer(keyHex), iv);
  decipher.setAuthTag(tag); // throws on tamper/wrong key
  return Buffer.concat([decipher.update(ct), decipher.final()]).toString("utf8");
}

/** A masked hint safe to show in the UI — never the secret itself. */
export function maskSecret(plaintext: string): string {
  const last4 = plaintext.slice(-4);
  return plaintext.length <= 4 ? "••••" : `••••${last4}`;
}

/** The configured comms encryption key (fail-closed). Required before any secret is stored/read. */
export function commsKeyHex(): string {
  const hex = process.env.COMMS_ENCRYPTION_KEY;
  if (!hex || hex.length !== 64) {
    throw new Error("COMMS_ENCRYPTION_KEY is not configured (needs a 64-char hex string).");
  }
  return hex;
}

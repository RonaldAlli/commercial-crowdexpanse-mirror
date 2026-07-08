import crypto from "node:crypto";

// Password hashing with scrypt from the Node standard library — no external
// dependency. Stored format: "scrypt:<saltHex>:<hashHex>".
const KEY_LENGTH = 64;

export function hashPassword(plain: string): string {
  const salt = crypto.randomBytes(16).toString("hex");
  const derived = crypto.scryptSync(plain, salt, KEY_LENGTH).toString("hex");
  return `scrypt:${salt}:${derived}`;
}

export function verifyPassword(plain: string, stored: string): boolean {
  const parts = stored.split(":");
  if (parts.length !== 3 || parts[0] !== "scrypt") {
    return false;
  }

  const [, salt, hash] = parts;
  const expected = Buffer.from(hash, "hex");
  const derived = crypto.scryptSync(plain, salt, KEY_LENGTH);

  if (expected.length !== derived.length) {
    return false;
  }

  return crypto.timingSafeEqual(expected, derived);
}

import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

// Files live on disk in an isolated folder; only metadata goes in Postgres.
const UPLOAD_DIR = path.resolve(process.env.UPLOAD_DIR ?? path.join(process.cwd(), "uploads"));

export const MAX_UPLOAD_BYTES = 25 * 1024 * 1024;

/** Generate an org-scoped storage key that keeps the original extension. */
export function buildStorageKey(organizationId: string, originalName: string) {
  const ext = path.extname(originalName).toLowerCase().replace(/[^.a-z0-9]/g, "").slice(0, 12);
  return `${organizationId}/${crypto.randomBytes(16).toString("hex")}${ext}`;
}

/** Resolve a storage key to an absolute path, guarding against traversal. */
export function absolutePathFor(storageKey: string): string | null {
  const abs = path.resolve(UPLOAD_DIR, storageKey);
  if (abs !== UPLOAD_DIR && !abs.startsWith(UPLOAD_DIR + path.sep)) {
    return null;
  }
  return abs;
}

export async function persistFile(storageKey: string, data: Buffer) {
  const abs = absolutePathFor(storageKey);
  if (!abs) throw new Error("Invalid storage key.");
  await fs.promises.mkdir(path.dirname(abs), { recursive: true });
  await fs.promises.writeFile(abs, data);
}

export async function removeFile(storageKey: string) {
  const abs = absolutePathFor(storageKey);
  if (!abs) return;
  try {
    await fs.promises.unlink(abs);
  } catch (err) {
    // Missing file on delete is fine; the DB row is the source of truth.
    if ((err as NodeJS.ErrnoException).code !== "ENOENT") throw err;
  }
}

export function formatBytes(bytes: number | null | undefined) {
  if (bytes == null) return "—";
  if (bytes < 1024) return `${bytes} B`;
  const units = ["KB", "MB", "GB"];
  let value = bytes / 1024;
  let i = 0;
  while (value >= 1024 && i < units.length - 1) {
    value /= 1024;
    i += 1;
  }
  return `${value.toFixed(value >= 10 || i === 0 ? 0 : 1)} ${units[i]}`;
}

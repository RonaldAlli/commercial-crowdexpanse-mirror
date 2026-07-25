// Immutable audit trail for admin AI actions (config, governance, release). Append-only:
// records are only ever created, never updated or deleted. `detail` MUST be sanitized —
// never pass a secret value (API key, ciphertext). Callers pass masked hints only.

import { prisma } from "@/lib/prisma";

export type AiAuditInput = {
  organizationId: string;
  actorUserId: string | null;
  action: string; // e.g. "ai.key.set", "ai.governance.approved", "ai.release.approved"
  target?: string | null;
  detail?: string | null; // sanitized; never a secret value
};

// Simple guard so a secret can never accidentally land in the audit detail.
export function assertNoSecret(detail: string | null | undefined) {
  if (!detail) return;
  // AES-GCM ciphertext is base64 and long; a raw key is long. Reject anything that
  // looks like a stored secret rather than a short human-readable note.
  if (detail.length > 160 || /sk-ant-[A-Za-z0-9]/.test(detail)) {
    throw new Error("Refusing to write a possible secret into the audit trail.");
  }
}

export async function recordAiAudit(input: AiAuditInput): Promise<void> {
  assertNoSecret(input.detail);
  await prisma.aiAdminAuditEvent.create({
    data: {
      organizationId: input.organizationId,
      actorUserId: input.actorUserId,
      action: input.action,
      target: input.target ?? null,
      detail: input.detail ?? null,
    },
  });
}

"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import Anthropic from "@anthropic-ai/sdk";

import { requireUser } from "@/lib/auth";
import { checkAuthorized, GENERIC_DENIAL } from "@/lib/authorize";
import { prisma } from "@/lib/prisma";
import { verifyPassword } from "@/lib/password";
import { encryptSecret, decryptSecret, aiConfigKeyHex, aiEncryptionReady } from "@/lib/ai/config-secret";
import { parseAiSettingsForm } from "@/lib/ai/settings-form";
import { recordAiAudit } from "@/lib/ai/audit";

export type AiActionState = { ok?: boolean; error?: string; message?: string } | undefined;

// Server actions are CSRF-protected by Next.js (same-origin, action-id bound). Every
// action below re-checks ADMIN authorization (MANAGE ORGANIZATION), is org-scoped
// (Authority Rule 1), never returns a secret, and writes an immutable audit event.

async function adminOr(actor: Awaited<ReturnType<typeof requireUser>>): Promise<string | null> {
  return (await checkAuthorized(actor, "MANAGE", "ORGANIZATION")) ? null : GENERIC_DENIAL;
}

// Session reauthentication before changing/deleting a secret: the admin must re-enter
// their own password. Verified against their stored hash; never logged.
async function reauth(actorId: string, password: string | null): Promise<boolean> {
  if (!password) return false;
  const u = await prisma.user.findUnique({ where: { id: actorId }, select: { hashedPassword: true } });
  return Boolean(u && verifyPassword(password, u.hashedPassword));
}

// In-process rate limiter for the outbound Test action (per org). Best-effort; a
// single pm2 process. Prevents hammering the provider from the admin UI.
const testHits = new Map<string, number[]>();
function rateLimited(orgId: string, max = 5, windowMs = 60_000): boolean {
  const now = Date.now();
  const arr = (testHits.get(orgId) ?? []).filter((t) => now - t < windowMs);
  if (arr.length >= max) { testHits.set(orgId, arr); return true; }
  arr.push(now); testHits.set(orgId, arr); return false;
}

export async function saveAiSettings(formData: FormData): Promise<AiActionState> {
  const actor = await requireUser();
  const denied = await adminOr(actor);
  if (denied) return { error: denied };

  const parsed = parseAiSettingsForm(formData);
  if (!parsed.ok) return { error: parsed.error };
  const v = parsed.value;

  let apiKeyEnc: string | undefined;
  let apiKeyLast4: string | undefined;
  if (v.newApiKey) {
    // Reauth required before storing a secret.
    if (!(await reauth(actor.id, (formData.get("confirmPassword") as string) ?? null))) {
      return { error: "Re-enter your password to store a new API key." };
    }
    if (!aiEncryptionReady()) {
      return { error: "Set AI_CONFIG_ENCRYPTION_KEY on the server before storing an API key (openssl rand -hex 32)." };
    }
    apiKeyEnc = encryptSecret(v.newApiKey, aiConfigKeyHex());
    apiKeyLast4 = v.newApiKey.slice(-4);
  }

  const common = {
    model: v.model,
    approvedModels: v.approvedModels,
    timeoutMs: v.timeoutMs,
    enabled: v.enabled,
    envTarget: v.envTarget,
    ...(apiKeyEnc ? { apiKeyEnc, apiKeyLast4 } : {}),
  };
  await prisma.aiProviderConfig.upsert({
    where: { organizationId: actor.organizationId },
    create: { organizationId: actor.organizationId, provider: "anthropic", ...common },
    update: common,
  });
  await recordAiAudit({
    organizationId: actor.organizationId, actorUserId: actor.id, action: "ai.config.saved",
    detail: `model=${v.model ?? "-"} approved=${v.approvedModels.length} enabled=${v.enabled} target=${v.envTarget}${apiKeyEnc ? " key=updated(****" + apiKeyLast4 + ")" : ""}`,
  });
  revalidatePath("/settings/ai");
  return { ok: true, message: "AI settings saved." };
}

export async function revokeAiKey(formData: FormData): Promise<AiActionState> {
  const actor = await requireUser();
  const denied = await adminOr(actor);
  if (denied) return { error: denied };
  if (!(await reauth(actor.id, (formData.get("confirmPassword") as string) ?? null))) {
    return { error: "Re-enter your password to revoke the API key." };
  }
  await prisma.aiProviderConfig.updateMany({
    where: { organizationId: actor.organizationId },
    data: { apiKeyEnc: null, apiKeyLast4: null, enabled: false },
  });
  await recordAiAudit({ organizationId: actor.organizationId, actorUserId: actor.id, action: "ai.key.revoked", detail: "key cleared, AI disabled" });
  revalidatePath("/settings/ai");
  return { ok: true, message: "API key revoked and AI disabled." };
}

export async function testAiConfiguration(): Promise<AiActionState> {
  const actor = await requireUser();
  const denied = await adminOr(actor);
  if (denied) return { error: denied };
  if (rateLimited(actor.organizationId)) return { error: "Too many tests — wait a minute and try again." };

  const cfg = await prisma.aiProviderConfig.findUnique({
    where: { organizationId: actor.organizationId },
    select: { apiKeyEnc: true, model: true, approvedModels: true },
  });
  if (!aiEncryptionReady()) return { error: "AI_CONFIG_ENCRYPTION_KEY is not set on the server." };
  if (!cfg?.apiKeyEnc) return { error: "No API key stored — save one first." };
  if (!cfg.model) return { error: "No model configured." };
  if (!cfg.approvedModels.includes(cfg.model)) return { error: "Configured model is not on the approved list." };

  let apiKey: string;
  try { apiKey = decryptSecret(cfg.apiKeyEnc, aiConfigKeyHex()); }
  catch { return { error: "Stored key could not be decrypted (wrong/rotated encryption key)." }; }

  const t0 = Date.now();
  try {
    const client = new Anthropic({ apiKey, timeout: 20_000, maxRetries: 0 });
    // Fixed validation prompt — NO customer/seller data.
    await client.messages.create({ model: cfg.model, max_tokens: 8, messages: [{ role: "user", content: "Reply with: ok" }] });
    const ms = Date.now() - t0;
    await recordAiAudit({ organizationId: actor.organizationId, actorUserId: actor.id, action: "ai.config.test.passed", detail: `model=${cfg.model} latencyMs=${ms}` });
    return { ok: true, message: `Provider reachable — model ${cfg.model} responded in ${ms} ms.` };
  } catch (e) {
    // Sanitize: surface status/class only, never the key or auth headers.
    const status = (e as { status?: number })?.status;
    const name = (e as { name?: string })?.name ?? "Error";
    await recordAiAudit({ organizationId: actor.organizationId, actorUserId: actor.id, action: "ai.config.test.failed", detail: `model=${cfg.model} status=${status ?? "?"} ${name}` });
    return { error: `Test failed (${status ?? name}). Check the key and model.` };
  }
}

// Void-returning wrappers for plain <form action> (progressive enhancement). They
// redirect back with a status message so the admin gets feedback without a client hook.
const back = (base: string, r: AiActionState) => redirect(`${base}?msg=${encodeURIComponent(r?.error ?? r?.message ?? "")}`);
export async function saveAiSettingsForm(fd: FormData): Promise<void> { back("/settings/ai", await saveAiSettings(fd)); }
export async function revokeAiKeyForm(fd: FormData): Promise<void> { back("/settings/ai", await revokeAiKey(fd)); }
export async function testAiConfigurationForm(): Promise<void> { back("/settings/ai", await testAiConfiguration()); }

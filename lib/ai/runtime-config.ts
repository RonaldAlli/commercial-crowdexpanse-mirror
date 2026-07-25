// Effective AI configuration resolution for the live Copilot.
//
// PRECEDENCE (documented, unambiguous):
//   1. ENVIRONMENT — when ANTHROPIC_API_KEY + AI_COPILOT_MODEL + a non-empty
//      AI_COPILOT_APPROVED_MODELS containing the model are all set, env is
//      authoritative. Setting host env vars IS the operator's explicit host-level
//      authorization, so the env path does not require the in-app governance record
//      (this preserves the frozen baseline's behavior exactly).
//   2. STORE — otherwise the admin-managed encrypted config is used, but ONLY when it
//      is enabled, has a stored key, names a model that is on its own approved list,
//      the master encryption key is present, AND the org's governance status is
//      APPROVED. Any miss ⇒ not configured, with a specific reason (fail-closed).
//   3. Neither ⇒ inert.
//
// The status projection NEVER contains the API key. Only the server-side
// resolveCopilotRuntime() returns the decrypted key, and only to the request path.

import { prisma } from "@/lib/prisma";
import { getAnthropicApiKey, getApprovedModels, getCopilotModel, getRequestTimeoutMs, DEFAULT_REQUEST_TIMEOUT_MS } from "./config";
import { aiConfigKeyHex, aiEncryptionReady, decryptSecret } from "./config-secret";

export type EffectiveStatus = {
  source: "env" | "store" | "none";
  configured: boolean;
  reason: string | null;
  provider: string;
  model: string | null;
  approvedModelsCount: number;
  timeoutMs: number;
};

export type EffectiveRuntime = EffectiveStatus & { apiKey: string | null };

// Inputs to the pure resolver — no DB, no secrets-in-plaintext beyond presence flags.
export type EnvInputs = { apiKey: string | null; model: string | null; approvedModels: string[]; timeoutMs: number };
export type StoreInputs = {
  enabled: boolean;
  apiKeyPresent: boolean;
  model: string | null;
  approvedModels: string[];
  timeoutMs: number | null;
} | null;

/** Pure decision: which source (if any) yields a configured Copilot, and why not when it doesn't. */
export function resolveEffectiveStatus(
  env: EnvInputs,
  store: StoreInputs,
  governanceApproved: boolean,
  encryptionReady: boolean,
): EffectiveStatus {
  const provider = "anthropic";

  // 1. Environment is authoritative when fully configured.
  if (env.apiKey && env.model && env.approvedModels.length > 0 && env.approvedModels.includes(env.model)) {
    return { source: "env", configured: true, reason: null, provider, model: env.model, approvedModelsCount: env.approvedModels.length, timeoutMs: env.timeoutMs };
  }

  // 2. Store path (governance-gated, fail-closed on each requirement).
  if (store && (store.enabled || store.apiKeyPresent || store.model)) {
    const timeoutMs = store.timeoutMs && store.timeoutMs > 0 ? store.timeoutMs : DEFAULT_REQUEST_TIMEOUT_MS;
    const base = { source: "store" as const, configured: false, provider, model: store.model, approvedModelsCount: store.approvedModels.length, timeoutMs };
    if (!store.enabled) return { ...base, reason: "AI is disabled for this organization" };
    if (!encryptionReady) return { ...base, reason: "AI_CONFIG_ENCRYPTION_KEY is not set on the server" };
    if (!store.apiKeyPresent) return { ...base, reason: "No API key configured" };
    if (!store.model) return { ...base, reason: "No model configured" };
    if (store.approvedModels.length === 0) return { ...base, reason: "No approved models configured" };
    if (!store.approvedModels.includes(store.model)) return { ...base, reason: `Model "${store.model}" is not on the approved list` };
    if (!governanceApproved) return { ...base, reason: "Governance approval is not APPROVED" };
    return { ...base, configured: true, reason: null };
  }

  // 3. Nothing configured.
  return { source: "none", configured: false, reason: "AI Copilot not configured (no environment or stored configuration)", provider, model: null, approvedModelsCount: 0, timeoutMs: env.timeoutMs };
}

function envInputs(): EnvInputs {
  return { apiKey: getAnthropicApiKey(), model: getCopilotModel(), approvedModels: getApprovedModels(), timeoutMs: getRequestTimeoutMs() };
}

/** Org-aware status (NO key) — safe for gating and display. */
export async function resolveCopilotStatus(organizationId: string): Promise<EffectiveStatus> {
  const [cfg, gov] = await Promise.all([
    prisma.aiProviderConfig.findUnique({ where: { organizationId }, select: { enabled: true, apiKeyEnc: true, model: true, approvedModels: true, timeoutMs: true } }),
    prisma.aiGovernanceApproval.findFirst({ where: { organizationId }, orderBy: { createdAt: "desc" }, select: { status: true } }),
  ]);
  const store: StoreInputs = cfg ? { enabled: cfg.enabled, apiKeyPresent: Boolean(cfg.apiKeyEnc), model: cfg.model, approvedModels: cfg.approvedModels, timeoutMs: cfg.timeoutMs } : null;
  return resolveEffectiveStatus(envInputs(), store, gov?.status === "APPROVED", aiEncryptionReady());
}

/** Server-only full resolution INCLUDING the decrypted key — for the request path. Never expose the result to a client. */
export async function resolveCopilotRuntime(organizationId: string): Promise<EffectiveRuntime> {
  const [cfg, gov] = await Promise.all([
    prisma.aiProviderConfig.findUnique({ where: { organizationId }, select: { enabled: true, apiKeyEnc: true, model: true, approvedModels: true, timeoutMs: true } }),
    prisma.aiGovernanceApproval.findFirst({ where: { organizationId }, orderBy: { createdAt: "desc" }, select: { status: true } }),
  ]);
  const store: StoreInputs = cfg ? { enabled: cfg.enabled, apiKeyPresent: Boolean(cfg.apiKeyEnc), model: cfg.model, approvedModels: cfg.approvedModels, timeoutMs: cfg.timeoutMs } : null;
  const status = resolveEffectiveStatus(envInputs(), store, gov?.status === "APPROVED", aiEncryptionReady());

  if (!status.configured) return { ...status, apiKey: null };
  if (status.source === "env") return { ...status, apiKey: getAnthropicApiKey() };
  // store: decrypt the key server-side.
  try {
    const apiKey = decryptSecret(cfg!.apiKeyEnc as string, aiConfigKeyHex());
    return { ...status, apiKey };
  } catch {
    return { ...status, configured: false, reason: "Stored API key could not be decrypted (wrong or rotated encryption key)", apiKey: null };
  }
}

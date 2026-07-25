// Single source of truth for AI subsystem configuration.
//
// All environment reads for the AI layer live here so that future concerns —
// additional providers (OpenAI, local models), feature flags, rate limits,
// tenant-specific AI settings, provider selection — have ONE place to grow, instead
// of scattering `process.env` lookups across the AI modules. Providers and the
// service read config through these typed accessors, never `process.env` directly.

export type CopilotConfig = {
  apiKey: string | null;
  model: string | null;
  approvedModels: string[];
};

export function getAnthropicApiKey(): string | null {
  const v = process.env.ANTHROPIC_API_KEY?.trim();
  return v ? v : null;
}

export function getCopilotModel(): string | null {
  const v = process.env.AI_COPILOT_MODEL?.trim();
  return v ? v : null;
}

// Parses AI_COPILOT_APPROVED_MODELS: split on comma, trim entries, drop empties.
// The approved set is configuration (not code) and has no built-in default.
export function getApprovedModels(): string[] {
  const raw = process.env.AI_COPILOT_APPROVED_MODELS ?? "";
  return raw
    .split(",")
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

// Upstream request timeout (ms) for the LLM provider. Operational hardening, NOT
// model behavior: a hung or slow API must not hold a server request open forever.
// Safe default (60s) so it is always in effect; overridable per environment via
// AI_COPILOT_REQUEST_TIMEOUT_MS (a positive integer). Invalid/absent → the default.
export const DEFAULT_REQUEST_TIMEOUT_MS = 60_000;

export function getRequestTimeoutMs(): number {
  const raw = process.env.AI_COPILOT_REQUEST_TIMEOUT_MS?.trim();
  if (!raw) return DEFAULT_REQUEST_TIMEOUT_MS;
  const n = Number(raw);
  return Number.isInteger(n) && n > 0 ? n : DEFAULT_REQUEST_TIMEOUT_MS;
}

export function resolveCopilotConfig(): CopilotConfig {
  return {
    apiKey: getAnthropicApiKey(),
    model: getCopilotModel(),
    approvedModels: getApprovedModels(),
  };
}

// Pure configuration status — SDK-free, so it can be read from lightweight surfaces
// (e.g. the liveness health probe) without importing the provider SDK. Configured
// only when the key, a model, a non-empty approved list, and a listed model are all
// present. Never returns the key or any secret. The provider delegates to this.
export function resolveAiConfigStatus(): { configured: boolean; reason: string | null } {
  const apiKey = getAnthropicApiKey();
  if (!apiKey) {
    return { configured: false, reason: "AI Copilot not configured (missing API key)" };
  }
  const model = getCopilotModel();
  if (!model) {
    return { configured: false, reason: "AI Copilot not configured (no model configured)" };
  }
  const approved = getApprovedModels();
  if (approved.length === 0) {
    return { configured: false, reason: "AI Copilot not configured (no approved models configured)" };
  }
  if (!approved.includes(model)) {
    return {
      configured: false,
      reason: `AI Copilot not configured (model "${model}" is not on the configured approved list)`,
    };
  }
  return { configured: true, reason: null };
}

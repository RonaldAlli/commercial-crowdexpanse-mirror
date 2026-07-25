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

export function resolveCopilotConfig(): CopilotConfig {
  return {
    apiKey: getAnthropicApiKey(),
    model: getCopilotModel(),
    approvedModels: getApprovedModels(),
  };
}

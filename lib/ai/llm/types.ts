// Vendor-neutral LLM provider seam (AI Copilot, Slice 1). Nothing above this module
// names a model or a vendor — the Copilot Service and Workspace Brain talk only to
// this interface, so the model *and* the provider can change from configuration
// without touching the engine. Anthropic is the first (and, today, only) impl.

export type LlmStatus = { configured: boolean; reason: string | null };

export type LlmRole = "user" | "assistant";

export type LlmMessage = { role: LlmRole; content: string };

export type LlmStreamParams = {
  system: string;
  messages: LlmMessage[];
  maxTokens: number;
  // Optional: abort the upstream request (e.g. when the client disconnects) so the
  // provider stops generating and we stop paying for tokens no one will read.
  signal?: AbortSignal;
  // Optional resolved credentials/config injected by the caller (the admin-managed
  // encrypted store). When apiKey + model are provided the provider uses them and
  // skips its own env-based status check; otherwise it falls back to env config.
  apiKey?: string;
  model?: string;
  timeoutMs?: number;
};

export interface LlmProvider {
  readonly name: string;
  // Reports whether the provider is fully configured. Callers MUST check this and
  // stay inert when it is false — never call `stream()` without configuration.
  resolveStatus(): LlmStatus;
  // Yields text deltas as they arrive. Only valid when `resolveStatus().configured`.
  stream(params: LlmStreamParams): AsyncIterable<string>;
}

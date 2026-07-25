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
};

export interface LlmProvider {
  readonly name: string;
  // Reports whether the provider is fully configured. Callers MUST check this and
  // stay inert when it is false — never call `stream()` without configuration.
  resolveStatus(): LlmStatus;
  // Yields text deltas as they arrive. Only valid when `resolveStatus().configured`.
  stream(params: LlmStreamParams): AsyncIterable<string>;
}

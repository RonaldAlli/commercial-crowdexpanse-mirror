// LLM provider selection + the copilot's inert seam.
//
// Today there is exactly one provider (Anthropic). A future provider (OpenAI, a
// local model, …) would be selected here behind the same LlmProvider interface —
// no change anywhere above lib/ai/llm. `resolveAiStatus()` is the single status
// helper the rest of the app (service, route, UI) reads.

import type { LlmProvider, LlmStatus } from "./types";
import { AnthropicProvider } from "./anthropic";

// Stands in when nothing is configured — mirrors `inertVoiceAdapter`
// (lib/comms/voice-provider.ts). Never makes a network call.
export const inertLlmProvider: LlmProvider = {
  name: "inert",
  resolveStatus(): LlmStatus {
    return { configured: false, reason: "AI Copilot not configured" };
  },
  // eslint-disable-next-line require-yield
  async *stream(): AsyncIterable<string> {
    throw new Error("AI Copilot is not configured");
  },
};

const provider: LlmProvider = new AnthropicProvider();

export function getLlmProvider(): LlmProvider {
  return provider;
}

export function resolveAiStatus(): LlmStatus {
  return getLlmProvider().resolveStatus();
}

export type { LlmProvider, LlmStatus, LlmMessage, LlmRole, LlmStreamParams } from "./types";

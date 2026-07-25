// Anthropic implementation of the vendor-neutral LlmProvider seam.
//
// Model AND the approved-model set are both configuration, never code (see
// lib/ai/config.ts — the single source of truth for AI env). Adding a new approved
// model is an env change, no deploy. There is deliberately NO built-in fallback
// allowlist — a fallback would silently return governance to code.
//
// Inert-until-configured mirrors lib/comms/voice-provider.ts: unless the key, a
// model, a non-empty approved list, and a model that appears in that list are all
// present, the provider reports not-configured and never calls the API (fail closed).

import Anthropic from "@anthropic-ai/sdk";

import { getAnthropicApiKey, getApprovedModels, getCopilotModel } from "../config";
import type { LlmProvider, LlmStatus, LlmStreamParams } from "./types";

export class AnthropicProvider implements LlmProvider {
  readonly name = "anthropic";

  resolveStatus(): LlmStatus {
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

  async *stream(params: LlmStreamParams): AsyncIterable<string> {
    const status = this.resolveStatus();
    if (!status.configured) {
      // Fail closed: no request is ever made without full configuration.
      throw new Error(status.reason ?? "AI Copilot is not configured");
    }
    const apiKey = getAnthropicApiKey() as string;
    const model = getCopilotModel() as string;

    const client = new Anthropic({ apiKey });
    const stream = client.messages.stream({
      model,
      max_tokens: params.maxTokens,
      system: params.system,
      messages: params.messages.map((m) => ({ role: m.role, content: m.content })),
    });

    for await (const event of stream) {
      if (event.type === "content_block_delta" && event.delta.type === "text_delta") {
        yield event.delta.text;
      }
    }
  }
}

// Anthropic implementation of the vendor-neutral LlmProvider seam.
//
// Model AND the approved-model set are both configuration, never code:
//   - AI_COPILOT_MODEL           — the model the copilot uses
//   - AI_COPILOT_APPROVED_MODELS — comma-separated allowlist of permitted model IDs
// Adding a new approved model is an env change, no deploy. There is deliberately NO
// built-in fallback allowlist — a fallback would silently return governance to code.
//
// Inert-until-configured mirrors lib/comms/voice-provider.ts: unless the key, a
// model, a non-empty approved list, and a model that appears in that list are all
// present, the provider reports not-configured and never calls the API (fail closed).

import Anthropic from "@anthropic-ai/sdk";

import type { LlmProvider, LlmStatus, LlmStreamParams } from "./types";

function readApiKey(): string | null {
  const v = process.env.ANTHROPIC_API_KEY?.trim();
  return v ? v : null;
}

function readModel(): string | null {
  const v = process.env.AI_COPILOT_MODEL?.trim();
  return v ? v : null;
}

// Parses AI_COPILOT_APPROVED_MODELS: split on comma, trim entries, drop empties.
// Exported for tests and any future governance surface.
export function readApprovedModels(): string[] {
  const raw = process.env.AI_COPILOT_APPROVED_MODELS ?? "";
  return raw
    .split(",")
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

export class AnthropicProvider implements LlmProvider {
  readonly name = "anthropic";

  resolveStatus(): LlmStatus {
    const apiKey = readApiKey();
    if (!apiKey) {
      return { configured: false, reason: "AI Copilot not configured (missing API key)" };
    }
    const model = readModel();
    if (!model) {
      return { configured: false, reason: "AI Copilot not configured (no model configured)" };
    }
    const approved = readApprovedModels();
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
    const apiKey = readApiKey() as string;
    const model = readModel() as string;

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

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

import { getAnthropicApiKey, getCopilotModel, getRequestTimeoutMs, resolveAiConfigStatus } from "../config";
import type { LlmProvider, LlmStatus, LlmStreamParams } from "./types";

export class AnthropicProvider implements LlmProvider {
  readonly name = "anthropic";

  resolveStatus(): LlmStatus {
    // Single source of truth lives in the (SDK-free) config layer.
    return resolveAiConfigStatus();
  }

  async *stream(params: LlmStreamParams): AsyncIterable<string> {
    // Prefer caller-injected credentials (the admin-managed encrypted store, already
    // governance-gated by the caller). Fall back to env config + the env status check
    // only when nothing was injected — preserving the baseline's inert-until-env path.
    let apiKey: string;
    let model: string;
    if (params.apiKey && params.model) {
      apiKey = params.apiKey;
      model = params.model;
    } else {
      const status = this.resolveStatus();
      if (!status.configured) {
        // Fail closed: no request is ever made without full configuration.
        throw new Error(status.reason ?? "AI Copilot is not configured");
      }
      apiKey = getAnthropicApiKey() as string;
      model = getCopilotModel() as string;
    }

    // Operational hardening: a bounded request timeout so a hung/slow upstream can't
    // hold the request open, and a single retry (SDK default is 2 — capped here to
    // keep worst-case latency predictable). Neither is model behavior.
    const client = new Anthropic({ apiKey, timeout: params.timeoutMs ?? getRequestTimeoutMs(), maxRetries: 1 });
    const stream = client.messages.stream(
      {
        model,
        max_tokens: params.maxTokens,
        system: params.system,
        messages: params.messages.map((m) => ({ role: m.role, content: m.content })),
      },
      { signal: params.signal }, // aborts the upstream request on client disconnect
    );

    for await (const event of stream) {
      if (event.type === "content_block_delta" && event.delta.type === "text_delta") {
        yield event.delta.text;
      }
    }
  }
}

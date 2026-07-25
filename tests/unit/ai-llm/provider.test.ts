import { test } from "node:test";
import assert from "node:assert/strict";

import { AnthropicProvider } from "../../../lib/ai/llm/anthropic";
import { getApprovedModels, getRequestTimeoutMs, DEFAULT_REQUEST_TIMEOUT_MS } from "../../../lib/ai/config";
import { inertLlmProvider, resolveAiStatus } from "../../../lib/ai/llm/index";

// resolveStatus reads env lazily on each call, so tests set/restore process.env
// around each assertion. The provider must FAIL CLOSED — configured only when the
// API key, a model, a non-empty CONFIGURED approved list, and a selected model that
// appears in that list are ALL present. There is no built-in fallback allowlist.
const ENV_KEYS = ["ANTHROPIC_API_KEY", "AI_COPILOT_MODEL", "AI_COPILOT_APPROVED_MODELS"];
const APPROVED = "claude-opus-4-8,claude-sonnet-5,claude-haiku-4-5";

function snapshot() {
  const saved: Record<string, string | undefined> = {};
  for (const k of ENV_KEYS) saved[k] = process.env[k];
  return saved;
}
function apply(env: Record<string, string | undefined>) {
  for (const k of ENV_KEYS) {
    if (env[k] === undefined) delete process.env[k];
    else process.env[k] = env[k];
  }
}
function withEnv(env: Record<string, string | undefined>, fn: () => void) {
  const saved = snapshot();
  try {
    apply(env);
    fn();
  } finally {
    apply(saved);
  }
}
async function withEnvAsync(env: Record<string, string | undefined>, fn: () => Promise<void>) {
  const saved = snapshot();
  try {
    apply(env);
    await fn();
  } finally {
    apply(saved);
  }
}

const provider = new AnthropicProvider();

test("inert when API key is missing", () => {
  withEnv({ ANTHROPIC_API_KEY: undefined, AI_COPILOT_MODEL: "claude-opus-4-8", AI_COPILOT_APPROVED_MODELS: APPROVED }, () => {
    const s = provider.resolveStatus();
    assert.equal(s.configured, false);
    assert.match(s.reason ?? "", /API key/i);
  });
});

test("inert when API key is blank/whitespace", () => {
  withEnv({ ANTHROPIC_API_KEY: "   ", AI_COPILOT_MODEL: "claude-opus-4-8", AI_COPILOT_APPROVED_MODELS: APPROVED }, () => {
    assert.equal(provider.resolveStatus().configured, false);
  });
});

test("inert when model is missing (key present)", () => {
  withEnv({ ANTHROPIC_API_KEY: "sk-test", AI_COPILOT_MODEL: undefined, AI_COPILOT_APPROVED_MODELS: APPROVED }, () => {
    const s = provider.resolveStatus();
    assert.equal(s.configured, false);
    assert.match(s.reason ?? "", /no model configured/i);
  });
});

test("inert when the approved list is missing", () => {
  withEnv({ ANTHROPIC_API_KEY: "sk-test", AI_COPILOT_MODEL: "claude-opus-4-8", AI_COPILOT_APPROVED_MODELS: undefined }, () => {
    const s = provider.resolveStatus();
    assert.equal(s.configured, false);
    assert.match(s.reason ?? "", /no approved models configured/i);
  });
});

test("inert when the approved list is empty / only commas / only whitespace", () => {
  for (const list of ["", "   ", ",", " , , "]) {
    withEnv({ ANTHROPIC_API_KEY: "sk-test", AI_COPILOT_MODEL: "claude-opus-4-8", AI_COPILOT_APPROVED_MODELS: list }, () => {
      const s = provider.resolveStatus();
      assert.equal(s.configured, false, `list=${JSON.stringify(list)}`);
      assert.match(s.reason ?? "", /no approved models configured/i);
    });
  }
});

test("inert when the selected model is not in the configured approved list", () => {
  withEnv({ ANTHROPIC_API_KEY: "sk-test", AI_COPILOT_MODEL: "gpt-4o", AI_COPILOT_APPROVED_MODELS: APPROVED }, () => {
    const s = provider.resolveStatus();
    assert.equal(s.configured, false);
    assert.match(s.reason ?? "", /not on the configured approved list/i);
  });
});

test("configured only when key AND model AND a configured allowlist containing the model are all present", () => {
  withEnv({ ANTHROPIC_API_KEY: "sk-test", AI_COPILOT_MODEL: "claude-sonnet-5", AI_COPILOT_APPROVED_MODELS: APPROVED }, () => {
    const s = provider.resolveStatus();
    assert.equal(s.configured, true);
    assert.equal(s.reason, null);
  });
});

test("model is not hard-coded — the allowlist is config; any listed id (incl. a novel one) configures with no code change", () => {
  // A model that is NOT in any code default, supplied purely via env, still configures.
  withEnv({ ANTHROPIC_API_KEY: "sk-test", AI_COPILOT_MODEL: "claude-future-9", AI_COPILOT_APPROVED_MODELS: "claude-future-9" }, () => {
    assert.equal(provider.resolveStatus().configured, true);
  });
});

test("allowlist entries are trimmed and empties dropped; matching is exact", () => {
  withEnv({ AI_COPILOT_APPROVED_MODELS: " claude-opus-4-8 , , claude-sonnet-5 ,, " }, () => {
    assert.deepEqual(getApprovedModels(), ["claude-opus-4-8", "claude-sonnet-5"]);
  });
  // Exact match — a padded selected model would be trimmed by readModel(), but a
  // different id (substring/near-miss) must not pass.
  withEnv({ ANTHROPIC_API_KEY: "sk-test", AI_COPILOT_MODEL: "claude-opus-4", AI_COPILOT_APPROVED_MODELS: "claude-opus-4-8" }, () => {
    assert.equal(provider.resolveStatus().configured, false);
  });
});

test("resolveAiStatus() delegates to the configured provider", () => {
  withEnv({ ANTHROPIC_API_KEY: undefined, AI_COPILOT_MODEL: undefined, AI_COPILOT_APPROVED_MODELS: undefined }, () => {
    assert.equal(resolveAiStatus().configured, false);
  });
});

test("stream() fails closed when not configured (never calls the API)", async () => {
  await withEnvAsync({ ANTHROPIC_API_KEY: undefined, AI_COPILOT_MODEL: undefined, AI_COPILOT_APPROVED_MODELS: undefined }, async () => {
    await assert.rejects(async () => {
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      for await (const _ of provider.stream({ system: "s", messages: [], maxTokens: 10 })) {
        // unreachable — resolveStatus() is false so stream throws before yielding
      }
    }, /not configured/i);
  });
});

test("request timeout: safe default when unset, valid override honored, invalid ignored", () => {
  const KEY = "AI_COPILOT_REQUEST_TIMEOUT_MS";
  const saved = process.env[KEY];
  const set = (v: string | undefined) => { if (v === undefined) delete process.env[KEY]; else process.env[KEY] = v; };
  try {
    set(undefined);
    assert.equal(getRequestTimeoutMs(), DEFAULT_REQUEST_TIMEOUT_MS, "unset → default");
    set("30000");
    assert.equal(getRequestTimeoutMs(), 30000, "valid positive integer honored");
    for (const bad of ["0", "-5", "abc", "10.5", "   "]) {
      set(bad);
      assert.equal(getRequestTimeoutMs(), DEFAULT_REQUEST_TIMEOUT_MS, `invalid ${JSON.stringify(bad)} → default`);
    }
  } finally {
    set(saved);
  }
});

test("inert provider is never configured and refuses to stream", async () => {
  assert.equal(inertLlmProvider.resolveStatus().configured, false);
  await assert.rejects(async () => {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    for await (const _ of inertLlmProvider.stream({ system: "s", messages: [], maxTokens: 10 })) {
      // unreachable
    }
  }, /not configured/i);
});

// AI Copilot — configuration diagnostic (read-only, on-demand).
//
// Prints whether the Copilot is configured and, if not, WHY — reading the process
// environment through the same config layer the app uses. It NEVER prints the API key
// value (only whether it is present). Use it on the app host after setting the secrets
// to confirm the Copilot will activate, without exposing credentials.
//
// Usage (load the host's env however you normally do; do not paste the key on the CLI):
//   node --env-file-if-exists=.env --import tsx scripts/diag/ai-copilot-config.mjs
//   # or run under the pm2 process env so it sees the same variables as the app.

import {
  resolveAiConfigStatus,
  getCopilotModel,
  getApprovedModels,
  getAnthropicApiKey,
} from "../../lib/ai/config.ts";

const status = resolveAiConfigStatus();
const keyPresent = Boolean(getAnthropicApiKey());
const model = getCopilotModel();
const approved = getApprovedModels();

console.log("AI Copilot configuration:");
console.log(`  ANTHROPIC_API_KEY          : ${keyPresent ? "present" : "MISSING"}   (value never printed)`);
console.log(`  AI_COPILOT_MODEL           : ${model ?? "MISSING"}`);
console.log(`  AI_COPILOT_APPROVED_MODELS : ${approved.length ? approved.join(", ") : "MISSING / empty"}`);
console.log(`  model in approved list     : ${model && approved.includes(model) ? "yes" : "no"}`);
console.log("");
console.log(`  => configured: ${status.configured}${status.reason ? `  (${status.reason})` : ""}`);

// Informational only — exit 0 always. Inert (not configured) is a valid, deliberate
// operational state, so it is not treated as a failure here.
process.exit(0);

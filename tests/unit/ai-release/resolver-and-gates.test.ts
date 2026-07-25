import { test } from "node:test";
import assert from "node:assert/strict";

import { resolveEffectiveStatus, type EnvInputs, type StoreInputs } from "../../../lib/ai/runtime-config";
import { parseApprovedModels, parseAiSettingsForm } from "../../../lib/ai/settings-form";
import { computeReleaseGates, productionDeployAllowed, type ReleaseFacts } from "../../../lib/ai/release-gates";

const NO_ENV: EnvInputs = { apiKey: null, model: null, approvedModels: [], timeoutMs: 60000 };
const FULL_ENV: EnvInputs = { apiKey: "sk-env", model: "claude-sonnet-5", approvedModels: ["claude-sonnet-5"], timeoutMs: 30000 };
const goodStore: StoreInputs = { enabled: true, apiKeyPresent: true, model: "claude-opus-4-8", approvedModels: ["claude-opus-4-8"], timeoutMs: 45000 };

test("precedence: fully-configured ENV wins and needs no governance", () => {
  const r = resolveEffectiveStatus(FULL_ENV, goodStore, false, true);
  assert.equal(r.source, "env");
  assert.equal(r.configured, true);
  assert.equal(r.model, "claude-sonnet-5");
});

test("store path is governance-gated: APPROVED required", () => {
  assert.equal(resolveEffectiveStatus(NO_ENV, goodStore, false, true).configured, false, "not approved → blocked");
  assert.match(resolveEffectiveStatus(NO_ENV, goodStore, false, true).reason ?? "", /governance/i);
  assert.equal(resolveEffectiveStatus(NO_ENV, goodStore, true, true).configured, true, "approved → configured");
});

test("store fails closed on each missing requirement with a specific reason", () => {
  const mk = (o: Partial<NonNullable<StoreInputs>>) => resolveEffectiveStatus(NO_ENV, { ...goodStore!, ...o }, true, true);
  assert.match(mk({ enabled: false }).reason ?? "", /disabled/i);
  assert.match(mk({ apiKeyPresent: false }).reason ?? "", /no api key/i);
  assert.match(mk({ model: null }).reason ?? "", /no model/i);
  assert.match(mk({ approvedModels: [] }).reason ?? "", /approved/i);
  assert.match(mk({ model: "not-listed" }).reason ?? "", /not on the approved/i);
  assert.match(resolveEffectiveStatus(NO_ENV, goodStore, true, false).reason ?? "", /encryption/i);
});

test("nothing configured → inert", () => {
  const r = resolveEffectiveStatus(NO_ENV, null, false, true);
  assert.equal(r.configured, false);
  assert.equal(r.source, "none");
});

test("parseApprovedModels trims, drops empties, dedupes, preserves order", () => {
  assert.deepEqual(parseApprovedModels(" a , b ,, a , c "), ["a", "b", "c"]);
  assert.deepEqual(parseApprovedModels(null), []);
});

function fd(obj: Record<string, string>) {
  const f = new FormData();
  for (const [k, v] of Object.entries(obj)) f.set(k, v);
  return f;
}

test("settings form validation: short key, model-not-in-allowlist, bad timeout, bad target", () => {
  assert.equal((parseAiSettingsForm(fd({ apiKey: "short" })) as { ok: boolean }).ok, false);
  assert.equal((parseAiSettingsForm(fd({ model: "x", approvedModels: "y,z" })) as { ok: boolean }).ok, false);
  assert.equal((parseAiSettingsForm(fd({ timeoutMs: "-5" })) as { ok: boolean }).ok, false);
  assert.equal((parseAiSettingsForm(fd({ envTarget: "bogus" })) as { ok: boolean }).ok, false);
  const ok = parseAiSettingsForm(fd({ model: "m", approvedModels: "m, n", enabled: "on", envTarget: "PRODUCTION" }));
  assert.equal(ok.ok, true);
  if (ok.ok) { assert.equal(ok.value.enabled, true); assert.equal(ok.value.envTarget, "PRODUCTION"); assert.deepEqual(ok.value.approvedModels, ["m", "n"]); }
});

test("release gates derive from facts; production blocked until mandatory gates PASS", () => {
  const base: ReleaseFacts = {
    baselineVerified: true, tagProtection: "credential_unavailable", governanceStatus: null,
    store: null, providerTestPassed: null, validationHealthy: false, latestValidation: null,
    releaseStatus: null, productionDeployed: false, productionSmoke: null,
  };
  const g0 = computeReleaseGates(base);
  assert.equal(g0.find((g) => g.key === "tag_protection")?.status, "BLOCKED");
  assert.equal(productionDeployAllowed(g0).allowed, false);

  const ready: ReleaseFacts = {
    ...base, tagProtection: "protected", governanceStatus: "APPROVED",
    store: { enabled: true, hasKey: true, model: "m", approvedModels: ["m"] },
    providerTestPassed: true, validationHealthy: true,
    latestValidation: { automated: true, browser: true, liveProvider: true }, releaseStatus: "APPROVED",
  };
  const g1 = computeReleaseGates(ready);
  assert.equal(productionDeployAllowed(g1).allowed, true);
  assert.equal(g1.find((g) => g.key === "governance")?.status, "PASS");
});

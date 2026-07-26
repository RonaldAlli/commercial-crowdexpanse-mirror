// Pure derivation of the Phase-1 release gates from real records. No I/O — the page
// gathers facts and calls this, so the dashboard can never show a hard-coded checkmark.

export type GateStatus = "PASS" | "FAIL" | "BLOCKED" | "PENDING" | "NOT_APPLICABLE" | "RECOMMENDED";
// `advisory` gates are repository-governance best practices — visible, verified, but
// NOT part of the deployment decision (they never block production).
export type Gate = { key: string; label: string; status: GateStatus; detail: string; advisory?: boolean };

export type TagProtection = "protected" | "not_protected" | "unable_to_verify" | "credential_unavailable";

export type ReleaseFacts = {
  baselineVerified: boolean; // engineering baseline commit present/verified
  tagProtection: TagProtection;
  governanceStatus: string | null; // AiGovernanceStatus
  store: { enabled: boolean; hasKey: boolean; model: string | null; approvedModels: string[] } | null;
  providerTestPassed: boolean | null; // last Test Configuration result (null = never run)
  validationHealthy: boolean; // isolated validation env reachable/healthy
  latestValidation: { automated: boolean; browser: boolean; liveProvider: boolean } | null;
  releaseStatus: string | null; // AiReleaseStatus
  productionDeployed: boolean;
  productionSmoke: "PASS" | "FAIL" | null;
};

const bool = (b: boolean, passDetail: string, failStatus: GateStatus, failDetail: string): { status: GateStatus; detail: string } =>
  b ? { status: "PASS", detail: passDetail } : { status: failStatus, detail: failDetail };

export function computeReleaseGates(f: ReleaseFacts): Gate[] {
  const g: Gate[] = [];
  const add = (key: string, label: string, s: { status: GateStatus; detail: string }) => g.push({ key, label, ...s });

  add("baseline", "Engineering baseline verified", bool(f.baselineVerified, "Baseline commit verified", "FAIL", "Baseline not verified"));
  // Advisory: repository-governance safeguard, not a runtime/security/deployment dependency.
  // Always RECOMMENDED; still verified (configured vs not). Never blocks deployment.
  g.push({ key: "tag_protection", label: "Tag protection", status: "RECOMMENDED", advisory: true,
    detail: f.tagProtection === "protected" ? "✓ Configured. Repository governance only; does not affect application runtime."
      : f.tagProtection === "unable_to_verify" ? "Unable to verify via API. Repository governance only; does not affect runtime."
      : "Not configured. Repository administrator may enable later. Repository governance only; does not affect application runtime." });

  const govApproved = f.governanceStatus === "APPROVED";
  add("governance", "Governance approved",
    govApproved ? { status: "PASS", detail: "Governance APPROVED" }
      : f.governanceStatus ? { status: "PENDING", detail: `Governance is ${f.governanceStatus}` }
      : { status: "PENDING", detail: "No governance record" });

  const hasKey = Boolean(f.store?.hasKey);
  const model = f.store?.model ?? null;
  const allowlisted = Boolean(model && f.store?.approvedModels.includes(model));
  add("api_key", "API key configured", bool(hasKey, "Encrypted API key stored", "PENDING", "No API key stored"));
  add("model", "Model configured", bool(Boolean(model), `Model: ${model ?? "—"}`, "PENDING", "No model configured"));
  add("model_allowlisted", "Model allowlisted", bool(allowlisted, "Model is on the approved list", "PENDING", "Model not on the approved list"));
  add("provider_test", "Provider test passed",
    f.providerTestPassed === true ? { status: "PASS", detail: "Live test succeeded" }
      : f.providerTestPassed === false ? { status: "FAIL", detail: "Last test failed" }
      : { status: "PENDING", detail: "Test not run" });

  add("validation_env", "Validation environment healthy", bool(f.validationHealthy, "Validation env healthy", "PENDING", "Validation env not confirmed"));
  add("automated_tests", "Automated tests passed", bool(Boolean(f.latestValidation?.automated), "Automated suite passed", "PENDING", "Not recorded"));
  add("browser_validation", "Browser validation passed", bool(Boolean(f.latestValidation?.browser), "Browser pass recorded", "PENDING", "Not recorded"));
  add("live_provider", "Live-provider validation passed",
    f.latestValidation?.liveProvider ? { status: "PASS", detail: "Live-provider pass recorded" }
      : govApproved && hasKey ? { status: "PENDING", detail: "Ready to run" }
      : { status: "BLOCKED", detail: "Needs governance + configured provider" });

  add("release_approved", "Release approved",
    f.releaseStatus === "APPROVED" ? { status: "PASS", detail: "Release APPROVED" }
      : f.releaseStatus ? { status: "PENDING", detail: `Release is ${f.releaseStatus}` }
      : { status: "PENDING", detail: "No release approval" });
  add("prod_deployed", "Production deployed", bool(f.productionDeployed, "Deployed to production", "PENDING", "Not deployed"));
  add("prod_smoke", "Production smoke test passed",
    f.productionSmoke === "PASS" ? { status: "PASS", detail: "Smoke test passed" }
      : f.productionSmoke === "FAIL" ? { status: "FAIL", detail: "Smoke test failed" }
      : { status: f.productionDeployed ? "PENDING" : "NOT_APPLICABLE", detail: f.productionDeployed ? "Not run" : "No production deploy yet" });

  return g;
}

// The gates that MUST pass before production. Tag protection is deliberately excluded
// (administrative governance, not a deployment prerequisite); the post-deploy outcome
// gates (prod_deployed, prod_smoke) are results of deploying, not preconditions.
export const MANDATORY_GATES = [
  "baseline",
  "governance",
  "api_key",
  "model",
  "model_allowlisted",
  "provider_test",
  "validation_env",
  "automated_tests",
  "browser_validation",
  "live_provider",
  "release_approved",
] as const;

/** Are all MANDATORY gates satisfied? Advisory gates (e.g. tag protection) never block. */
export function productionDeployAllowed(gates: Gate[]): { allowed: boolean; blockers: string[] } {
  const mandatory = new Set<string>(MANDATORY_GATES);
  const blockers = gates.filter((g) => mandatory.has(g.key) && !g.advisory && g.status !== "PASS").map((g) => g.label);
  return { allowed: blockers.length === 0, blockers };
}

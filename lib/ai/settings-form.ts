// Pure validation for the admin AI settings form. No I/O, no secrets stored here —
// encryption + persistence live in the server action. Fail-closed: a present-but-
// malformed value is an error, not silently dropped.

export type AiSettingsInput = {
  model: string | null;
  approvedModels: string[];
  timeoutMs: number | null;
  enabled: boolean;
  envTarget: "VALIDATION" | "PRODUCTION";
  /** A NEW plaintext API key to store, or null to keep the existing one unchanged. */
  newApiKey: string | null;
};

export type AiSettingsParse = { ok: true; value: AiSettingsInput } | { ok: false; error: string };

function blankToNull(v: FormDataEntryValue | null): string | null {
  if (typeof v !== "string") return null;
  const t = v.trim();
  return t.length === 0 ? null : t;
}

/** Split a comma-separated allowlist: trim, drop empties, de-duplicate, preserve order. */
export function parseApprovedModels(raw: string | null): string[] {
  if (!raw) return [];
  const out: string[] = [];
  for (const part of raw.split(",")) {
    const t = part.trim();
    if (t && !out.includes(t)) out.push(t);
  }
  return out;
}

export function parseAiSettingsForm(fd: FormData): AiSettingsParse {
  const model = blankToNull(fd.get("model"));
  const approvedModels = parseApprovedModels(blankToNull(fd.get("approvedModels")));
  const newApiKey = blankToNull(fd.get("apiKey"));
  const envTargetRaw = blankToNull(fd.get("envTarget")) ?? "VALIDATION";

  if (newApiKey && newApiKey.length < 10) {
    return { ok: false, error: "API key looks too short — paste the full Anthropic API key." };
  }
  if (model && approvedModels.length > 0 && !approvedModels.includes(model)) {
    return { ok: false, error: `The selected model "${model}" must appear in the approved model list.` };
  }
  if (envTargetRaw !== "VALIDATION" && envTargetRaw !== "PRODUCTION") {
    return { ok: false, error: "Environment target must be validation or production." };
  }

  let timeoutMs: number | null = null;
  const timeoutRaw = blankToNull(fd.get("timeoutMs"));
  if (timeoutRaw) {
    const n = Number(timeoutRaw);
    if (!Number.isInteger(n) || n <= 0) return { ok: false, error: "Request timeout must be a positive whole number of milliseconds." };
    timeoutMs = n;
  }

  return {
    ok: true,
    value: {
      model,
      approvedModels,
      timeoutMs,
      enabled: fd.get("enabled") === "on",
      envTarget: envTargetRaw,
      newApiKey,
    },
  };
}

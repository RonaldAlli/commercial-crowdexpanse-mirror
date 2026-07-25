// Tag-protection status for the release dashboard. Queries Gitea ONLY when a
// repo-admin token is configured through the host environment (GITEA_ADMIN_TOKEN).
// The token is a host-level administrative secret — it is NEVER placed in the app UI,
// returned to a client, or logged. The app may VERIFY protection but must not create
// or elevate it; that remains a repository-admin operation.

import type { TagProtection } from "./release-gates";

const TAG_PATTERN = "workspace-ai-platform-phase1-ready";

export async function checkTagProtection(): Promise<TagProtection> {
  const token = process.env.GITEA_ADMIN_TOKEN;
  const base = process.env.GITEA_API_BASE; // e.g. https://git.example.com/api/v1
  const repo = process.env.GITEA_REPO; // e.g. owner/repo
  if (!token || !base || !repo) return "credential_unavailable";
  try {
    const res = await fetch(`${base}/repos/${repo}/tag_protections`, {
      headers: { Authorization: `token ${token}`, Accept: "application/json" },
      // Never cache a token-bearing response.
      cache: "no-store",
    });
    if (!res.ok) return "unable_to_verify";
    const list = (await res.json()) as Array<{ name_pattern?: string }>;
    const protectedPattern = Array.isArray(list) && list.some((p) => (p.name_pattern ?? "").includes(TAG_PATTERN));
    return protectedPattern ? "protected" : "not_protected";
  } catch {
    return "unable_to_verify";
  }
}

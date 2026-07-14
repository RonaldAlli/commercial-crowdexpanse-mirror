"use server";

import { revalidatePath } from "next/cache";

import { requireUser } from "@/lib/auth";
import { checkAuthorized, GENERIC_DENIAL } from "@/lib/authorize";
import { runRefresh } from "@/lib/intelligence/refresh";
import { manualAdapter } from "@/lib/intelligence/sources/manual-adapter";

// Owner manual-refresh trigger (v1.2, Commit 1d-3a). A UI over the 1c ingestion
// pipeline: it records a SOURCE-ATTRIBUTED observation through the manual adapter,
// which accepts Signals, runs Projection, and produces a durable RefreshJob. This
// is distinct from the direct Edit workflow (updateOwnerField) — same ledger, but
// job-tracked + idempotent + source-stamped. The action never writes columns
// directly and adds no intelligence logic; runRefresh owns the whole write path.

export type RefreshFormState =
  | { error?: string; outcome?: { status: string; observationsRecorded: number; signalsAccepted: number; signalsSuperseded: number } }
  | undefined;

export async function triggerRefreshAction(ownerId: string, _prev: RefreshFormState, formData: FormData): Promise<RefreshFormState> {
  const user = await requireUser();
  if (!(await checkAuthorized(user, "MANAGE", "REFRESH", { targetId: ownerId }))) return { error: GENERIC_DENIAL };

  // Only submit the fields the user actually filled; the adapter normalizes them.
  const displayName = String(formData.get("displayName") ?? "").trim();
  const entityType = String(formData.get("entityType") ?? "").trim();
  const records: { fieldKey: string; value: string }[] = [];
  if (displayName) records.push({ fieldKey: "displayName", value: displayName });
  if (entityType) records.push({ fieldKey: "entityType", value: entityType });
  if (records.length === 0) return { error: "Enter a value for at least one field to record." };

  const job = await runRefresh(
    user.organizationId,
    manualAdapter,
    { targetEntityType: "OWNER", targetEntityId: ownerId, asOf: new Date(), records },
    { actorUserId: user.id },
  );

  revalidatePath(`/owners/${ownerId}`);
  if (job.status === "FAILED") return { error: `Refresh failed: ${job.error ?? "unknown error"}` };
  return { outcome: { status: job.status, observationsRecorded: job.observationsRecorded, signalsAccepted: job.signalsAccepted, signalsSuperseded: job.signalsSuperseded } };
}

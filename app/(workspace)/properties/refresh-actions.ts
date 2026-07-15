"use server";

import { revalidatePath } from "next/cache";

import { requireUser } from "@/lib/auth";
import { checkAuthorized, GENERIC_DENIAL } from "@/lib/authorize";
import { runRefresh } from "@/lib/intelligence/refresh";
import { propertyManualAdapter } from "@/lib/intelligence/sources/property-manual-adapter";

// Property manual-refresh trigger (v1.2, Commit 2b). The Property analogue of the
// Owner refresh action: a UI over the 1c ingestion pipeline that records a
// SOURCE-ATTRIBUTED observation through the Property manual adapter, which accepts
// Signals, runs Projection, and produces a durable RefreshJob. Distinct from the
// direct Edit workflow (updatePropertyRecord) — same ledger, but job-tracked +
// idempotent + source-stamped. The action never writes columns directly and adds no
// intelligence logic: runRefresh owns the whole write path, and the adapter owns
// normalization (yearBuilt/squareFeet). Auth is REFRESH (which mirrors PROPERTY),
// enforced server-side here regardless of what the page chose to render.

export type RefreshFormState =
  | { error?: string; outcome?: { status: string; observationsRecorded: number; signalsAccepted: number; signalsSuperseded: number } }
  | undefined;

export async function triggerPropertyRefreshAction(propertyId: string, _prev: RefreshFormState, formData: FormData): Promise<RefreshFormState> {
  const user = await requireUser();
  if (!(await checkAuthorized(user, "MANAGE", "REFRESH", { targetId: propertyId }))) return { error: GENERIC_DENIAL };

  // Only submit the fields the user actually filled; the adapter normalizes +
  // validates them (a value that fails normalization records no signal ⇒ NOOP).
  const yearBuilt = String(formData.get("yearBuilt") ?? "").trim();
  const squareFeet = String(formData.get("squareFeet") ?? "").trim();
  const records: { fieldKey: string; value: string }[] = [];
  if (yearBuilt) records.push({ fieldKey: "yearBuilt", value: yearBuilt });
  if (squareFeet) records.push({ fieldKey: "squareFeet", value: squareFeet });
  if (records.length === 0) return { error: "Enter a value for at least one field to record." };

  const job = await runRefresh(
    user.organizationId,
    propertyManualAdapter,
    { targetEntityType: "PROPERTY", targetEntityId: propertyId, asOf: new Date(), records },
    { actorUserId: user.id },
  );

  revalidatePath(`/properties/${propertyId}`);
  if (job.status === "FAILED") return { error: `Refresh failed: ${job.error ?? "unknown error"}` };
  return { outcome: { status: job.status, observationsRecorded: job.observationsRecorded, signalsAccepted: job.signalsAccepted, signalsSuperseded: job.signalsSuperseded } };
}

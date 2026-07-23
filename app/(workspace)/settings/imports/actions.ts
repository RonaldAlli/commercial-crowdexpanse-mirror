"use server";

import { UserRole } from "@prisma/client";
import { revalidatePath } from "next/cache";

import { requireRole } from "@/lib/auth";
import { isAcquisitionChannel } from "@/lib/acquisition-options";
import { queueLeadImportJob } from "@/lib/lead-import-jobs";
import { absolutePathFor, buildStorageKey, MAX_UPLOAD_BYTES, persistFile } from "@/lib/storage";

export async function startLeadImportAction(formData: FormData) {
  const user = await requireRole(UserRole.ADMIN);

  let sourceFile = String(formData.get("sourceFile") ?? "").trim();
  const actorEmail = String(formData.get("actorEmail") ?? "").trim() || user.email;
  const provider = String(formData.get("provider") ?? "").trim() || "dealautomator.com/commercial-lead";
  const limitRaw = String(formData.get("limit") ?? "").trim();
  const dryRun = String(formData.get("dryRun") ?? "") === "on";
  const acquisitionChannel = String(formData.get("acquisitionChannel") ?? "").trim();
  const acquisitionCampaign = String(formData.get("acquisitionCampaign") ?? "").trim() || null;
  const uploaded = formData.get("leadFile");

  // Attribution Rule 1: an import batch is a single acquisition event, so a channel is required —
  // it is stamped onto every opportunity the batch creates (same historical contract as manual entry).
  if (!isAcquisitionChannel(acquisitionChannel)) {
    return { error: "An acquisition channel is required for the import batch." };
  }

  if (uploaded instanceof File && uploaded.size > 0) {
    if (uploaded.size > MAX_UPLOAD_BYTES) {
      return { error: "Lead file is too large (25MB max)." };
    }
    const lower = uploaded.name.toLowerCase();
    // CSV-only intake (ADR-0006): Excel (.xlsx/.xls) is intentionally NOT accepted — the
    // SheetJS untrusted-file parse path was removed to eliminate its known-CVE surface.
    if (![".json", ".csv", ".tsv", ".txt"].some((ext) => lower.endsWith(ext))) {
      return { error: "Supported lead files are JSON, CSV, and TSV/TXT. Excel (.xlsx/.xls) is not supported — export to CSV first." };
    }

    const storageKey = buildStorageKey(user.organizationId, `lead-import-${uploaded.name || "batch.json"}`);
    const buffer = Buffer.from(await uploaded.arrayBuffer());
    await persistFile(storageKey, buffer);
    const storedPath = absolutePathFor(storageKey);
    if (!storedPath) {
      return { error: "Uploaded file could not be stored safely." };
    }
    sourceFile = storedPath;
  }

  if (!sourceFile) {
    return { error: "Choose a lead file or enter a server source path." };
  }

  let limit: number | null = null;
  if (limitRaw) {
    const parsed = Number.parseInt(limitRaw, 10);
    if (!Number.isFinite(parsed) || parsed <= 0) {
      return { error: "Limit must be a positive whole number." };
    }
    limit = parsed;
  }

  try {
    const job = await queueLeadImportJob({
      organizationId: user.organizationId,
      organizationSlug: user.organizationSlug,
      actorEmail,
      sourceFile,
      provider,
      dryRun,
      limit,
      acquisitionChannel,
      acquisitionCampaign,
    });
    revalidatePath("/settings/imports");
    return {
      success: `Import job queued${dryRun ? " (dry run)" : ""}.`,
      jobId: job.id,
      // Safe display name only — never the absolute server path.
      sourceName: job.sourceName,
    };
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Unable to queue import job." };
  }
}

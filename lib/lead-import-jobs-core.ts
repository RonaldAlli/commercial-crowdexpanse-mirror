// Pure, server-only-free core for lead-import job metadata: types, validation, organization-
// scoped listing/reading, and the safe (path-free) public projection. No Prisma, no `spawn`,
// no `server-only` — so it is directly unit-testable. The server module (`lead-import-jobs.ts`)
// re-exports these and adds the Prisma/enqueue surface behind the `server-only` guard.

import fs from "node:fs/promises";
import path from "node:path";

export type LeadImportJobStatus = "queued" | "running" | "succeeded" | "failed";

export type LeadImportJobSummary = {
  sourceFile: string;
  dryRun: boolean;
  totalLoaded: number;
  deduped: number;
  attempted: number;
  skipped: number;
  ownersCreated: number;
  ownersReused: number;
  propertiesCreated: number;
  propertiesResolved: number;
  externalIdsAttached: number;
  opportunitiesCreated: number;
  opportunitiesReused: number;
  notesCreated: number;
  errors: Array<{ leadId: string; message: string }>;
};

export type LeadImportJobRecord = {
  id: string;
  organizationId: string;
  status: LeadImportJobStatus;
  createdAt: string;
  updatedAt: string;
  startedAt?: string | null;
  finishedAt?: string | null;
  exitCode?: number | null;
  organizationSlug: string;
  actorEmail: string;
  sourceFile: string;
  provider: string;
  dryRun: boolean;
  limit: number | null;
  logFile: string;
  summaryFile: string;
  summary?: LeadImportJobSummary | null;
  error?: string | null;
};

// The SAFE, org-scoped projection: NEVER exposes absolute server paths — only a display name.
export type PublicLeadImportJob = {
  id: string;
  status: LeadImportJobStatus;
  createdAt: string;
  updatedAt: string;
  startedAt?: string | null;
  finishedAt?: string | null;
  exitCode?: number | null;
  actorEmail: string;
  provider: string;
  dryRun: boolean;
  limit: number | null;
  sourceName: string;
  summary?: LeadImportJobSummary | null;
  error?: string | null;
};

export function jobDir(): string {
  return process.env.LEAD_IMPORT_JOB_DIR || "/tmp/commercial-import-jobs";
}

export const JOB_ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Read + validate a job metadata file. FAILS CLOSED: returns null when the file is missing,
 * malformed, or lacks a non-empty string `organizationId` — such a record can never be
 * attributed to an org and must not leak.
 */
export async function readJobFile(file: string): Promise<LeadImportJobRecord | null> {
  try {
    const content = await fs.readFile(file, "utf8");
    const parsed = JSON.parse(content) as Partial<LeadImportJobRecord>;
    if (!parsed || typeof parsed !== "object") return null;
    if (typeof parsed.organizationId !== "string" || parsed.organizationId.length === 0) return null;
    if (typeof parsed.id !== "string" || typeof parsed.status !== "string") return null;
    return parsed as LeadImportJobRecord;
  } catch {
    return null;
  }
}

/** Sanitized, path-free projection for the requesting organization's UI. */
export function toPublicJob(record: LeadImportJobRecord): PublicLeadImportJob {
  return {
    id: record.id,
    status: record.status,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
    startedAt: record.startedAt ?? null,
    finishedAt: record.finishedAt ?? null,
    exitCode: record.exitCode ?? null,
    actorEmail: record.actorEmail,
    provider: record.provider,
    dryRun: record.dryRun,
    limit: record.limit ?? null,
    sourceName: record.sourceFile ? path.basename(record.sourceFile) : "(unknown)",
    summary: record.summary ?? null,
    error: record.error ?? null,
  };
}

/**
 * List import jobs for ONE organization. Requires explicit organization context; only jobs
 * whose `organizationId` matches are returned. Other-org records and org-less records are
 * suppressed (fail closed). Absolute paths are never returned.
 */
export async function listLeadImportJobs(
  organizationId: string,
  limit = 12,
): Promise<PublicLeadImportJob[]> {
  if (!organizationId) return [];
  const dir = jobDir();
  await fs.mkdir(dir, { recursive: true });
  const files = await fs.readdir(dir);
  const records = (
    await Promise.all(
      files
        .filter((file) => file.endsWith(".json") && !file.endsWith(".summary.json"))
        .map((file) => readJobFile(path.join(dir, file))),
    )
  )
    .filter((job): job is LeadImportJobRecord => job !== null)
    .filter((job) => job.organizationId === organizationId)
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  return records.slice(0, limit).map(toPublicJob);
}

/**
 * Read a single job, validated by BOTH job id shape and organization ownership. Fails closed to
 * a uniform `null` on: bad id, missing file, missing/mismatched organizationId. Never discloses
 * that a cross-org job exists.
 */
export async function getLeadImportJob(
  organizationId: string,
  jobId: string,
): Promise<PublicLeadImportJob | null> {
  if (!organizationId || !JOB_ID_PATTERN.test(jobId)) return null;
  const record = await readJobFile(path.join(jobDir(), `${jobId}.json`));
  if (!record) return null;
  if (record.organizationId !== organizationId) return null; // uniform null — no cross-org disclosure
  return toPublicJob(record);
}

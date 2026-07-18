import "server-only";

import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { spawn } from "node:child_process";

import { prisma } from "@/lib/prisma";
import {
  jobDir,
  toPublicJob,
  type LeadImportJobRecord,
  type PublicLeadImportJob,
} from "@/lib/lead-import-jobs-core";

// Re-export the org-scoped read surface + types from the pure core (unit-tested there).
export {
  listLeadImportJobs,
  getLeadImportJob,
  type LeadImportJobStatus,
  type LeadImportJobSummary,
  type LeadImportJobRecord,
  type PublicLeadImportJob,
} from "@/lib/lead-import-jobs-core";

function assertSafeImportPath(input: string) {
  if (!path.isAbsolute(input)) {
    throw new Error("Source file must be an absolute path on the server.");
  }
  const normalized = path.normalize(input);
  const allowedRoots = [
    "/tmp/",
    path.join(process.cwd(), "uploads") + path.sep,
    path.join(process.cwd(), "imports") + path.sep,
  ];
  if (!allowedRoots.some((root) => normalized.startsWith(root))) {
    throw new Error("Source file must be inside /tmp, uploads, or imports.");
  }
  return normalized;
}

export async function getLeadImportCounts(organizationId: string) {
  const [owners, properties, opportunities, notes, externalIds] = await Promise.all([
    prisma.owner.count({ where: { organizationId } }),
    prisma.property.count({ where: { organizationId } }),
    prisma.opportunity.count({ where: { organizationId } }),
    prisma.note.count({ where: { organizationId } }),
    prisma.propertyExternalIdentifier.count({ where: { organizationId } }),
  ]);
  return { owners, properties, opportunities, notes, externalIds };
}

export async function queueLeadImportJob(input: {
  organizationId: string;
  organizationSlug: string;
  actorEmail: string;
  sourceFile: string;
  provider: string;
  dryRun: boolean;
  limit: number | null;
}): Promise<PublicLeadImportJob> {
  if (!input.organizationId) {
    throw new Error("Organization context is required to queue an import.");
  }
  const dir = jobDir();
  await fs.mkdir(dir, { recursive: true });
  const id = crypto.randomUUID();
  const createdAt = new Date().toISOString();
  const sourceFile = assertSafeImportPath(input.sourceFile);
  await fs.access(sourceFile);

  const logFile = path.join(dir, `${id}.log`);
  const summaryFile = path.join(dir, `${id}.summary.json`);
  const jobFile = path.join(dir, `${id}.json`);

  const record: LeadImportJobRecord = {
    id,
    organizationId: input.organizationId,
    status: "queued",
    createdAt,
    updatedAt: createdAt,
    organizationSlug: input.organizationSlug,
    actorEmail: input.actorEmail,
    sourceFile,
    provider: input.provider,
    dryRun: input.dryRun,
    limit: input.limit,
    logFile,
    summaryFile,
    summary: null,
    error: null,
  };
  await fs.writeFile(jobFile, `${JSON.stringify(record, null, 2)}\n`, "utf8");

  const runnerArgs = [
    "scripts/run-commercial-import-job.mjs",
    "--job-file",
    jobFile,
    "--log-file",
    logFile,
    "--summary-file",
    summaryFile,
    "--source-file",
    sourceFile,
    "--organization-slug",
    input.organizationSlug,
    "--actor-email",
    input.actorEmail,
    "--provider",
    input.provider,
    "--dry-run",
    input.dryRun ? "1" : "0",
  ];
  if (input.limit !== null) {
    runnerArgs.push("--limit", String(input.limit));
  }

  const child = spawn(process.execPath, runnerArgs, {
    cwd: process.cwd(),
    detached: true,
    stdio: "ignore",
    env: process.env,
  });
  child.unref();

  // Return only the safe projection (no absolute paths leak out of this module).
  return toPublicJob(record);
}

import "server-only";

import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { spawn } from "node:child_process";

import { prisma } from "@/lib/prisma";

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

const JOB_DIR = "/tmp/commercial-import-jobs";

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

async function ensureJobDir() {
  await fs.mkdir(JOB_DIR, { recursive: true });
}

async function readJobFile(file: string): Promise<LeadImportJobRecord | null> {
  try {
    const content = await fs.readFile(file, "utf8");
    return JSON.parse(content) as LeadImportJobRecord;
  } catch {
    return null;
  }
}

export async function listLeadImportJobs(limit = 12): Promise<LeadImportJobRecord[]> {
  await ensureJobDir();
  const files = await fs.readdir(JOB_DIR);
  const jobs = (
    await Promise.all(
      files
        .filter((file) => file.endsWith(".json"))
        .map((file) => readJobFile(path.join(JOB_DIR, file))),
    )
  )
    .filter((job): job is LeadImportJobRecord => job !== null)
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  return jobs.slice(0, limit);
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
  organizationSlug: string;
  actorEmail: string;
  sourceFile: string;
  provider: string;
  dryRun: boolean;
  limit: number | null;
}) {
  await ensureJobDir();
  const id = crypto.randomUUID();
  const createdAt = new Date().toISOString();
  const sourceFile = assertSafeImportPath(input.sourceFile);
  await fs.access(sourceFile);

  const logFile = path.join(JOB_DIR, `${id}.log`);
  const summaryFile = path.join(JOB_DIR, `${id}.summary.json`);
  const jobFile = path.join(JOB_DIR, `${id}.json`);

  const record: LeadImportJobRecord = {
    id,
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

  return record;
}

import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { listLeadImportJobs, getLeadImportJob } from "../../../lib/lead-import-jobs-core";

// jobDir() reads this env lazily (at call time), so setting it here — after the hoisted import
// but before any test runs — isolates the job dir to a throwaway temp location.
const TMP = path.join(os.tmpdir(), `crm-import-jobs-test-${process.pid}`);
process.env.LEAD_IMPORT_JOB_DIR = TMP;

const ORG_A = "org-aaaaaaaa";
const ORG_B = "org-bbbbbbbb";
const UUID_A = "11111111-1111-1111-1111-111111111111";
const UUID_B = "22222222-2222-2222-2222-222222222222";
const UUID_MISSING_ORG = "33333333-3333-3333-3333-333333333333";
const UUID_UNKNOWN = "99999999-9999-9999-9999-999999999999";

function record(id: string, organizationId: string | undefined, extra: Record<string, unknown> = {}) {
  return {
    id,
    organizationId,
    status: "succeeded",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    organizationSlug: "slug",
    actorEmail: "user@example.com",
    sourceFile: "/tmp/commercial-import-jobs/secret/absolute/path-leads.csv",
    logFile: "/tmp/commercial-import-jobs/secret/path.log",
    summaryFile: "/tmp/commercial-import-jobs/secret/path.summary.json",
    provider: "p",
    dryRun: false,
    limit: null,
    ...extra,
  };
}

before(async () => {
  await fs.mkdir(TMP, { recursive: true });
  await fs.writeFile(path.join(TMP, `${UUID_A}.json`), JSON.stringify(record(UUID_A, ORG_A)));
  await fs.writeFile(path.join(TMP, `${UUID_B}.json`), JSON.stringify(record(UUID_B, ORG_B)));
  // A record with NO organizationId (must fail closed — never listed/returned).
  await fs.writeFile(path.join(TMP, `${UUID_MISSING_ORG}.json`), JSON.stringify(record(UUID_MISSING_ORG, undefined)));
  // Malformed metadata (must be ignored safely).
  await fs.writeFile(path.join(TMP, "44444444-4444-4444-4444-444444444444.json"), "{ this is not valid json");
});

after(async () => {
  await fs.rm(TMP, { recursive: true, force: true });
});

test("Org A sees only its own jobs", async () => {
  const jobs = await listLeadImportJobs(ORG_A);
  assert.equal(jobs.length, 1);
  assert.equal(jobs[0].id, UUID_A);
});

test("Org B sees only its own jobs (not A's)", async () => {
  const jobs = await listLeadImportJobs(ORG_B);
  assert.equal(jobs.length, 1);
  assert.equal(jobs[0].id, UUID_B);
  assert.ok(!jobs.some((j) => j.id === UUID_A), "B must not see A's job");
});

test("A job with no organizationId is never listed (fail closed)", async () => {
  const all = [...(await listLeadImportJobs(ORG_A)), ...(await listLeadImportJobs(ORG_B))];
  assert.ok(!all.some((j) => j.id === UUID_MISSING_ORG), "org-less record must not surface");
});

test("Malformed metadata is ignored (does not throw, not listed)", async () => {
  const jobs = await listLeadImportJobs(ORG_A);
  assert.equal(jobs.length, 1); // only the valid A record
});

test("getLeadImportJob returns own org's job", async () => {
  const job = await getLeadImportJob(ORG_A, UUID_A);
  assert.ok(job);
  assert.equal(job?.id, UUID_A);
});

test("Org B cannot read Org A's job detail (uniform null, no disclosure)", async () => {
  const job = await getLeadImportJob(ORG_B, UUID_A);
  assert.equal(job, null);
});

test("Unknown job id returns null without disclosing existence", async () => {
  assert.equal(await getLeadImportJob(ORG_A, UUID_UNKNOWN), null);
});

test("Missing-org record fails closed on direct read", async () => {
  assert.equal(await getLeadImportJob(ORG_A, UUID_MISSING_ORG), null);
});

test("Malformed / traversal job ids are rejected (no path traversal)", async () => {
  assert.equal(await getLeadImportJob(ORG_A, "../../etc/passwd"), null);
  assert.equal(await getLeadImportJob(ORG_A, "not-a-uuid"), null);
  assert.equal(await getLeadImportJob(ORG_A, ""), null);
});

test("Empty organization context returns nothing (fail closed)", async () => {
  assert.deepEqual(await listLeadImportJobs(""), []);
  assert.equal(await getLeadImportJob("", UUID_A), null);
});

test("Public projection never leaks absolute server paths", async () => {
  const job = await getLeadImportJob(ORG_A, UUID_A);
  assert.ok(job);
  const serialized = JSON.stringify(job);
  assert.ok(!serialized.includes("/tmp/commercial-import-jobs/secret"), "no absolute path leaks");
  assert.ok(!("sourceFile" in (job as object)), "no sourceFile field");
  assert.ok(!("logFile" in (job as object)), "no logFile field");
  assert.ok(!("summaryFile" in (job as object)), "no summaryFile field");
  assert.equal(job?.sourceName, "path-leads.csv", "only a basename display name is exposed");
});

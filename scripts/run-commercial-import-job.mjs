import fs from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";
import { spawn } from "node:child_process";

function parseArgs(argv) {
  const out = {};
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (!arg.startsWith("--")) continue;
    out[arg.slice(2)] = argv[index + 1] ?? "";
    index += 1;
  }
  return out;
}

async function writeJson(file, payload) {
  await fsp.mkdir(path.dirname(file), { recursive: true });
  await fsp.writeFile(file, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const jobFile = args["job-file"];
  const logFile = args["log-file"];
  const sourceFile = args["source-file"];
  const organizationSlug = args["organization-slug"];
  const actorEmail = args["actor-email"];
  const provider = args["provider"];
  const limit = args["limit"];
  const dryRun = args["dry-run"] === "1";
  const summaryFile = args["summary-file"];

  if (!jobFile || !logFile || !sourceFile || !organizationSlug || !actorEmail || !provider || !summaryFile) {
    throw new Error("Missing required runner arguments.");
  }

  const initial = JSON.parse(await fsp.readFile(jobFile, "utf8"));
  const startedAt = new Date().toISOString();
  await writeJson(jobFile, {
    ...initial,
    status: "running",
    startedAt,
    updatedAt: startedAt,
  });

  await fsp.mkdir(path.dirname(logFile), { recursive: true });
  const logStream = fs.createWriteStream(logFile, { flags: "a" });

  const importerArgs = [
    "--env-file=.env",
    "node_modules/.bin/tsx",
    "scripts/import-dealautomator-commercial-leads.ts",
    "--file",
    sourceFile,
    "--organization-slug",
    organizationSlug,
    "--actor-email",
    actorEmail,
    "--provider",
    provider,
    "--summary-file",
    summaryFile,
  ];
  if (dryRun) importerArgs.push("--dry-run");
  if (limit) importerArgs.push("--limit", limit);

  const child = spawn(process.execPath, importerArgs, {
    cwd: process.cwd(),
    env: process.env,
    stdio: ["ignore", "pipe", "pipe"],
  });

  let stderr = "";
  child.stdout.on("data", (chunk) => {
    logStream.write(chunk);
  });
  child.stderr.on("data", (chunk) => {
    const text = chunk.toString();
    stderr += text;
    logStream.write(chunk);
  });

  const exitCode = await new Promise((resolve, reject) => {
    child.on("error", reject);
    child.on("close", resolve);
  });

  logStream.end();

  let summary = null;
  try {
    summary = JSON.parse(await fsp.readFile(summaryFile, "utf8"));
  } catch {
    summary = null;
  }

  const finishedAt = new Date().toISOString();
  await writeJson(jobFile, {
    ...initial,
    status: exitCode === 0 ? "succeeded" : "failed",
    startedAt,
    finishedAt,
    updatedAt: finishedAt,
    exitCode,
    summary,
    error: exitCode === 0 ? null : stderr.trim().slice(-4000) || "Import process failed.",
  });
}

main().catch(async (error) => {
  const args = parseArgs(process.argv.slice(2));
  const jobFile = args["job-file"];
  if (jobFile) {
    // Preserve the existing record (esp. organizationId) so a hard-failed job stays
    // org-attributable and visible to its owning organization (never dropped by fail-closed).
    let existing = {};
    try {
      existing = JSON.parse(await fsp.readFile(jobFile, "utf8"));
    } catch {
      existing = {};
    }
    const finishedAt = new Date().toISOString();
    await writeJson(jobFile, {
      ...existing,
      id: existing.id ?? path.basename(jobFile, ".json"),
      status: "failed",
      finishedAt,
      updatedAt: finishedAt,
      error: error instanceof Error ? error.message : String(error),
    });
  }
  console.error(error);
  process.exit(1);
});

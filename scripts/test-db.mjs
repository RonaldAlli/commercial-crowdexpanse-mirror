// Test-database tooling: setup | reset | sweep.
//
// Loads `.env.test` (so it targets the dedicated local test DB, never prod),
// enforces the *_test guard, then:
//   setup  → prisma db push               (materialize the schema)
//   reset  → prisma db push --force-reset  (drop + recreate tables; no CREATEDB)
//   sweep  → delete leftover "e2e-" orgs   (reap orphans from a crashed run)
//
// The database itself is created once, out of band, by a privileged role:
//   sudo -u postgres createdb -O commercial_app commercial_crowdexpanse_test
import { existsSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join, resolve } from "node:path";

import { assertTestDatabase } from "./e2e-guard.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, "..");
const ENV_FILE = join(repoRoot, ".env.test");

const cmd = process.argv[2];
if (!["setup", "reset", "sweep"].includes(cmd)) {
  console.error("usage: node scripts/test-db.mjs <setup|reset|sweep>");
  process.exit(1);
}

if (!existsSync(ENV_FILE)) {
  console.error(
    `[test-db] Missing ${ENV_FILE}.\n` +
      "Copy .env.test.example → .env.test and point DATABASE_URL at your *_test database.",
  );
  process.exit(1);
}

// Load the test env BEFORE anything reads DATABASE_URL, then hard-check it.
process.loadEnvFile(ENV_FILE);
const dbName = assertTestDatabase({ log: true });

function runPrisma(args) {
  const bin = join(repoRoot, "node_modules", ".bin", "prisma");
  const res = spawnSync(bin, args, { cwd: repoRoot, stdio: "inherit" });
  process.exit(res.status ?? 1);
}

if (cmd === "setup") {
  console.log(`[test-db] Pushing schema to ${dbName} ...`);
  runPrisma(["db", "push"]);
} else if (cmd === "reset") {
  console.log(`[test-db] Resetting ${dbName} (force-reset) ...`);
  runPrisma(["db", "push", "--force-reset"]);
} else if (cmd === "sweep") {
  const { PrismaClient } = await import("@prisma/client");
  const prisma = new PrismaClient();
  try {
    const res = await prisma.organization.deleteMany({ where: { name: { startsWith: "e2e-" } } });
    console.log(`[test-db] Swept ${res.count} leftover e2e- organization(s) from ${dbName}.`);
  } finally {
    await prisma.$disconnect();
  }
}

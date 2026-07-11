// Safety guard for the E2E suite and test-DB tooling.
//
// Refuses to run unless DATABASE_URL points at a database whose name ends in
// "_test". Production (commercial_crowdexpanse) can NEVER be an E2E target.
// There is intentionally NO override / bypass flag — the check is absolute.
//
// Called explicitly at the top of every E2E script, by the runner, and by the
// test-DB tooling. If DATABASE_URL isn't in the environment yet (e.g. a direct
// `tsx scripts/e2e-*.mjs` before Prisma loads its .env), it discovers what
// Prisma WOULD use by loading `.env`, so an accidental production run aborts
// before any write.
import { existsSync } from "node:fs";

function resolveDatabaseUrl() {
  if (process.env.DATABASE_URL) return process.env.DATABASE_URL;
  // Not set yet — discover the URL Prisma would fall back to, so we can refuse a
  // production target instead of silently proceeding.
  if (typeof process.loadEnvFile === "function" && existsSync(".env")) {
    try {
      process.loadEnvFile(".env");
    } catch {
      /* ignore — handled as "unset" below */
    }
  }
  return process.env.DATABASE_URL;
}

function databaseName(url) {
  try {
    return decodeURIComponent(new URL(url).pathname.replace(/^\//, ""));
  } catch {
    return "";
  }
}

/**
 * Throw unless DATABASE_URL targets a "*_test" database. Returns the database
 * name on success. Pass { log: true } to print the resolved target once.
 */
export function assertTestDatabase({ log = false } = {}) {
  const url = resolveDatabaseUrl();
  if (!url) {
    throw new Error(
      "[e2e-guard] DATABASE_URL is not set — refusing to run E2E without an explicit *_test database.",
    );
  }
  const name = databaseName(url);
  if (!/_test$/i.test(name)) {
    throw new Error(
      `[e2e-guard] Refusing to run against database "${name || "(unparseable)"}".\n` +
        `E2E may only target a database whose name ends in "_test" (e.g. commercial_crowdexpanse_test).\n` +
        `This protects production; there is no override.`,
    );
  }
  if (log) console.log(`[e2e-guard] E2E target database: ${name}`);
  return name;
}

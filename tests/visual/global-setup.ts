import { execFileSync } from "node:child_process";

// Seed the visual fixtures via the proven node+tsx path (so the app's `@/` imports resolve the
// same way the e2e-*.mjs scripts do — never through Playwright's loader). Env comes from
// .env.test (loaded by --env-file-if-exists), which pins DATABASE_URL to the _test DB and the
// test SESSION_SECRET used to mint the session cookies.
export default async function globalSetup() {
  execFileSync(process.execPath, ["--env-file-if-exists=.env.test", "--import", "tsx", "tests/visual/seed.mjs"], {
    stdio: "inherit",
  });
}

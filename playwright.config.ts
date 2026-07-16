import { existsSync, readFileSync } from "node:fs";
import { defineConfig, devices } from "@playwright/test";

// Test-only config for the Closing Center visual/a11y harness (v1.4 accordion slice). Runs
// Chromium against an ISOLATED local instance (next start from .next-isolated) bound to the
// _test database — never production. Playwright is a devDependency; nothing here ships.

// Load .env.test (DATABASE_URL → _test DB, SESSION_SECRET → the secret used to mint sessions)
// into the env passed to the web server, without adding a dotenv dependency.
const testEnv: Record<string, string> = {};
if (existsSync(".env.test")) {
  for (const line of readFileSync(".env.test", "utf8").split("\n")) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m) testEnv[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
}

// A deliberately uncommon port: this is a shared host where other services occupy the usual
// dev ports (e.g. 3100). Paired with reuseExistingServer:false so Playwright always boots its
// OWN isolated server and never silently reuses a foreign one.
const PORT = 3199;
const BASE_URL = `http://127.0.0.1:${PORT}`;

export default defineConfig({
  testDir: "./tests/visual",
  fullyParallel: false,
  workers: 2,
  forbidOnly: !!process.env.CI,
  retries: 0,
  reporter: [["list"], ["html", { outputFolder: "playwright-report", open: "never" }]],
  globalSetup: "./tests/visual/global-setup.ts",
  globalTeardown: "./tests/visual/global-teardown.ts",
  timeout: 30_000,
  expect: { timeout: 7_000 },
  use: {
    baseURL: BASE_URL,
    viewport: { width: 1440, height: 1000 }, // desktop default; specs override for tablet/mobile
    trace: "retain-on-failure",
    screenshot: "off", // the specs capture deterministic named screenshots themselves
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"], viewport: { width: 1440, height: 1000 } } }],
  webServer: {
    command: `node_modules/.bin/next start -p ${PORT}`,
    url: BASE_URL,
    timeout: 120_000,
    reuseExistingServer: false,
    env: {
      ...testEnv,
      NEXT_DIST_DIR: ".next-isolated",
      PORT: String(PORT),
      // Never inherit a production DATABASE_URL — the _test URL from .env.test is authoritative.
      DATABASE_URL: testEnv.DATABASE_URL ?? "",
      SESSION_SECRET: testEnv.SESSION_SECRET ?? "",
    },
  },
});

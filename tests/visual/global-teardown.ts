import { execFileSync } from "node:child_process";

// Cascade-delete the throwaway visual org(s) and remove auth artifacts after the run.
export default async function globalTeardown() {
  execFileSync(process.execPath, ["--env-file-if-exists=.env.test", "--import", "tsx", "tests/visual/teardown.mjs"], {
    stdio: "inherit",
  });
}

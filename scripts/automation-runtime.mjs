// The dedicated Automation runtime process entrypoint (Phase 2.0.1, ADR-0002). Runs the
// scheduler, executor, and reaper loops in one PM2 fork process (`crowdexpanse-automation`),
// SEPARATE from the Next.js request process. It starts ONLY when executed directly — importing
// it does nothing (the main() call is guarded), and the lib/automation modules have no import
// side effects. Fail-closed on missing config. Graceful shutdown: stop claiming, finish
// in-flight work, disconnect. Never started in production without deploy authorization.
import { pathToFileURL } from "node:url";

import { prisma } from "../lib/prisma.ts";
import { handlers, seeders } from "../lib/automation/registry.ts";
import { startExecutorLoop } from "../lib/automation/executor.ts";
import { runSchedulerOnce } from "../lib/automation/scheduler.ts";
import { reapStaleJobs } from "../lib/automation/reaper.ts";

const SCHEDULER_ENABLED = process.env.AUTOMATION_SCHEDULER_ENABLED === "1"; // kill-switch (default OFF)
const SCHEDULER_INTERVAL_MS = Number(process.env.AUTOMATION_SCHEDULER_INTERVAL_MS ?? 60_000);
const REAPER_INTERVAL_MS = Number(process.env.AUTOMATION_REAPER_INTERVAL_MS ?? 30_000);
const EXECUTOR_IDLE_MS = Number(process.env.AUTOMATION_EXECUTOR_IDLE_MS ?? 5_000);

// A generic bounded-interval loop with graceful stop (used for scheduler + reaper).
function intervalLoop(fn, intervalMs) {
  let running = true;
  let resolveFinished = () => {};
  const finished = new Promise((r) => (resolveFinished = r));
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  void (async () => {
    while (running) {
      try {
        await fn();
      } catch (err) {
        console.error("[automation] loop error:", err?.message ?? err); // no tight loop — sleeps below
      }
      await sleep(intervalMs);
    }
    resolveFinished();
  })();
  return {
    stop: async () => {
      running = false;
      await finished;
    },
  };
}

async function main() {
  if (!process.env.DATABASE_URL) {
    console.error("[automation] DATABASE_URL is not set — refusing to start (fail closed).");
    process.exit(1);
  }
  console.log(
    `[automation] runtime starting · scheduler=${SCHEDULER_ENABLED ? "on" : "off"} · handlers=${Object.keys(handlers).length}`,
  );

  const executor = startExecutorLoop(handlers, { idleMs: EXECUTOR_IDLE_MS });
  const reaper = intervalLoop(() => reapStaleJobs(new Date()), REAPER_INTERVAL_MS);
  const scheduler = SCHEDULER_ENABLED
    ? intervalLoop(() => runSchedulerOnce(seeders, new Date()), SCHEDULER_INTERVAL_MS)
    : null;

  let shuttingDown = false;
  const shutdown = async (signal) => {
    if (shuttingDown) return;
    shuttingDown = true;
    console.log(`[automation] ${signal} — draining (stop claiming, finish in-flight)…`);
    await scheduler?.stop(); // stop seeding first
    await executor.stop(); // stop claiming; the in-flight batch completes
    await reaper.stop();
    await prisma.$disconnect();
    console.log("[automation] stopped cleanly.");
    process.exit(0);
  };
  process.on("SIGTERM", () => void shutdown("SIGTERM"));
  process.on("SIGINT", () => void shutdown("SIGINT"));
}

// Start ONLY when executed directly (never on import) — no side effects on import.
if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  void main();
}

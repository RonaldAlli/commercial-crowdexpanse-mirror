// D24 — read-only, EXTERNAL memory sampler (on-demand diagnostic, NOT a permanent monitor).
//
// Out-of-process: polls pm2 RSS + /proc/<pid>/fd count + /api/health on an interval → JSONL. It adds NO
// heap/CPU to the app (one `pm2 jlist` + one readdir + one health GET per tick). Use it when an operational
// question arises (recycle cadence rising, latency, a memory-correlated incident) — not continuously.
//
// Usage:  node scripts/diag/mem-sample.mjs <out.jsonl> [intervalMs=15000] [seconds=3600] [stopFile]
//   - stops at `seconds`, or when `stopFile` appears.
//   - override target via env: MEM_APP (pm2 name), MEM_HEALTH (health URL).
import { execSync } from "node:child_process";
import fs from "node:fs";

const APP = process.env.MEM_APP || "crowdexpanse-commercial";
const HEALTH_URL = process.env.MEM_HEALTH || "http://127.0.0.1:3030/api/health";
const out = process.argv[2];
const intervalMs = +(process.argv[3] || 15000);
const seconds = +(process.argv[4] || 3600);
const stop = process.argv[5];
if (!out) { console.error("usage: mem-sample.mjs <out.jsonl> [intervalMs] [seconds] [stopFile]"); process.exit(2); }

const t0 = Date.now();
function pm2() {
  try {
    const j = JSON.parse(execSync("pm2 jlist", { encoding: "utf8" }));
    const p = j.find((x) => x.name === APP);
    return p ? { pid: p.pid, rss: p.monit.memory, cpu: p.monit.cpu, restart: p.pm2_env.restart_time, unstable: p.pm2_env.unstable_restarts, up: Date.now() - p.pm2_env.pm_uptime } : null;
  } catch { return null; }
}
const fds = (pid) => { try { return fs.readdirSync(`/proc/${pid}/fd`).length; } catch { return null; } };
async function health() {
  try { const r = await fetch(HEALTH_URL, { signal: AbortSignal.timeout(2000) }); const b = await r.json(); return { ok: b.status === "ok", dbMs: b.dbMs }; }
  catch { return { ok: false }; }
}

while (Date.now() - t0 < seconds * 1000) {
  const p = pm2(); const h = await health();
  const rec = { ts: new Date().toISOString(), rss: p?.rss ?? null, rssMB: p ? Math.round(p.rss / 1048576) : null, cpu: p?.cpu ?? null,
    fd: p ? fds(p.pid) : null, restart: p?.restart ?? null, unstable: p?.unstable ?? null, upS: p ? Math.round(p.up / 1000) : null,
    health: h.ok ? "ok" : "bad", dbMs: h.dbMs ?? null, pid: p?.pid ?? null };
  fs.appendFileSync(out, JSON.stringify(rec) + "\n");
  if (stop && fs.existsSync(stop)) break;
  await new Promise((r) => setTimeout(r, intervalMs));
}
console.log("sampler done");

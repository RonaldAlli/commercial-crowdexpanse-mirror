// D25 — REAL operations for the deployment engine (production wiring). These are the side-effecting
// implementations the CLI injects into runDeploy(). They target the atomic-symlink + releases/ model:
//   <appDir>/releases/<stamp>/    ← each built release (a Next dist dir)
//   <appDir>/.next  →  symlink to the active release
// NOTE: not exercised against the production host in the D25 implementation phase — validated later via
// `deploy --dry-run` on the host during the separately-authorized, reversible migration + rollout.
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import fs from "node:fs";
import path from "node:path";

const run = promisify(execFile);
const sh = (cmd, args, opts = {}) => run(cmd, args, { encoding: "utf8", ...opts });

/** Atomic symlink repoint: create a temp link then rename(2) over the target — no partial state. */
function atomicSymlink(target, linkPath) {
  const tmp = `${linkPath}.tmp-${process.pid}`;
  try { fs.unlinkSync(tmp); } catch { /* ignore */ }
  fs.symlinkSync(target, tmp);
  fs.renameSync(tmp, linkPath); // atomic
}
const readBuildId = (distDir) => fs.readFileSync(path.join(distDir, "BUILD_ID"), "utf8").trim();
const linkTarget = (link) => { try { return fs.readlinkSync(link); } catch { return null; } };

export function makeRealOps(config) {
  const {
    appDir, releasesDir = path.join(appDir, "releases"), nextLink = path.join(appDir, ".next"),
    distDirEnv = "NEXT_DIST_DIR", buildScript = "build", pm2App, port = 3030,
    healthPath = "/api/health", keepReleases = 5, minFreeBytes = 3 * 1024 ** 3, // 3 GB headroom
    lockDir = path.join(appDir, ".deploy.lock"), stamp, releaseId,
    historyDir = path.join(appDir, "deploy-history"), keepHistory = 200,
  } = config;

  const releaseRel = (s) => path.join("releases", s);
  const releaseAbs = (s) => path.join(releasesDir, s);

  return {
    log: (m) => process.stdout.write(`  ${m}\n`),

    async precheck(ctx) {
      // serialize deploys — atomic lock dir (fails if another deploy holds it)
      try { fs.mkdirSync(lockDir); } catch { throw new Error(`another deploy holds the lock (${lockDir})`); }
      ctx.lockHeld = true;
      fs.mkdirSync(releasesDir, { recursive: true });
      // disk headroom
      const st = fs.statfsSync(appDir);
      const free = st.bavail * st.bsize;
      if (free < minFreeBytes) throw new Error(`insufficient disk: ${(free / 1024 ** 3).toFixed(1)}GB < ${(minFreeBytes / 1024 ** 3)}GB`);
      // previous (current) release target for rollback scope
      ctx.previousTarget = linkTarget(nextLink); // e.g. "releases/<oldstamp>" or null (first migration)
      // IDEMPOTENCY identities: requested = current source commit; active = marker in the live release.
      ctx.requestedReleaseId = releaseId ?? (await gitHead(appDir));
      if (ctx.previousTarget) {
        const prevAbs = path.join(appDir, ctx.previousTarget);
        try { ctx.activeReleaseId = fs.readFileSync(path.join(prevAbs, ".release-id"), "utf8").trim(); } catch { ctx.activeReleaseId = null; }
        try { ctx.activeBuildId = readBuildId(prevAbs); } catch { ctx.activeBuildId = null; }
      }
      return { summary: `free=${(free / 1024 ** 3).toFixed(1)}GB prev=${ctx.previousTarget ?? "(none)"} req=${ctx.requestedReleaseId ?? "?"} active=${ctx.activeReleaseId ?? "(none)"}` };
    },

    async build(ctx) {
      const abs = releaseAbs(stamp);
      fs.mkdirSync(abs, { recursive: true });
      // Build into the versioned release dir; the LIVE release is never touched.
      await sh("npm", ["run", buildScript], { cwd: appDir, env: { ...process.env, [distDirEnv]: abs }, maxBuffer: 64 * 1024 * 1024 });
      // Stamp the release identity so a future run at the same commit is a detectable no-op.
      if (ctx.requestedReleaseId) fs.writeFileSync(path.join(abs, ".release-id"), ctx.requestedReleaseId);
      return { releaseDir: releaseRel(stamp), absDir: abs, stamp };
    },

    async verifyBuild(_ctx, built) {
      const idPath = path.join(built.absDir, "BUILD_ID");
      if (!fs.existsSync(idPath)) throw new Error("verify: BUILD_ID missing (build incomplete)");
      for (const m of ["build-manifest.json", "prerender-manifest.json"]) {
        if (!fs.existsSync(path.join(built.absDir, m))) throw new Error(`verify: ${m} missing`);
      }
      return { buildId: readBuildId(built.absDir) };
    },

    async validateSwapTarget(_ctx, built) {
      if (!fs.existsSync(path.join(built.absDir, "BUILD_ID"))) throw new Error("swap target not a valid release");
    },
    async validateRollbackTarget(ctx) {
      if (!ctx.previousTarget) { this.log("no previous release yet (first migration) — rollback target N/A"); return; }
      const prevAbs = path.join(appDir, ctx.previousTarget);
      if (!fs.existsSync(path.join(prevAbs, "BUILD_ID"))) throw new Error(`rollback target unreadable: ${ctx.previousTarget}`);
    },

    async swap(ctx, built) {
      atomicSymlink(built.releaseDir, nextLink); // .next → releases/<stamp>
      if (linkTarget(nextLink) !== built.releaseDir) throw new Error("swap: symlink did not repoint");
      ctx.newTarget = built.releaseDir;
    },

    async restart() { await sh("pm2", ["restart", pm2App, "--update-env"]); await waitOnline(pm2App); },

    async verifyRuntime(_ctx, buildId) {
      if (readBuildId(nextLink) !== buildId) throw new Error("runtime: .next not serving the new BUILD_ID");
      await waitHealthy(port, healthPath);
    },

    async smoke() {
      for (const p of ["/login"]) {
        const code = await httpCode(port, p);
        if (code >= 500) throw new Error(`smoke: ${p} → ${code}`);
      }
    },

    async retain() {
      const dirs = fs.readdirSync(releasesDir).filter((d) => fs.existsSync(path.join(releasesDir, d, "BUILD_ID")))
        .sort().reverse(); // newest stamp first (stamps are sortable timestamps)
      for (const old of dirs.slice(keepReleases)) fs.rmSync(path.join(releasesDir, old), { recursive: true, force: true });
    },

    async rollback(ctx) {
      if (!ctx.previousTarget) throw new Error("rollback: no previous release to restore");
      atomicSymlink(ctx.previousTarget, nextLink);
      await sh("pm2", ["restart", pm2App, "--update-env"]);
      await waitOnline(pm2App);
      await waitHealthy(port, healthPath);
    },

    async releaseLock(ctx) { if (ctx.lockHeld) { try { fs.rmdirSync(lockDir); } catch { /* ignore */ } } },

    // Persist ONE record per run — state transitions, timings, BUILD_ID, release id, rollback/smoke
    // status. Written for success, failure, no-op, and dry-run alike; invaluable during incidents.
    async persistTrace(_ctx, record) {
      fs.mkdirSync(historyDir, { recursive: true });
      fs.writeFileSync(path.join(historyDir, `${record.stamp ?? stamp}.json`), JSON.stringify(record, null, 2));
      const files = fs.readdirSync(historyDir).filter((f) => f.endsWith(".json")).sort();
      for (const old of files.slice(0, Math.max(0, files.length - keepHistory))) fs.rmSync(path.join(historyDir, old), { force: true });
    },
  };
}

/** Current source commit (short) — the requested release identity for idempotency. Null if not a repo. */
async function gitHead(cwd) { try { return (await sh("git", ["rev-parse", "--short=12", "HEAD"], { cwd })).stdout.trim(); } catch { return null; } }

// --- small runtime helpers (poll pm2 + health; no external deps) --------------------------------
async function waitOnline(pm2App, tries = 20) {
  for (let i = 0; i < tries; i++) {
    try {
      const { stdout } = await sh("pm2", ["jlist"]);
      const a = JSON.parse(stdout).find((x) => x.name === pm2App);
      if (a && a.pm2_env.status === "online") return;
    } catch { /* retry */ }
    await sleep(500);
  }
  throw new Error(`pm2 ${pm2App} did not reach 'online'`);
}
async function waitHealthy(port, healthPath, tries = 20) {
  for (let i = 0; i < tries; i++) {
    if ((await httpBody(port, healthPath)).includes('"status":"ok"')) return;
    await sleep(500);
  }
  throw new Error("health endpoint did not return ok");
}
function httpCode(port, p) { return httpReq(port, p).then((r) => r.status).catch(() => 0); }
function httpBody(port, p) { return httpReq(port, p).then((r) => r.body).catch(() => ""); }
async function httpReq(port, p) {
  const res = await fetch(`http://127.0.0.1:${port}${p}`, { redirect: "manual" });
  return { status: res.status, body: await res.text().catch(() => "") };
}
function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }

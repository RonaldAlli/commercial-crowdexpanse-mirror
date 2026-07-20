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

  return {
    log: (m) => process.stdout.write(`  ${m}\n`),

    async precheck(ctx) {
      // DE-3: validate the target FIRST — before creating ANY artifact (lock, releases dir) on it. An
      // unmigrated real-dir / dangling `.next` (or the wrong target entirely) aborts here with zero residue,
      // long before the expensive, side-effecting build. (Re-checked at SWAP for defense in depth.)
      assertMigratedTarget(appDir, nextLink);
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
      // DE-1: `next.config.mjs` is `distDir: process.env.NEXT_DIST_DIR || ".next"`, and Next resolves
      // distDir as path.join(projectRoot, distDir). NEXT_DIST_DIR MUST therefore be RELATIVE to appDir —
      // an ABSOLUTE value nests the build OUTSIDE releaseAbs (VERIFY_BUILD then can't find BUILD_ID).
      const { relative: relDist, absolute: abs } = resolveDistDir(appDir, releasesDir, stamp);
      fs.mkdirSync(abs, { recursive: true });
      // Build into the versioned release dir (relative distDir); the LIVE release is never touched.
      await sh("npm", ["run", buildScript], { cwd: appDir, env: { ...process.env, [distDirEnv]: relDist }, maxBuffer: 64 * 1024 * 1024 });
      // `.release-id` = the dead-simple idempotency marker (kept intentionally minimal + robust).
      if (ctx.requestedReleaseId) fs.writeFileSync(path.join(abs, ".release-id"), ctx.requestedReleaseId);
      // release.json = the richer, human/diagnostic manifest (rollbacks, history, artifact verification,
      // future canary). Written from the same build, so it can never diverge from `.release-id`.
      const artifacts = ["BUILD_ID", "build-manifest.json", "prerender-manifest.json", "routes-manifest.json"]
        .filter((f) => fs.existsSync(path.join(abs, f)));
      const manifest = {
        releaseId: ctx.requestedReleaseId ?? null,
        buildId: (() => { try { return readBuildId(abs); } catch { return null; } })(),
        commit: await gitHead(appDir, "%H"),
        builtAt: new Date().toISOString(),
        nodeVersion: process.version,
        schemaVersion: latestMigration(appDir),
        stamp,
        artifacts,
      };
      fs.writeFileSync(path.join(abs, "release.json"), JSON.stringify(manifest, null, 2));
      // releaseDir (the symlink target) = the SAME relative value the build used — they can never diverge.
      return { releaseDir: relDist, absDir: abs, stamp, manifest };
    },

    // INVARIANT: exactly one release is ACTIVE. Active-ness is defined by the single `.next` symlink
    // target, so the meaningful guard before every swap is: `.next` is a proper symlink (post-migration)
    // resolving to exactly one existing, valid release — never a real dir competing with releases/, and
    // never a dangling/invalid target. Runs as a SWAP entry-criterion (and in dry-run validation).
    async assertSingleActive(_ctx) {
      const { active } = assertMigratedTarget(appDir, nextLink);
      return { summary: `active=${active ?? "(none)"}` };
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

/**
 * Resolve the build's dist directory (DE-1). Next resolves `distDir` as path.join(projectRoot, distDir),
 * so the value handed to the build via NEXT_DIST_DIR MUST be RELATIVE to appDir — an absolute value nests
 * the output outside the release dir. Returns { relative } (pass to the build) and { absolute } (where the
 * build actually lands, what VERIFY_BUILD checks). Throws if releasesDir is outside appDir (Next cannot
 * build outside the project root).
 */
export function resolveDistDir(appDir, releasesDir, stamp) {
  const absolute = path.join(releasesDir, stamp);
  const relative = path.relative(appDir, absolute);
  if (relative.startsWith("..") || path.isAbsolute(relative)) {
    throw new Error(`releases dir must be inside appDir for NEXT_DIST_DIR to resolve (got ${absolute} outside ${appDir})`);
  }
  return { relative, absolute };
}

/**
 * DE-3: target validity + single-active invariant. A valid target is `.next` = a proper symlink resolving
 * to exactly one existing release (with BUILD_ID), OR absent (a fresh/first deploy). A real-directory
 * `.next` (unmigrated / wrong target) is rejected. Called in PRECHECK (fail BEFORE the build) and again as
 * the SWAP entry-criterion — defense in depth.
 */
export function assertMigratedTarget(appDir, nextLink) {
  let st = null; try { st = fs.lstatSync(nextLink); } catch { st = null; }
  if (st && !st.isSymbolicLink()) {
    throw new Error("single-active invariant: .next is a real directory, not a symlink — host not migrated (would leave two competing 'current' releases)");
  }
  let t = null; try { t = fs.readlinkSync(nextLink); } catch { t = null; }
  if (t && !fs.existsSync(path.join(appDir, t, "BUILD_ID"))) {
    throw new Error(`single-active invariant: active target '${t}' has no BUILD_ID`);
  }
  return { active: t };
}

/** Current source commit — short (default, the idempotency identity) or a `git log` format like "%H". */
async function gitHead(cwd, format) {
  try {
    return format
      ? (await sh("git", ["log", "-1", `--format=${format}`], { cwd })).stdout.trim()
      : (await sh("git", ["rev-parse", "--short=12", "HEAD"], { cwd })).stdout.trim();
  } catch { return null; }
}

/** Latest applied migration name (lexically last dir under prisma/migrations) — a schema-version proxy. */
function latestMigration(appDir) {
  try {
    const dirs = fs.readdirSync(path.join(appDir, "prisma", "migrations"), { withFileTypes: true })
      .filter((e) => e.isDirectory()).map((e) => e.name).sort();
    return dirs.at(-1) ?? null;
  } catch { return null; }
}

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

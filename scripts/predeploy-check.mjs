// Pre-build deployment safeguard — the permanent fix for Tech Debt D5.
//
// D5 (2026-07): a production build was once run under `sudo`, so `next build`
// wrote `.next` as root. Later `deploy`-user builds then failed EACCES on the
// clean phase (can't unlink root-owned files), the build silently kept serving
// a STALE `.next`, and the entire 1.2 Owner UI shipped to disk but never to
// users. This guard makes that failure mode loud and early instead of silent.
//
// It runs automatically before `npm run build` (npm `prebuild` hook) and before
// `npm run build:isolated` (`prebuild:isolated`). Three checks, fail-closed:
//   1. Never build as root / under sudo (the original cause of D5).
//   2. The target dist dir (`.next` or $NEXT_DIST_DIR) must contain no files
//      owned by another user — a plain `next build` cannot overwrite those.
//   3. The dist dir must be writable by the current user (probe write+unlink).
//
// There is intentionally no bypass flag. If it fails, fix ownership — do NOT
// re-run the build with sudo (that is exactly what created D5).
import { existsSync, lstatSync, readdirSync, writeFileSync, unlinkSync } from "node:fs";
import { join } from "node:path";

import { SOURCE_ROOTS, ALLOWED_FOREIGN_PREFIXES, findForeignOwned } from "./lib/ownership-guard.mjs";

const distDir = process.env.NEXT_DIST_DIR || ".next";
const isCI = !!process.env.CI;
const uid = typeof process.getuid === "function" ? process.getuid() : null;

function fail(message, remedy) {
  console.error(`\n[predeploy-check] ✗ ${message}`);
  if (remedy) console.error(remedy);
  console.error("");
  process.exit(1);
}

// 1. Never build as root. (CI containers legitimately run as root, so this
//    check is host-only — the D5 hazard is a human running `sudo next build`.)
if (uid === 0 && !isCI) {
  fail(
    "Refusing to build as root — production builds must run as the deploy user, never with sudo.",
    "Running `sudo next build` writes .next as root and is exactly what caused Tech Debt D5.\n" +
      "Re-run the build as the unprivileged deploy user (no sudo).",
  );
}

// 2 + 3. Only meaningful if the dist dir already exists — a fresh build has
//        nothing to overwrite.
if (existsSync(distDir)) {
  // 2. Ownership scan — find files not owned by the current user (bounded).
  const foreign = [];
  const CAP = 8;
  const walk = (dir) => {
    if (foreign.length >= CAP) return;
    let entries;
    try {
      entries = readdirSync(dir, { withFileTypes: true });
    } catch {
      return; // unreadable subtree — the probe write below will catch real issues
    }
    for (const entry of entries) {
      if (foreign.length >= CAP) return;
      const full = join(dir, entry.name);
      let st;
      try {
        st = lstatSync(full);
      } catch {
        continue;
      }
      if (uid !== null && st.uid !== uid) foreign.push(full);
      if (entry.isDirectory() && !entry.isSymbolicLink()) walk(full);
    }
  };
  walk(distDir);

  if (foreign.length > 0) {
    fail(
      `"${distDir}" contains files not owned by the current user (uid ${uid}) — ` +
        `\`next build\` cannot overwrite them, so the build would keep serving a stale bundle.`,
      `Offending paths (showing up to ${CAP}):\n` +
        foreign.map((p) => `  ${p}`).join("\n") +
        `\n\nFix ownership as an operator, then rebuild as the deploy user:\n` +
        `  sudo chown -R $(id -un):$(id -gn) ${distDir}\n` +
        `Do NOT re-run the build with sudo.`,
    );
  }

  // 3. Writability probe — create + remove a file inside the dist dir.
  const probe = join(distDir, `.predeploy-write-probe-${process.pid}`);
  try {
    writeFileSync(probe, "ok");
    unlinkSync(probe);
  } catch (err) {
    fail(
      `"${distDir}" is not writable by the current user (${err.code || err.message}).`,
      `Fix ownership/permissions, then rebuild as the deploy user (never with sudo):\n` +
        `  sudo chown -R $(id -un):$(id -gn) ${distDir}`,
    );
  }
}

// 4. Source-tree ownership guard (Tech Debt D23). The repository source roots must be owned by
//    the build (deploy) user; a root-owned path there (from an external/privileged build) blocks
//    normal `git` reset/checkout and future builds. Read-only: it scans + reports, and NEVER
//    runs chown/sudo or mutates anything. Host-only (CI containers legitimately run as root).
if (uid !== null && !isCI) {
  const entries = [];
  const CAP_SRC = 20;
  const scan = (path) => {
    if (entries.length >= CAP_SRC + 1) return;
    let st;
    try {
      st = lstatSync(path);
    } catch {
      return; // missing path (e.g. optional root file) — skip
    }
    entries.push({ path, uid: st.uid });
    if (st.isDirectory() && !st.isSymbolicLink()) {
      let kids;
      try {
        kids = readdirSync(path, { withFileTypes: true });
      } catch {
        return;
      }
      for (const k of kids) {
        if (entries.length >= CAP_SRC + 1) return;
        scan(join(path, k.name));
      }
    }
  };
  for (const root of SOURCE_ROOTS) if (existsSync(root)) scan(root);

  const foreignSrc = findForeignOwned(entries, uid, ALLOWED_FOREIGN_PREFIXES);
  if (foreignSrc.length > 0) {
    fail(
      `Repository source contains ${foreignSrc.length} path(s) not owned by the current user ` +
        `(uid ${uid}) — an external/privileged build likely created them (Tech Debt D23). This ` +
        `blocks normal git operations and future builds.`,
      `Offending paths (showing up to ${CAP_SRC}):\n` +
        foreignSrc.slice(0, CAP_SRC).map((p) => `  ${p}`).join("\n") +
        `\n\nFix ownership as an operator (NOT via this guard, which never chowns):\n` +
        `  sudo chown -R $(id -un):$(id -gn) ${foreignSrc.slice(0, 3).join(" ")}\n` +
        `Do NOT run builds/npm/prisma/git as root — that is the root cause (D5/D23).`,
    );
  }
}

console.log(`[predeploy-check] ✓ ${distDir}: safe to build as current user (uid ${uid ?? "n/a"}).`);

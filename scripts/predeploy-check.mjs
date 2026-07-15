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

console.log(`[predeploy-check] ✓ ${distDir}: safe to build as current user (uid ${uid ?? "n/a"}).`);

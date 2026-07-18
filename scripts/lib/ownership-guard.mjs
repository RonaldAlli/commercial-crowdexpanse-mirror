// Pure, read-only ownership-guard logic (Tech Debt D23). Given a list of scanned repository
// paths with their owning uid, return the ones that are NOT owned by the expected (deploy)
// user and are NOT on the intentional external/root-managed allowlist. No filesystem, no
// mutation, no `chown`, no `sudo` — safe to unit-test directly. The predeploy hook supplies
// the real filesystem scan; this module only decides what counts as an offending path.
//
// D23 (2026-07-18): an external/privileged build left root-owned paths inside the repository
// source tree, which blocked normal `git` reset/checkout. This guard makes that recur loudly
// and early (before a build) instead of surfacing as a mid-deploy permission failure.

// Repository-managed source roots that MUST be owned by the build (deploy) user. Excludes
// node_modules / .next / .git (managed/generated) and secrets (checked elsewhere).
export const SOURCE_ROOTS = [
  "app",
  "lib",
  "components",
  "prisma/migrations",
  "prisma/schema.prisma",
  "scripts",
  "tests",
];

// Intentional external/root-managed paths to EXCLUDE from the guard (prefix match). Empty
// today — there is no repository source path that is legitimately non-deploy-owned. Add a
// prefix here (with a comment) if a genuinely external-managed path is ever introduced.
export const ALLOWED_FOREIGN_PREFIXES = [];

function isAllowed(path, allowed) {
  return allowed.some((p) => path === p || path.startsWith(p.endsWith("/") ? p : `${p}/`));
}

/**
 * @param {Array<{path: string, uid: number}>} entries scanned repo paths + owning uid
 * @param {number} expectedUid the build (deploy) user's uid
 * @param {string[]} [allowed] intentional non-deploy prefixes to ignore
 * @returns {string[]} offending paths (not owned by expectedUid, not allow-listed), sorted
 */
export function findForeignOwned(entries, expectedUid, allowed = ALLOWED_FOREIGN_PREFIXES) {
  return entries
    .filter((e) => e.uid !== expectedUid)
    .filter((e) => !isAllowed(e.path, allowed))
    .map((e) => e.path)
    .sort();
}

/** @type {import('next').NextConfig} */
const nextConfig = {
  // Allow redirecting the build output dir via env (e.g. `build:isolated`) so a
  // verification build never has to touch the live `.next` — some of whose
  // nested files are root-owned on the server and can't be cleaned as `deploy`.
  distDir: process.env.NEXT_DIST_DIR || ".next",
  // D25/DE-4: allow the Deployment Engine to point the build at a generated tsconfig
  // (`tsconfig.deploy.json`) whose `include` omits the depth-mismatched `.next/types`
  // globs — so a release built into `releases/<stamp>` type-checks its OWN (correct-depth)
  // types, not the active release's via the `.next` symlink. Officially supported by Next
  // (`typescript.tsconfigPath`). Defaults to the committed tsconfig for dev/normal builds.
  typescript: {
    tsconfigPath: process.env.NEXT_TSCONFIG_PATH || "tsconfig.json",
  },
  experimental: {
    // Document uploads flow through a server action; raise the default 1MB cap.
    serverActions: {
      bodySizeLimit: "25mb",
    },
  },
};

export default nextConfig;

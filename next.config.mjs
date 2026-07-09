/** @type {import('next').NextConfig} */
const nextConfig = {
  // Allow redirecting the build output dir via env (e.g. `build:isolated`) so a
  // verification build never has to touch the live `.next` — some of whose
  // nested files are root-owned on the server and can't be cleaned as `deploy`.
  distDir: process.env.NEXT_DIST_DIR || ".next",
  experimental: {
    // Document uploads flow through a server action; raise the default 1MB cap.
    serverActions: {
      bodySizeLimit: "25mb",
    },
  },
};

export default nextConfig;

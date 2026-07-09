/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    // Document uploads flow through a server action; raise the default 1MB cap.
    serverActions: {
      bodySizeLimit: "25mb",
    },
  },
};

export default nextConfig;

import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Byte's screens are per-user and realtime, so pages render at request time.
  // Cache Components can be adopted later for the marketing pages.
  cacheComponents: false,
  // The weekly stat card reads these fonts from disk at request time.
  outputFileTracingIncludes: {
    "/api/card/week": ["./src/fonts/og/**"],
  },
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "X-Frame-Options", value: "DENY" },
        ],
      },
    ];
  },
};

export default nextConfig;

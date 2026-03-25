import type { NextConfig } from "next";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001";

const nextConfig: NextConfig = {
  output: "standalone",
  async rewrites() {
    return [
      // NOTE: /api/* requests are handled by the Route Handler in app/api/[...path]/route.ts
      // which properly forwards cookies for authentication.
      // Proxy ping endpoints (public, no cookies needed)
      {
        source: "/ping/:path*",
        destination: `${API_URL}/ping/:path*`,
      },
      // Proxy health/ready endpoints
      {
        source: "/health",
        destination: `${API_URL}/health`,
      },
      {
        source: "/ready",
        destination: `${API_URL}/ready`,
      },
      // Proxy status pages
      {
        source: "/status/:path*",
        destination: `${API_URL}/status/:path*`,
      },
      // Proxy metrics
      {
        source: "/metrics",
        destination: `${API_URL}/metrics`,
      },
    ];
  },
};

export default nextConfig;

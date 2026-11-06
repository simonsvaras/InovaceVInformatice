import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    cpus: 1,
  },
  poweredByHeader: false,
  async headers() {
    return [
      {
        source: "/platba/:path*",
        headers: [
          {
            key: "Cache-Control",
            value: "private, no-store, no-cache, must-revalidate, max-age=0",
          },
          { key: "X-Robots-Tag", value: "noindex, nofollow, noarchive" },
          { key: "Referrer-Policy", value: "no-referrer" },
        ],
      },
    ];
  },
};

export default nextConfig;

import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    cpus: 1,
  },
  poweredByHeader: false,
};

export default nextConfig;

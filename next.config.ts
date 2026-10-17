import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  poweredByHeader: false,
  devIndicators: false,
  // Avoid a reproducible Webpack persistent-cache hashing failure on Windows/Node 26.
  webpack(config, { dev }) {
    if (!dev) config.cache = false;
    return config;
  },
};

export default nextConfig;

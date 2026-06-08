import type { NextConfig } from "next";
import path from "node:path";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  transpilePackages: ["@inventorypro/shared-types", "@inventorypro/validation"],
  experimental: {
    serverActions: { bodySizeLimit: "2mb" },
  },
  typescript: { ignoreBuildErrors: false },
  eslint: { ignoreDuringBuilds: true },
  // Disable build-time static generation - use runtime SSR instead
  // (Free Vercel tier has 60s/lambda limit; static export of 17 routes exceeds it)
  productionBrowserSourceMaps: false,
  // Explicit path aliases cho Turbopack (chưa auto-read tsconfig paths ở mọi version)
  turbopack: {
    resolveAlias: {
      "@": path.resolve(__dirname, "./src"),
      "@inventorypro/shared-types": path.resolve(__dirname, "../../packages/shared-types/src"),
      "@inventorypro/validation": path.resolve(__dirname, "../../packages/validation/src"),
    },
  },
  webpack(config) {
    // Webpack fallback cho production build
    config.resolve.alias = {
      ...config.resolve.alias,
      "@": path.resolve(__dirname, "./src"),
      "@inventorypro/shared-types": path.resolve(__dirname, "../../packages/shared-types/src"),
      "@inventorypro/validation": path.resolve(__dirname, "../../packages/validation/src"),
    };
    return config;
  },
  async rewrites() {
    const apiBase = process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:5000";
    return [
      {
        source: "/api/proxy/:path*",
        destination: `${apiBase}/api/:path*`,
      },
    ];
  },
};

export default nextConfig;

import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  transpilePackages: ["@inventorypro/shared-types", "@inventorypro/validation"],
  experimental: {
    serverActions: { bodySizeLimit: "2mb" },
  },
  typescript: { ignoreBuildErrors: false },
  eslint: { ignoreDuringBuilds: true },
  productionBrowserSourceMaps: false,
  // Path aliases
  turbopack: {
    resolveAlias: {
      "@": path.resolve(__dirname, "./src"),
      "@inventorypro/shared-types": path.resolve(__dirname, "../../packages/shared-types/src"),
      "@inventorypro/validation": path.resolve(__dirname, "../../packages/validation/src"),
    },
  },
  webpack(config) {
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

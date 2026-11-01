import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  // `pnpm build` runs strict tsc first. Skip Next's duplicate checker because
  // restricted Codespaces cannot pipe `tsc --showConfig` from a child process.
  typescript: { ignoreBuildErrors: true },
  experimental: { optimizePackageImports: ["lucide-react", "recharts"] },
};

export default nextConfig;

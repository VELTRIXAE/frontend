import type { NextConfig } from "next";

/**
 * Build-time Mainnet readiness gate.
 *
 * Mainnet must never be enabled implicitly. A production build that requests
 * Mainnet (`NEXT_PUBLIC_STELLAR_NETWORK=mainnet` or `NEXT_PUBLIC_MAINNET_ENABLED=true`)
 * fails unless BOTH of the following are present:
 *   1. Verified contract IDs for every deployed contract.
 *   2. An explicit release flag (`MAINNET_RELEASE_APPROVED=true`).
 *
 * This runs at config evaluation time, so `next build` aborts before emitting
 * any artifacts when the gate is not satisfied.
 */
function assertMainnetReadiness(): void {
  const network = (process.env.NEXT_PUBLIC_STELLAR_NETWORK ?? "").toLowerCase();
  const mainnetEnabled = (process.env.NEXT_PUBLIC_MAINNET_ENABLED ?? "").toLowerCase() === "true";
  const mainnetRequested = network === "mainnet" || mainnetEnabled;

  if (!mainnetRequested) return;

  const problems: string[] = [];

  const releaseApproved = (process.env.MAINNET_RELEASE_APPROVED ?? "").toLowerCase() === "true";
  if (!releaseApproved) {
    problems.push(
      "MAINNET_RELEASE_APPROVED must be explicitly set to \"true\" to enable Mainnet.",
    );
  }

  const contractVars = [
    "NEXT_PUBLIC_CONTRACT_ESCROW",
    "NEXT_PUBLIC_CONTRACT_REPUTATION",
    "NEXT_PUBLIC_CONTRACT_REGISTRY",
  ];
  const missingContracts = contractVars.filter((key) => {
    const value = process.env[key];
    return !value || !/^C[A-Z2-7]{55}$/.test(value.trim());
  });
  if (missingContracts.length > 0) {
    problems.push(
      `Verified Mainnet contract IDs are required; missing or invalid: ${missingContracts.join(", ")}.`,
    );
  }

  if (problems.length > 0) {
    throw new Error(
      [
        "Mainnet readiness gate failed — refusing to build.",
        ...problems.map((p) => `  - ${p}`),
        "See docs/operations/mainnet-readiness.md for the release checklist.",
      ].join("\n"),
    );
  }
}

assertMainnetReadiness();

const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  // `pnpm build` runs strict tsc first. Skip Next's duplicate checker because
  // restricted Codespaces cannot pipe `tsc --showConfig` from a child process.
  typescript: { ignoreBuildErrors: true },
  experimental: { optimizePackageImports: ["lucide-react", "recharts"] },
  async headers() {
    return [{ source: "/(.*)", headers: [
      { key: "X-Content-Type-Options", value: "nosniff" },
      { key: "X-Frame-Options", value: "DENY" },
      { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
      { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=()" },
      { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
      { key: "Content-Security-Policy", value: "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; font-src 'self' data:; img-src 'self' data: https:; connect-src 'self' https:; frame-ancestors 'none'; base-uri 'self'; form-action 'self'; object-src 'none'" },
    ] }];
  },
};

export default nextConfig;
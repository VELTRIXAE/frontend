import { NextResponse } from "next/server";
import { config } from "@/lib/config";

export const dynamic = "force-dynamic";

type IntegrationStatus = {
  configured: boolean;
  ready: boolean;
};

type ConfigIssue = {
  field: string;
  message: string;
};

type MainnetGateStatus = {
  requested: boolean;
  enabled: boolean;
  releaseFlag: boolean;
  contractsVerified: boolean;
  reasons: string[];
};

function readEnvFlag(name: string): boolean {
  const raw = process.env[name];
  if (typeof raw !== "string") return false;
  const normalized = raw.trim().toLowerCase();
  return normalized === "1" || normalized === "true" || normalized === "yes" || normalized === "on";
}

function isValidUrl(value: string | undefined | null): boolean {
  if (!value) return false;
  try {
    const parsed = new URL(value);
    return parsed.protocol === "http:" || parsed.protocol === "https:";
  } catch {
    return false;
  }
}

function buildIntegrationStatus(): Record<string, IntegrationStatus> {
  const aggregatorConfigured = Boolean(config.apiUrl);
  const stellarRpcConfigured = Boolean(config.rpcUrl);
  const horizonConfigured = Boolean(config.horizonUrl);

  return {
    aggregator: {
      configured: aggregatorConfigured,
      ready: aggregatorConfigured && isValidUrl(config.apiUrl),
    },
    stellarRpc: {
      configured: stellarRpcConfigured,
      ready: stellarRpcConfigured && isValidUrl(config.rpcUrl),
    },
    horizon: {
      configured: horizonConfigured,
      ready: horizonConfigured && isValidUrl(config.horizonUrl),
    },
  };
}

function buildConfigIssues(integrations: Record<string, IntegrationStatus>): ConfigIssue[] {
  const issues: ConfigIssue[] = [];

  if (!integrations.aggregator.configured) {
    issues.push({ field: "apiUrl", message: "Aggregator API URL is not configured" });
  } else if (!integrations.aggregator.ready) {
    issues.push({ field: "apiUrl", message: "Aggregator API URL is not a valid http(s) URL" });
  }

  if (!integrations.stellarRpc.configured) {
    issues.push({ field: "rpcUrl", message: "Stellar RPC URL is not configured" });
  } else if (!integrations.stellarRpc.ready) {
    issues.push({ field: "rpcUrl", message: "Stellar RPC URL is not a valid http(s) URL" });
  }

  if (!integrations.horizon.configured) {
    issues.push({ field: "horizonUrl", message: "Horizon URL is not configured" });
  } else if (!integrations.horizon.ready) {
    issues.push({ field: "horizonUrl", message: "Horizon URL is not a valid http(s) URL" });
  }

  const network = typeof config.network === "string" ? config.network.trim().toLowerCase() : "";
  if (!network) {
    issues.push({ field: "network", message: "Network is not configured" });
  } else if (!["mainnet", "public", "testnet", "futurenet", "standalone", "local"].includes(network)) {
    issues.push({ field: "network", message: `Unrecognized network "${config.network}"` });
  }

  return issues;
}

function buildMainnetGate(network: string): MainnetGateStatus {
  const requested = network === "mainnet" || network === "public";
  const releaseFlag = readEnvFlag("MAINNET_RELEASE_ENABLED");
  const contractsVerified = readEnvFlag("MAINNET_CONTRACTS_VERIFIED");
  const reasons: string[] = [];

  if (requested) {
    if (!releaseFlag) {
      reasons.push("MAINNET_RELEASE_ENABLED is not set");
    }
    if (!contractsVerified) {
      reasons.push("MAINNET_CONTRACTS_VERIFIED is not set");
    }
  }

  return {
    requested,
    enabled: requested && releaseFlag && contractsVerified,
    releaseFlag,
    contractsVerified,
    reasons,
  };
}

export function GET() {
  const integrations = buildIntegrationStatus();
  const configIssues = buildConfigIssues(integrations);
  const network = typeof config.network === "string" ? config.network.trim().toLowerCase() : "";
  const mainnetGate = buildMainnetGate(network);

  const integrationsReady = Object.values(integrations).every((integration) => integration.ready);
  const configValid = configIssues.length === 0;
  const mainnetBlocked = mainnetGate.requested && !mainnetGate.enabled;

  const healthy = configValid && integrationsReady && !mainnetBlocked;

  const status = healthy ? "ok" : "degraded";

  return NextResponse.json(
    {
      status,
      application: "veltrixae-frontend",
      network: config.network,
      integrations,
      integrationsReady,
      config: {
        valid: configValid,
        issues: configIssues,
      },
      mainnetGate,
      timestamp: new Date().toISOString(),
    },
    {
      status: healthy ? 200 : 503,
      headers: { "cache-control": "no-store" },
    },
  );
}
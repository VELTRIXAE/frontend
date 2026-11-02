import { Networks } from "@stellar/stellar-sdk";
import { z } from "zod";

const publicConfigSchema = z.object({
  apiUrl: z.string().url().optional(),
  rpcUrl: z.string().url(),
  horizonUrl: z.string().url(),
  network: z.literal("TESTNET"),
});

export const config = publicConfigSchema.parse({
  apiUrl: process.env.NEXT_PUBLIC_VELTRIXAE_API_URL || undefined,
  rpcUrl: process.env.NEXT_PUBLIC_STELLAR_RPC_URL || "https://soroban-testnet.stellar.org",
  horizonUrl: process.env.NEXT_PUBLIC_STELLAR_HORIZON_URL || "https://horizon-testnet.stellar.org",
  network: "TESTNET",
});

export const networkPassphrase = Networks.TESTNET;

/**
 * Mainnet readiness gate.
 *
 * Mainnet is disabled by default. It can only be enabled at build time when
 * BOTH of the following are present and valid:
 *   1. An explicit release flag (`NEXT_PUBLIC_VELTRIXAE_MAINNET_RELEASE_FLAG`).
 *   2. Verified contract configuration (`NEXT_PUBLIC_VELTRIXAE_CONTRACT_ID`).
 *
 * Any partial or invalid configuration fails the build rather than silently
 * falling back to Testnet, so a misconfigured release cannot ship.
 */

const MAINNET_RELEASE_FLAG = "mainnet-release-approved";

const mainnetGateSchema = z.object({
  releaseFlag: z.literal(MAINNET_RELEASE_FLAG),
  contractId: z
    .string()
    .min(1, "Verified contract ID is required for Mainnet")
    .regex(/^C[A-Z2-7]{55}$/, "Contract ID must be a valid Stellar contract address"),
  rpcUrl: z.string().url(),
  horizonUrl: z.string().url(),
});

export type MainnetGateResult =
  | { enabled: false; reason: string }
  | { enabled: true; contractId: string; rpcUrl: string; horizonUrl: string };

function evaluateMainnetGate(): MainnetGateResult {
  const rawReleaseFlag = process.env.NEXT_PUBLIC_VELTRIXAE_MAINNET_RELEASE_FLAG;
  const rawContractId = process.env.NEXT_PUBLIC_VELTRIXAE_CONTRACT_ID;
  const rawRpcUrl = process.env.NEXT_PUBLIC_STELLAR_RPC_URL;
  const rawHorizonUrl = process.env.NEXT_PUBLIC_STELLAR_HORIZON_URL;

  const anyMainnetSignal =
    rawReleaseFlag !== undefined ||
    rawContractId !== undefined ||
    (rawRpcUrl !== undefined && rawRpcUrl.includes("mainnet")) ||
    (rawHorizonUrl !== undefined && rawHorizonUrl.includes("mainnet"));

  if (!anyMainnetSignal) {
    return { enabled: false, reason: "Mainnet not requested; defaulting to Testnet" };
  }

  const parsed = mainnetGateSchema.safeParse({
    releaseFlag: rawReleaseFlag,
    contractId: rawContractId,
    rpcUrl: rawRpcUrl,
    horizonUrl: rawHorizonUrl,
  });

  if (!parsed.success) {
    const details = parsed.error.issues
      .map((issue) => `${issue.path.join(".") || "config"}: ${issue.message}`)
      .join("; ");
    throw new Error(
      `Mainnet readiness gate failed. Mainnet cannot be enabled without an explicit release flag and verified contract configuration. ${details}`,
    );
  }

  return {
    enabled: true,
    contractId: parsed.data.contractId,
    rpcUrl: parsed.data.rpcUrl,
    horizonUrl: parsed.data.horizonUrl,
  };
}

export const mainnetGate: MainnetGateResult = evaluateMainnetGate();

export const isMainnetEnabled = mainnetGate.enabled;

/**
 * Configuration health snapshot for observability.
 *
 * Contains only non-sensitive, boolean/enum values. Never include wallet
 * secrets, signed XDR, or account data here.
 */
export interface ConfigHealth {
  network: "TESTNET" | "MAINNET";
  apiUrlConfigured: boolean;
  rpcUrlConfigured: boolean;
  horizonUrlConfigured: boolean;
  mainnetEnabled: boolean;
  mainnetGateReason: string;
  healthy: boolean;
}

export function getConfigHealth(): ConfigHealth {
  const mainnetEnabled = mainnetGate.enabled;
  const mainnetGateReason = mainnetGate.enabled
    ? "Mainnet gate satisfied"
    : mainnetGate.reason;

  const apiUrlConfigured = Boolean(config.apiUrl);
  const rpcUrlConfigured = Boolean(config.rpcUrl);
  const horizonUrlConfigured = Boolean(config.horizonUrl);

  return {
    network: mainnetEnabled ? "MAINNET" : "TESTNET",
    apiUrlConfigured,
    rpcUrlConfigured,
    horizonUrlConfigured,
    mainnetEnabled,
    mainnetGateReason,
    healthy: rpcUrlConfigured && horizonUrlConfigured,
  };
}
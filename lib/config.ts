import { Networks, StrKey } from "@stellar/stellar-sdk";
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
 * Stellar contract registry
 *
 * Provides a reviewed source of truth for all contracts used by swap and
 * liquidity actions. Each entry records the deployment ledger, source commit,
 * network passphrase and verification status so that write actions can be
 * gated on verified Testnet deployments.
 */

export const contractKindSchema = z.enum(["swap", "factory", "router", "pool"]);

export type ContractKind = z.infer<typeof contractKindSchema>;

export const verificationStatusSchema = z.enum([
  "verified",
  "unverified",
  "wrong-network",
]);

export type VerificationStatus = z.infer<typeof verificationStatusSchema>;

const contractIdSchema = z
  .string()
  .refine(
    (value) => StrKey.isValidContract(value) && value.startsWith("C") && value.length === 56,
    { message: "Invalid Stellar contract ID (expected 56-char strkey starting with 'C')" },
  );

export const contractRegistryEntrySchema = z.object({
  contractId: contractIdSchema,
  kind: contractKindSchema,
  deploymentLedger: z.number().int().nonnegative(),
  sourceCommit: z.string().min(1),
  networkPassphrase: z.string().min(1),
  verificationStatus: verificationStatusSchema,
});

export type ContractRegistryEntry = z.infer<typeof contractRegistryEntrySchema>;

export const contractRegistrySchema = z.object({
  swap: contractRegistryEntrySchema,
  factory: contractRegistryEntrySchema,
  router: contractRegistryEntrySchema,
  pools: z.array(contractRegistryEntrySchema),
});

export type ContractRegistry = z.infer<typeof contractRegistrySchema>;

const REQUIRED_KINDS: readonly ContractKind[] = ["swap", "factory", "router"];

function parseLedger(value: string | undefined, fallback: number): number {
  if (!value) return fallback;
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback;
}

function buildEntry(
  kind: ContractKind,
  contractId: string | undefined,
  deploymentLedger: string | undefined,
  sourceCommit: string | undefined,
  verificationStatus: string | undefined,
): ContractRegistryEntry {
  return contractRegistryEntrySchema.parse({
    contractId: contractId ?? "",
    kind,
    deploymentLedger: parseLedger(deploymentLedger, 0),
    sourceCommit: sourceCommit ?? "unknown",
    networkPassphrase: networkPassphrase,
    verificationStatus: verificationStatus ?? "unverified",
  });
}

function parsePoolEntries(raw: string | undefined): ContractRegistryEntry[] {
  if (!raw) return [];
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return [];
  }
  if (!Array.isArray(parsed)) return [];
  return parsed.flatMap((item) => {
    if (!item || typeof item !== "object") return [];
    const record = item as Record<string, unknown>;
    const result = contractRegistryEntrySchema.safeParse({
      contractId: record.contractId,
      kind: "pool",
      deploymentLedger: record.deploymentLedger,
      sourceCommit: record.sourceCommit,
      networkPassphrase: record.networkPassphrase ?? networkPassphrase,
      verificationStatus: record.verificationStatus ?? "unverified",
    });
    return result.success ? [result.data] : [];
  });
}

export const contractRegistry: ContractRegistry = contractRegistrySchema.parse({
  swap: buildEntry(
    "swap",
    process.env.NEXT_PUBLIC_VELTRIXAE_SWAP_CONTRACT_ID,
    process.env.NEXT_PUBLIC_VELTRIXAE_SWAP_DEPLOYMENT_LEDGER,
    process.env.NEXT_PUBLIC_VELTRIXAE_SWAP_SOURCE_COMMIT,
    process.env.NEXT_PUBLIC_VELTRIXAE_SWAP_VERIFICATION_STATUS,
  ),
  factory: buildEntry(
    "factory",
    process.env.NEXT_PUBLIC_VELTRIXAE_FACTORY_CONTRACT_ID,
    process.env.NEXT_PUBLIC_VELTRIXAE_FACTORY_DEPLOYMENT_LEDGER,
    process.env.NEXT_PUBLIC_VELTRIXAE_FACTORY_SOURCE_COMMIT,
    process.env.NEXT_PUBLIC_VELTRIXAE_FACTORY_VERIFICATION_STATUS,
  ),
  router: buildEntry(
    "router",
    process.env.NEXT_PUBLIC_VELTRIXAE_ROUTER_CONTRACT_ID,
    process.env.NEXT_PUBLIC_VELTRIXAE_ROUTER_DEPLOYMENT_LEDGER,
    process.env.NEXT_PUBLIC_VELTRIXAE_ROUTER_SOURCE_COMMIT,
    process.env.NEXT_PUBLIC_VELTRIXAE_ROUTER_VERIFICATION_STATUS,
  ),
  pools: parsePoolEntries(process.env.NEXT_PUBLIC_VELTRIXAE_POOL_CONTRACTS),
});

function isEntryVerifiedOnTestnet(entry: ContractRegistryEntry): boolean {
  return (
    entry.verificationStatus === "verified" &&
    entry.networkPassphrase === networkPassphrase &&
    StrKey.isValidContract(entry.contractId)
  );
}

/**
 * Write actions are enabled only when every required contract (swap, factory,
 * router) is verified and deployed on Testnet. Unverified or wrong-network
 * contracts disable write actions.
 */
export function isWriteEnabled(): boolean {
  return REQUIRED_KINDS.every((kind) => isEntryVerifiedOnTestnet(contractRegistry[kind]));
}

/**
 * Returns the registry entry for a given contract kind. For pools, returns the
 * first pool entry (use `contractRegistry.pools` for the full list).
 */
export function getContractMetadata(kind: ContractKind): ContractRegistryEntry | undefined {
  if (kind === "pool") {
    return contractRegistry.pools[0];
  }
  return contractRegistry[kind];
}

/**
 * Returns all registry entries (including every pool) for display in
 * transaction previews.
 */
export function getAllContractMetadata(): ContractRegistryEntry[] {
  return [
    contractRegistry.swap,
    contractRegistry.factory,
    contractRegistry.router,
    ...contractRegistry.pools,
  ];
}
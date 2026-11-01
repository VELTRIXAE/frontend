import { Networks } from "@stellar/stellar-sdk";
import { z } from "zod";

const publicConfigSchema = z.object({
  apiUrl: z.string().url().optional(),
  rpcUrl: z.string().url(),
  horizonUrl: z.string().url(),
  network: z.literal("TESTNET"),
  swapContractId: z.string().min(1).optional(),
  factoryContractId: z.string().min(1).optional(),
});

export const config = publicConfigSchema.parse({
  apiUrl: process.env.NEXT_PUBLIC_VELTRIXAE_API_URL || undefined,
  rpcUrl: process.env.NEXT_PUBLIC_STELLAR_RPC_URL || "https://soroban-testnet.stellar.org",
  horizonUrl: process.env.NEXT_PUBLIC_STELLAR_HORIZON_URL || "https://horizon-testnet.stellar.org",
  network: "TESTNET",
  swapContractId: process.env.NEXT_PUBLIC_SWAP_CONTRACT_ID || undefined,
  factoryContractId: process.env.NEXT_PUBLIC_FACTORY_CONTRACT_ID || undefined,
});

export const networkPassphrase = Networks.TESTNET;
export const isTradingConfigured = Boolean(config.apiUrl && config.swapContractId);

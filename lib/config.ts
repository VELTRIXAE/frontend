import { Networks } from "@stellar/stellar-sdk";
import { z } from "zod";

const publicConfigSchema = z.object({
  apiUrl: z.string().url().optional(),
  rpcUrl: z.string().url(),
  horizonUrl: z.string().url(),
  network: z.literal("TESTNET"),
  pricingSourceUrl: z.string().url(),
  pricingSourceApiKey: z.string().min(1).optional(),
});

export const config = publicConfigSchema.parse({
  apiUrl: process.env.NEXT_PUBLIC_VELTRIXAE_API_URL || undefined,
  rpcUrl: process.env.NEXT_PUBLIC_STELLAR_RPC_URL || "https://soroban-testnet.stellar.org",
  horizonUrl: process.env.NEXT_PUBLIC_STELLAR_HORIZON_URL || "https://horizon-testnet.stellar.org",
  network: "TESTNET",
  pricingSourceUrl:
    process.env.NEXT_PUBLIC_PRICING_SOURCE_URL || "https://api.coingecko.com/api/v3",
  pricingSourceApiKey: process.env.NEXT_PUBLIC_PRICING_SOURCE_API_KEY || undefined,
});

export const networkPassphrase = Networks.TESTNET;

export const pricingSource = {
  name: "CoinGecko",
  url: config.pricingSourceUrl,
  documentation: "https://docs.coingecko.com/reference/introduction",
} as const;

export type PricingSource = typeof pricingSource;
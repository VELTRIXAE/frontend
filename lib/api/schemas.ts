import { z } from "zod";

export const assetSchema = z.object({ code: z.string().min(1).max(32), issuer: z.string().optional(), name: z.string().optional(), decimals: z.number().int().min(0).max(18).default(7), verified: z.boolean().default(false), icon: z.string().url().optional() });
export type Asset = z.infer<typeof assetSchema>;
export const quoteRequestSchema = z.object({ sellAsset: assetSchema, buyAsset: assetSchema, amount: z.string().regex(/^\d+(\.\d+)?$/), slippageBps: z.number().int().min(1).max(500), account: z.string().optional() });
export const quoteSchema = z.object({ id: z.string(), inputAmount: z.string(), outputAmount: z.string(), rate: z.string(), minimumReceived: z.string(), priceImpactPct: z.number(), route: z.array(z.object({ protocol: z.string(), poolId: z.string().optional(), sellAsset: z.string(), buyAsset: z.string() })).min(1), expiresAt: z.string().datetime(), transactionXdr: z.string().optional() });
export type QuoteRequest = z.infer<typeof quoteRequestSchema>;
export type Quote = z.infer<typeof quoteSchema>;
export const poolSchema = z.object({ id: z.string(), assetA: assetSchema, assetB: assetSchema, reserveA: z.string(), reserveB: z.string(), feeBps: z.number().int(), contractId: z.string(), tvlUsd: z.number().nullable().optional() });
export type Pool = z.infer<typeof poolSchema>;
export const transactionBuildSchema = z.object({ xdr: z.string().min(1), simulationId: z.string().min(1), expiresAt: z.string().datetime() });

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
export const holdingSchema = z.object({ asset: assetSchema, balance: z.string(), valueUsd: z.number().nullable(), priceUsd: z.number().nullable() });
export const positionSchema = z.object({ id: z.string(), poolId: z.string(), assetA: assetSchema, assetB: assetSchema, sharePct: z.number(), valueUsd: z.number().nullable() });
export const transactionSchema = z.object({ hash: z.string(), type: z.string(), status: z.enum(["pending", "success", "failed"]), createdAt: z.string().datetime(), explorerUrl: z.string().url(), amount: z.string().optional(), asset: z.string().optional() });
export const portfolioSchema = z.object({ totalValueUsd: z.number().nullable(), holdings: z.array(holdingSchema), positions: z.array(positionSchema), transactions: z.array(transactionSchema) });
export type Portfolio = z.infer<typeof portfolioSchema>;
export const metricPointSchema = z.object({ timestamp: z.string().datetime(), value: z.number() });
export const analyticsSchema = z.object({ volume: z.array(metricPointSchema), liquidity: z.array(metricPointSchema), transactions: z.array(metricPointSchema), tokenPerformance: z.array(z.object({ asset: assetSchema, changePct: z.number().nullable(), priceUsd: z.number().nullable() })) });
export type Analytics = z.infer<typeof analyticsSchema>;

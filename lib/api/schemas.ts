import { z } from "zod";

const integerAmount = z.string().regex(/^\d+$/, "Expected an integer base-unit amount.");
const unixMilliseconds = z.number().int().nonnegative();

export const tokenSchema = z.object({
  contract: z.string().min(1),
  symbol: z.string().min(1).max(32),
  name: z.string().min(1),
  decimals: z.number().int().min(0).max(18),
  asset: z.object({ code: z.string().min(1).max(32), issuer: z.string().optional() }).optional(),
  verification: z.literal("onchain-metadata-only"),
});
export type Token = z.infer<typeof tokenSchema>;

export const quoteRequestSchema = z.object({
  tokenIn: z.string().min(1),
  tokenOut: z.string().min(1),
  amount: integerAmount,
  kind: z.enum(["exactIn", "exactOut"]).default("exactIn"),
  slippageBps: z.number().int().min(1).max(500).default(50),
  maxHops: z.number().int().min(1).max(3).default(3),
});
export type QuoteRequest = z.input<typeof quoteRequestSchema>;

export const routeSchema = z.object({
  path: z.array(z.string().min(1)).min(2),
  pools: z.array(z.string().min(1)).min(1),
  protocol: z.literal("Soroswap"),
  amountIn: integerAmount,
  amountOut: integerAmount,
  fees: z.array(z.object({ token: z.string().min(1), amount: integerAmount, feeBps: z.number().int().nonnegative() })),
  priceImpactBps: z.number().int().nonnegative(),
});

export const quoteSchema = z.object({
  network: z.literal("testnet"),
  kind: z.enum(["exactIn", "exactOut"]),
  tokenIn: z.string().min(1),
  tokenOut: z.string().min(1),
  amountIn: integerAmount,
  amountOut: integerAmount,
  minimumReceived: integerAmount,
  maximumInput: integerAmount,
  slippageBps: z.number().int().min(1).max(500),
  routes: z.array(routeSchema).min(1),
  selectedRoute: routeSchema,
  ledger: z.number().int().nonnegative(),
  observedAt: unixMilliseconds,
  expiresAt: unixMilliseconds,
  executable: z.boolean(),
  networkFee: z.null(),
});
export type Quote = z.infer<typeof quoteSchema>;

export const poolSchema = z.object({
  id: z.string().min(1), protocol: z.literal("Soroswap"), token0: z.string().min(1), token1: z.string().min(1),
  reserve0: integerAmount, reserve1: integerAmount, feeBps: z.number().int().nonnegative(), ledger: z.number().int().nonnegative(), observedAt: unixMilliseconds,
});
export type Pool = z.infer<typeof poolSchema>;
export const poolSnapshotSchema = z.object({ pools: z.array(poolSchema), ledger: z.number().int().nonnegative(), observedAt: unixMilliseconds });
export const tokensResponseSchema = z.object({ tokens: z.array(tokenSchema) });

export const preparedSwapSchema = z.object({
  transactionXdr: z.string().min(1), resourceFee: integerAmount, totalFee: integerAmount, ledger: z.number().int().nonnegative(),
  network: z.literal("testnet"), aggregator: z.string().min(1), quote: quoteSchema, requiresWalletSignature: z.literal(true), submitted: z.literal(false),
});
export type PreparedSwap = z.infer<typeof preparedSwapSchema>;

export const transactionStatusSchema = z.object({
  hash: z.string().regex(/^[a-fA-F0-9]{64}$/), network: z.literal("testnet"), status: z.enum(["SUCCESS", "FAILED", "NOT_FOUND"]), finalized: z.boolean(),
  ledger: z.number().int().nullable(), latestLedger: z.number().int(), resultXdr: z.string().nullable(), metadataXdr: z.string().nullable(), failure: z.string().nullable(),
  explorerUrl: z.string().url(), note: z.string().nullable(),
});
export type TransactionStatus = z.infer<typeof transactionStatusSchema>;

export const marketSchema = z.object({
  pool: z.string().min(1), protocol: z.literal("Soroswap"), token0: z.string().min(1), token1: z.string().min(1), feeBps: z.number().int().nonnegative(),
  spotRatio: z.object({ numerator: integerAmount, denominator: integerAmount }), ratioUnits: z.string(),
});
export type Market = z.infer<typeof marketSchema>;
export const marketsResponseSchema = z.object({ ledger: z.number().int(), observedAt: unixMilliseconds, markets: z.array(marketSchema) });

export const networkStatusSchema = z.object({ network: z.literal("testnet"), sequence: z.number().int(), closeTime: z.string(), soroswapConfigured: z.boolean(), veltrixaeConfigured: z.boolean() });
export const overviewSchema = z.object({
  network: z.literal("testnet"), ledger: z.number().int(), observedAt: unixMilliseconds, poolCount: z.number().int(), tokenCount: z.number().int(), protocols: z.array(z.string()),
  historicalVolume: z.null(), tvlUsd: z.null(), historyAvailable: z.literal(false),
});
export type Overview = z.infer<typeof overviewSchema>;

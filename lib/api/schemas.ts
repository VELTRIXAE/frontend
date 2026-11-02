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

// Shared response envelope metadata: request identifiers and cursor pagination.
export const responseMetaSchema = z.object({
  requestId: z.string().min(1).optional(),
  nextCursor: z.string().min(1).nullable().optional(),
  hasMore: z.boolean().optional(),
});
export type ResponseMeta = z.infer<typeof responseMetaSchema>;

export const poolSnapshotSchema = z.object({
  pools: z.array(poolSchema), ledger: z.number().int().nonnegative(), observedAt: unixMilliseconds,
  requestId: z.string().min(1).optional(), nextCursor: z.string().min(1).nullable().optional(), hasMore: z.boolean().optional(),
});
export type PoolSnapshot = z.infer<typeof poolSnapshotSchema>;
export const tokensResponseSchema = z.object({
  tokens: z.array(tokenSchema),
  requestId: z.string().min(1).optional(), nextCursor: z.string().min(1).nullable().optional(), hasMore: z.boolean().optional(),
});
export type TokensResponse = z.infer<typeof tokensResponseSchema>;

// Contract registry metadata surfaced with quotes and prepared transactions.
export const contractIdsSchema = z.object({
  aggregator: z.string().min(1),
  router: z.string().min(1).optional(),
  factory: z.string().min(1).optional(),
  veltrixae: z.string().min(1).optional(),
});
export type ContractIds = z.infer<typeof contractIdsSchema>;

export const preparedSwapSchema = z.object({
  transactionXdr: z.string().min(1), resourceFee: integerAmount, totalFee: integerAmount, ledger: z.number().int().nonnegative(),
  network: z.literal("testnet"), aggregator: z.string().min(1), contractIds: contractIdsSchema.optional(), quote: quoteSchema,
  requiresWalletSignature: z.literal(true), submitted: z.literal(false),
  requestId: z.string().min(1).optional(),
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
export const marketsResponseSchema = z.object({
  ledger: z.number().int(), observedAt: unixMilliseconds, markets: z.array(marketSchema),
  requestId: z.string().min(1).optional(), nextCursor: z.string().min(1).nullable().optional(), hasMore: z.boolean().optional(),
});
export type MarketsResponse = z.infer<typeof marketsResponseSchema>;

export const networkStatusSchema = z.object({ network: z.literal("testnet"), sequence: z.number().int(), closeTime: z.string(), soroswapConfigured: z.boolean(), veltrixaeConfigured: z.boolean() });
export const overviewSchema = z.object({
  network: z.literal("testnet"), ledger: z.number().int(), observedAt: unixMilliseconds, poolCount: z.number().int(), tokenCount: z.number().int(), protocols: z.array(z.string()),
  historicalVolume: z.null(), tvlUsd: z.null(), historyAvailable: z.literal(false),
  requestId: z.string().min(1).optional(),
});
export type Overview = z.infer<typeof overviewSchema>;

// Portfolio endpoint: on-chain balances only; no fabricated valuations.
export const portfolioAssetSchema = z.object({
  contract: z.string().min(1), symbol: z.string().min(1).max(32), decimals: z.number().int().min(0).max(18),
  balance: integerAmount, ledger: z.number().int().nonnegative(),
});
export type PortfolioAsset = z.infer<typeof portfolioAssetSchema>;
export const portfolioResponseSchema = z.object({
  network: z.literal("testnet"), address: z.string().min(1), ledger: z.number().int().nonnegative(), observedAt: unixMilliseconds,
  assets: z.array(portfolioAssetSchema), usdValue: z.null(), valuationAvailable: z.literal(false),
  requestId: z.string().min(1).optional(), nextCursor: z.string().min(1).nullable().optional(), hasMore: z.boolean().optional(),
});
export type PortfolioResponse = z.infer<typeof portfolioResponseSchema>;

// Analytics endpoint: historical data is only present when the backend provides it.
export const analyticsPointSchema = z.object({
  timestamp: unixMilliseconds, volumeUsd: z.number().nonnegative().nullable(), tvlUsd: z.number().nonnegative().nullable(),
});
export type AnalyticsPoint = z.infer<typeof analyticsPointSchema>;
export const analyticsResponseSchema = z.object({
  network: z.literal("testnet"), ledger: z.number().int().nonnegative(), observedAt: unixMilliseconds,
  points: z.array(analyticsPointSchema), historyAvailable: z.boolean(),
  requestId: z.string().min(1).optional(), nextCursor: z.string().min(1).nullable().optional(), hasMore: z.boolean().optional(),
});
export type AnalyticsResponse = z.infer<typeof analyticsResponseSchema>;

// Quote endpoint response envelope.
export const quoteResponseSchema = z.object({
  quote: quoteSchema, requestId: z.string().min(1).optional(),
});
export type QuoteResponse = z.infer<typeof quoteResponseSchema>;

// Submit endpoint: accepts a signed transaction XDR and returns the hash for reconciliation.
export const submitRequestSchema = z.object({ signedTransactionXdr: z.string().min(1) });
export type SubmitRequest = z.infer<typeof submitRequestSchema>;
export const submitResponseSchema = z.object({
  hash: z.string().regex(/^[a-fA-F0-9]{64}$/), network: z.literal("testnet"), status: z.enum(["PENDING", "SUCCESS", "FAILED"]),
  explorerUrl: z.string().url(), requestId: z.string().min(1).optional(),
});
export type SubmitResponse = z.infer<typeof submitResponseSchema>;

// Standard error envelope returned by every endpoint on failure.
export const errorEnvelopeSchema = z.object({
  error: z.object({
    code: z.string().min(1),
    message: z.string().min(1),
    requestId: z.string().min(1),
    retryable: z.boolean(),
    details: z.record(z.unknown()).optional(),
  }),
});
export type ErrorEnvelope = z.infer<typeof errorEnvelopeSchema>;

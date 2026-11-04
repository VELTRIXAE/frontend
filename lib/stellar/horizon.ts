import { z } from "zod";
import { config } from "@/lib/config";

const balanceSchema = z.object({
  balance: z.string(),
  asset_type: z.string(),
  asset_code: z.string().optional(),
  asset_issuer: z.string().optional(),
  buying_liabilities: z.string().optional(),
  selling_liabilities: z.string().optional(),
  limit: z.string().optional(),
});
const accountSchema = z.object({
  account_id: z.string(),
  sequence: z.string(),
  subentry_count: z.number(),
  last_modified_ledger: z.number(),
  balances: z.array(balanceSchema),
});
const transactionSchema = z.object({
  id: z.string(), hash: z.string(), ledger: z.number(), created_at: z.string(),
  source_account: z.string(), operation_count: z.number(), successful: z.boolean(),
  fee_charged: z.string(), memo_type: z.string(), memo: z.string().optional(),
});
const transactionsSchema = z.object({ _embedded: z.object({ records: z.array(transactionSchema) }) });
const rootSchema = z.object({ core_latest_ledger: z.number(), history_latest_ledger: z.number(), network_passphrase: z.string() });
const liquidityPoolSchema = z.object({
  id: z.string(),
  fee_bp: z.number(),
  type: z.string(),
  total_shares: z.string(),
  total_trustlines: z.string(),
  reserves: z.array(z.object({
    asset: z.string(),
    amount: z.string(),
  })),
  last_modified_ledger: z.number().optional(),
  last_modified_time: z.string().optional(),
});
const liquidityPoolsSchema = z.object({ _embedded: z.object({ records: z.array(liquidityPoolSchema) }) });

export type HorizonBalance = z.infer<typeof balanceSchema>;
export type HorizonTransaction = z.infer<typeof transactionSchema>;
export type HorizonLiquidityPool = z.infer<typeof liquidityPoolSchema>;
export type PoolReserve = { asset: string; amount: string };
export type PoolDetails = {
  poolId: string;
  contractId: string;
  feeBp: number;
  feePercent: number;
  totalShares: string;
  totalTrustlines: string;
  reserves: PoolReserve[];
  lastModifiedLedger?: number;
  lastModifiedTime?: string;
};
const assetRecordSchema = z.object({
  asset_type: z.string(),
  asset_code: z.string().optional(),
  asset_issuer: z.string().optional(),
  contract_id: z.string().optional(),
  num_accounts: z.number().optional(),
  amount: z.string().optional(),
  flags: z
    .object({
      auth_required: z.boolean().optional(),
      auth_revocable: z.boolean().optional(),
      auth_immutable: z.boolean().optional(),
      auth_clawback_enabled: z.boolean().optional(),
    })
    .optional(),
  toml: z.string().optional(),
});
const assetsSchema = z.object({ _embedded: z.object({ records: z.array(assetRecordSchema) }) });
const tradeRecordSchema = z.object({
  id: z.string(),
  ledger_close_time: z.string(),
  base_asset_type: z.string(),
  base_asset_code: z.string().optional(),
  base_asset_issuer: z.string().optional(),
  counter_asset_type: z.string(),
  counter_asset_code: z.string().optional(),
  counter_asset_issuer: z.string().optional(),
  base_amount: z.string(),
  counter_amount: z.string(),
  trade_type: z.string().optional(),
});
const tradesSchema = z.object({ _embedded: z.object({ records: z.array(tradeRecordSchema) }) });
const transactionStatusSchema = z.object({
  hash: z.string(),
  ledger: z.number(),
  successful: z.boolean(),
  created_at: z.string(),
});

export type HorizonAssetRecord = z.infer<typeof assetRecordSchema>;
export type HorizonTradeRecord = z.infer<typeof tradeRecordSchema>;
export type StellarAccount = z.infer<typeof accountSchema> & { transactions: HorizonTransaction[] };
export type NetworkHealth = z.infer<typeof rootSchema> & { latencyMs: number };
export type TransactionStatus = {
  hash: string;
  status: "success" | "failed";
  ledger: number;
  successful: boolean;
  createdAt: string;
  explorerUrl: string;
};

/** Explicit "we cannot supply this" result, so callers never render missing data as zero. */
export type HorizonUnavailable = {
  available: false;
  reason: "not-supported" | "not-found" | "upstream-error";
  message: string;
};
export type HorizonAvailable<T> = { available: true; data: T; indexedAt: string; latestLedger: number };
export type HorizonResult<T> = HorizonAvailable<T> | HorizonUnavailable;

export class HorizonError extends Error { constructor(message: string, public status: number) { super(message); } }
async function horizonRequest<T>(path: string, schema: z.ZodType<T>): Promise<T> {
  const response = await fetch(`${config.horizonUrl}${path}`, { headers: { accept: "application/json" }, signal: AbortSignal.timeout(10_000) });
  if (!response.ok) {
    if (response.status === 404) throw new HorizonError("This account is not funded on Stellar Testnet.", 404);
    throw new HorizonError(`Stellar Horizon request failed (${response.status}).`, response.status);
  }
  const parsed = schema.safeParse(await response.json());
  if (!parsed.success) throw new HorizonError("Stellar Horizon returned an unexpected response.", 502);
  return parsed.data;
}
export async function getStellarAccount(address: string): Promise<StellarAccount> {
  const [account, transactions] = await Promise.all([
    horizonRequest(`/accounts/${encodeURIComponent(address)}`, accountSchema),
    horizonRequest(`/accounts/${encodeURIComponent(address)}/transactions?order=desc&limit=10`, transactionsSchema),
  ]);
  return { ...account, transactions: transactions._embedded.records };
}
export async function getNetworkHealth(): Promise<NetworkHealth> {
  const start = performance.now(); const root = await horizonRequest("/", rootSchema);
  return { ...root, latencyMs: Math.round(performance.now() - start) };
}
export function assetCode(balance: HorizonBalance) { return balance.asset_type === "native" ? "XLM" : balance.asset_code ?? "Unknown"; }

export class UnverifiedContractError extends Error {
  constructor(public contractId: string) {
    super(`Contract ${contractId} is not a registry-verified Testnet pool contract.`);
  }
}

/**
 * Registry of verified Testnet liquidity pool contract addresses.
 * Only contracts present here may be targeted by add/remove liquidity calls.
 */
const VERIFIED_POOL_CONTRACTS: ReadonlySet<string> = new Set(
  (config.verifiedPoolContracts ?? []).map((id) => id.trim()),
);

export function isVerifiedPoolContract(contractId: string): boolean {
  return VERIFIED_POOL_CONTRACTS.has(contractId.trim());
}

export function assertVerifiedPoolContract(contractId: string): string {
  const normalized = contractId.trim();
  if (!isVerifiedPoolContract(normalized)) throw new UnverifiedContractError(normalized);
  return normalized;
}

export function listVerifiedPoolContracts(): string[] {
  return Array.from(VERIFIED_POOL_CONTRACTS);
}

function toPoolDetails(pool: HorizonLiquidityPool, contractId: string): PoolDetails {
  return {
    poolId: pool.id,
    contractId,
    feeBp: pool.fee_bp,
    feePercent: pool.fee_bp / 100,
    totalShares: pool.total_shares,
    totalTrustlines: pool.total_trustlines,
    reserves: pool.reserves.map((reserve) => ({ asset: reserve.asset, amount: reserve.amount })),
    lastModifiedLedger: pool.last_modified_ledger,
    lastModifiedTime: pool.last_modified_time,
  };
}

/**
 * Fetch pool details (reserves, fees, shares) for a registry-verified contract.
 * Throws UnverifiedContractError when the contract is not in the registry.
 */
export async function getPoolDetails(contractId: string): Promise<PoolDetails> {
  const verified = assertVerifiedPoolContract(contractId);
  const pools = await horizonRequest("/liquidity_pools?limit=200", liquidityPoolsSchema);
  const match = pools._embedded.records.find((pool) => pool.id === verified);
  if (!match) throw new HorizonError("This liquidity pool was not found on Stellar Testnet.", 404);
  return toPoolDetails(match, verified);
}

/**
 * Fetch reserves and share data for a verified pool, returning only the
 * fields needed for deposit/withdraw previews.
 */
export async function getPoolReservesAndShares(contractId: string): Promise<{
  reserves: PoolReserve[];
  totalShares: string;
  totalTrustlines: string;
  feeBp: number;
}> {
  const details = await getPoolDetails(contractId);
  return {
    reserves: details.reserves,
    totalShares: details.totalShares,
    totalTrustlines: details.totalTrustlines,
    feeBp: details.feeBp,
  };
}

function unavailableFromError(error: unknown): HorizonUnavailable {
  if (error instanceof HorizonError) {
    if (error.status === 404) return { available: false, reason: "not-found", message: error.message };
    return { available: false, reason: "upstream-error", message: error.message };
  }
  return { available: false, reason: "upstream-error", message: "Stellar Horizon could not be reached." };
}

async function latestLedger(): Promise<number> {
  const root = await horizonRequest("/", rootSchema);
  return root.history_latest_ledger;
}

/**
 * Search Horizon's asset index by code, issuer, or contract ID.
 * Horizon does not expose a contract-id filter, so contract matches are resolved client-side
 * from the returned records; when nothing matches we report an explicit unavailable state.
 */
export async function searchHorizonAssets(query: {
  code?: string;
  issuer?: string;
  contractId?: string;
  limit?: number;
}): Promise<HorizonResult<HorizonAssetRecord[]>> {
  const params = new URLSearchParams({ order: "desc", limit: String(Math.min(Math.max(query.limit ?? 20, 1), 200)) });
  if (query.code) params.set("asset_code", query.code);
  if (query.issuer) params.set("asset_issuer", query.issuer);
  try {
    const [assets, ledger] = await Promise.all([
      horizonRequest(`/assets?${params.toString()}`, assetsSchema),
      latestLedger(),
    ]);
    let records = assets._embedded.records;
    if (query.contractId) {
      const needle = query.contractId.toLowerCase();
      records = records.filter((record) => record.contract_id?.toLowerCase() === needle);
    }
    if (records.length === 0) {
      return { available: false, reason: "not-found", message: "No verified assets matched this search." };
    }
    return { available: true, data: records, indexedAt: new Date().toISOString(), latestLedger: ledger };
  } catch (error) {
    return unavailableFromError(error);
  }
}

/** Fetch a single asset record by code + issuer (or native XLM). */
export async function getHorizonAsset(code: string, issuer?: string): Promise<HorizonResult<HorizonAssetRecord>> {
  const params = new URLSearchParams({ asset_code: code });
  if (issuer) params.set("asset_issuer", issuer);
  try {
    const [assets, ledger] = await Promise.all([
      horizonRequest(`/assets?${params.toString()}&limit=1`, assetsSchema),
      latestLedger(),
    ]);
    const record = assets._embedded.records[0];
    if (!record) return { available: false, reason: "not-found", message: "This asset is not indexed by Horizon." };
    return { available: true, data: record, indexedAt: new Date().toISOString(), latestLedger: ledger };
  } catch (error) {
    return unavailableFromError(error);
  }
}

/** Recent trades for a pair, used for volume series. Empty history is reported as unavailable, not zero. */
export async function getHorizonTrades(
  base: { code: string; issuer?: string },
  counter: { code: string; issuer?: string },
  limit = 50,
): Promise<HorizonResult<HorizonTradeRecord[]>> {
  const params = new URLSearchParams({
    order: "desc",
    limit: String(Math.min(Math.max(limit, 1), 200)),
    base_asset_type: base.issuer ? "credit_alphanum4" : "native",
    counter_asset_type: counter.issuer ? "credit_alphanum4" : "native",
  });
  if (base.issuer) {
    params.set("base_asset_code", base.code);
    params.set("base_asset_issuer", base.issuer);
  }
  if (counter.issuer) {
    params.set("counter_asset_code", counter.code);
    params.set("counter_asset_issuer", counter.issuer);
  }
  try {
    const [trades, ledger] = await Promise.all([
      horizonRequest(`/trades?${params.toString()}`, tradesSchema),
      latestLedger(),
    ]);
    const records = trades._embedded.records;
    if (records.length === 0) {
      return { available: false, reason: "not-found", message: "No trade history is available for this pair." };
    }
    return { available: true, data: records, indexedAt: new Date().toISOString(), latestLedger: ledger };
  } catch (error) {
    return unavailableFromError(error);
  }
}

/**
 * Horizon does not expose historical liquidity-pool or token-performance series.
 * Callers must render an unavailable state rather than a zeroed chart.
 */
export function getHistoricalMetricAvailability(metric: "liquidity" | "token-performance" | "pools"): HorizonUnavailable {
  return {
    available: false,
    reason: "not-supported",
    message: `Horizon does not provide a historical ${metric} series for this network.`,
  };
}

export function explorerTransactionUrl(hash: string) {
  return `${config.explorerUrl.replace(/\/$/, "")}/tx/${encodeURIComponent(hash)}`;
}

export async function getTransactionStatus(hash: string): Promise<TransactionStatus> {
  const transaction = await horizonRequest(`/transactions/${encodeURIComponent(hash)}`, transactionStatusSchema);
  return {
    hash: transaction.hash,
    status: transaction.successful ? "success" : "failed",
    ledger: transaction.ledger,
    successful: transaction.successful,
    createdAt: transaction.created_at,
    explorerUrl: explorerTransactionUrl(transaction.hash),
  };
}

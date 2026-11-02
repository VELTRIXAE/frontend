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
export type StellarAccount = z.infer<typeof accountSchema> & { transactions: HorizonTransaction[] };
export type NetworkHealth = z.infer<typeof rootSchema> & { latencyMs: number };
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

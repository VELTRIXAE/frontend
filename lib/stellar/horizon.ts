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

export type HorizonBalance = z.infer<typeof balanceSchema>;
export type HorizonTransaction = z.infer<typeof transactionSchema>;
export type StellarAccount = z.infer<typeof accountSchema> & { transactions: HorizonTransaction[] };
export type NetworkHealth = z.infer<typeof rootSchema> & { latencyMs: number };

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

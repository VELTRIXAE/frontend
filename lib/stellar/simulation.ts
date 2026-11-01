import { rpc, TransactionBuilder } from "@stellar/stellar-sdk";
import { config, networkPassphrase } from "@/lib/config";
export async function simulateTransactionXdr(xdr: string) {
  const transaction = TransactionBuilder.fromXDR(xdr, networkPassphrase);
  const server = new rpc.Server(config.rpcUrl);
  const result = await server.simulateTransaction(transaction);
  if (rpc.Api.isSimulationError(result)) throw new Error(result.error || "Transaction simulation failed.");
  if (!rpc.Api.isSimulationSuccess(result)) throw new Error("Transaction simulation did not complete successfully.");
  return result;
}

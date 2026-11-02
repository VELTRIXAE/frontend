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

export async function submitSignedTransactionXdr(xdr: string) {
  const transaction = TransactionBuilder.fromXDR(xdr, networkPassphrase);
  const server = new rpc.Server(config.rpcUrl);
  const submitted = await server.sendTransaction(transaction);
  if (submitted.status === "ERROR") throw new Error("Stellar RPC rejected the signed transaction.");
  if (submitted.status === "TRY_AGAIN_LATER") throw new Error("Stellar RPC is busy. The transaction was not accepted; retry with a fresh quote.");
  return submitted.hash;
}

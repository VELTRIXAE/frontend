import type { HorizonTransaction } from "@/lib/stellar/horizon";
import { explorerTransactionUrl } from "@/lib/stellar/horizon";

export function getTransactionStatus(transaction: HorizonTransaction) {
  return {
    successful: transaction.successful,
    finalized: true,
    label: transaction.successful ? "Success" : "Failed",
    failureReason: transaction.successful ? null : "Transaction failed on Stellar Testnet.",
    explorerUrl: explorerTransactionUrl(transaction.hash),
  };
}

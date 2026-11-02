import { rpc, TransactionBuilder } from "@stellar/stellar-sdk";
import { config, networkPassphrase } from "@/lib/config";

export type SimulationIssueKind =
  | "insufficient_balance"
  | "missing_trustline"
  | "simulation_error"
  | "unknown";

export interface SimulationIssue {
  kind: SimulationIssueKind;
  message: string;
  actionable: string;
  asset?: string;
  required?: string;
  available?: string;
}

export interface SimulationResult {
  success: boolean;
  raw: rpc.Api.SimulateTransactionResponse;
  minResourceFee?: string;
  requiredTrustlines: string[];
  issues: SimulationIssue[];
  error?: string;
}

export interface TransactionStatusResult {
  status: "success" | "failed" | "pending" | "not_found";
  hash: string;
  ledger?: number;
  error?: string;
  issues: SimulationIssue[];
}

function extractIssuesFromError(error: string): SimulationIssue[] {
  const issues: SimulationIssue[] = [];
  const lower = error.toLowerCase();

  if (lower.includes("trustline") || lower.includes("trust line") || lower.includes("not trusted")) {
    issues.push({
      kind: "missing_trustline",
      message: error,
      actionable:
        "This account is missing a trustline for one of the pool assets. Add the trustline in your wallet before retrying.",
    });
  }

  if (
    lower.includes("insufficient") ||
    lower.includes("balance") ||
    lower.includes("underfunded") ||
    lower.includes("op_underfunded")
  ) {
    issues.push({
      kind: "insufficient_balance",
      message: error,
      actionable:
        "Your account does not hold enough of the required asset. Fund the account or reduce the deposit amount.",
    });
  }

  if (issues.length === 0) {
    issues.push({
      kind: "simulation_error",
      message: error,
      actionable: "The transaction could not be simulated. Review the amounts and try again.",
    });
  }

  return issues;
}

function extractRequiredTrustlines(result: rpc.Api.SimulateTransactionSuccessResponse): string[] {
  const trustlines = new Set<string>();
  const raw = result as unknown as Record<string, unknown>;
  const candidates = raw.requiredTrustlines ?? raw.required_trustlines;
  if (Array.isArray(candidates)) {
    for (const entry of candidates) {
      if (typeof entry === "string") trustlines.add(entry);
    }
  }
  return Array.from(trustlines);
}

export async function simulateTransactionXdr(xdr: string): Promise<SimulationResult> {
  const transaction = TransactionBuilder.fromXDR(xdr, networkPassphrase);
  const server = new rpc.Server(config.rpcUrl);
  const result = await server.simulateTransaction(transaction);

  if (rpc.Api.isSimulationError(result)) {
    const error = result.error || "Transaction simulation failed.";
    return {
      success: false,
      raw: result,
      requiredTrustlines: [],
      issues: extractIssuesFromError(error),
      error,
    };
  }

  if (!rpc.Api.isSimulationSuccess(result)) {
    const error = "Transaction simulation did not complete successfully.";
    return {
      success: false,
      raw: result,
      requiredTrustlines: [],
      issues: [
        {
          kind: "unknown",
          message: error,
          actionable: "The simulation returned an unexpected response. Retry the operation.",
        },
      ],
      error,
    };
  }

  return {
    success: true,
    raw: result,
    minResourceFee: result.minResourceFee,
    requiredTrustlines: extractRequiredTrustlines(result),
    issues: [],
  };
}

export async function submitSignedTransactionXdr(xdr: string): Promise<string> {
  const transaction = TransactionBuilder.fromXDR(xdr, networkPassphrase);
  const server = new rpc.Server(config.rpcUrl);
  const submitted = await server.sendTransaction(transaction);
  if (submitted.status === "ERROR") throw new Error("Stellar RPC rejected the signed transaction.");
  if (submitted.status === "TRY_AGAIN_LATER")
    throw new Error("Stellar RPC is busy. The transaction was not accepted; retry with a fresh quote.");
  return submitted.hash;
}

export async function reconcileTransactionStatus(
  hash: string,
  options: { attempts?: number; delayMs?: number } = {},
): Promise<TransactionStatusResult> {
  const attempts = options.attempts ?? 10;
  const delayMs = options.delayMs ?? 1500;
  const server = new rpc.Server(config.rpcUrl);

  for (let attempt = 0; attempt < attempts; attempt += 1) {
    const response = await server.getTransaction(hash);

    if (response.status === rpc.Api.GetTransactionStatus.SUCCESS) {
      return {
        status: "success",
        hash,
        ledger: response.ledger,
        issues: [],
      };
    }

    if (response.status === rpc.Api.GetTransactionStatus.FAILED) {
      const error = "Transaction failed on-chain.";
      return {
        status: "failed",
        hash,
        ledger: response.ledger,
        error,
        issues: extractIssuesFromError(error),
      };
    }

    if (attempt < attempts - 1) {
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
  }

  return {
    status: "pending",
    hash,
    issues: [],
  };
}
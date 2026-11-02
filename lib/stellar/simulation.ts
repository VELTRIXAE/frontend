import { rpc, TransactionBuilder, Horizon } from "@stellar/stellar-sdk";
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
export type SimulationFailureReason =
  | "invalid-xdr"
  | "wrong-network"
  | "simulation-error"
  | "simulation-incomplete";

export class SimulationError extends Error {
  readonly reason: SimulationFailureReason;
  readonly detail?: string;
  constructor(reason: SimulationFailureReason, message: string, detail?: string) {
    super(message);
    this.name = "SimulationError";
    this.reason = reason;
    this.detail = detail;
  }
}

export type SubmissionFailureReason =
  | "invalid-xdr"
  | "wrong-network"
  | "rejected"
  | "busy"
  | "network-error";

export class SubmissionError extends Error {
  readonly reason: SubmissionFailureReason;
  readonly hash?: string;
  readonly detail?: string;
  constructor(reason: SubmissionFailureReason, message: string, options?: { hash?: string; detail?: string }) {
    super(message);
    this.name = "SubmissionError";
    this.reason = reason;
    this.hash = options?.hash;
    this.detail = options?.detail;
  }
}

export type ReconcileStatus = "success" | "failed" | "pending" | "not_found";

export interface ReconcileResult {
  status: ReconcileStatus;
  hash: string;
  ledger?: number;
  resultXdr?: string;
  failure?: string;
  explorerUrl: string;
}

function explorerUrlFor(hash: string): string {
  const base = config.explorerUrl?.replace(/\/$/, "") || "https://stellar.expert/explorer/testnet";
  return `${base}/tx/${hash}`;
}

function parseTransaction(xdr: string) {
  let transaction;
  try {
    transaction = TransactionBuilder.fromXDR(xdr, networkPassphrase);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to parse transaction XDR.";
    const wrongNetwork = /network|passphrase/i.test(message);
    throw new SimulationError(
      wrongNetwork ? "wrong-network" : "invalid-xdr",
      wrongNetwork
        ? "Transaction was built for a different network than the configured Stellar network."
        : "Transaction XDR is invalid or malformed.",
      message,
    );
  }
  return transaction;
}

export async function simulateForSigning(xdr: string) {
  const transaction = parseTransaction(xdr);
  const server = new rpc.Server(config.rpcUrl);
  let result: Awaited<ReturnType<typeof server.simulateTransaction>>;
  try {
    result = await server.simulateTransaction(transaction);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Transaction simulation failed.";
    throw new SimulationError("simulation-error", "Transaction simulation failed.", message);
  }
  if (rpc.Api.isSimulationError(result)) {
    throw new SimulationError("simulation-error", result.error || "Transaction simulation failed.", result.error);
  }
  if (!rpc.Api.isSimulationSuccess(result)) {
    throw new SimulationError(
      "simulation-incomplete",
      "Transaction simulation did not complete successfully.",
    );
  }
  return result;
}

export async function simulateTransactionXdr(xdr: string) {
  return simulateForSigning(xdr);
}

export async function submitSignedTransactionXdr(xdr: string) {
  let transaction;
  try {
    transaction = TransactionBuilder.fromXDR(xdr, networkPassphrase);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to parse transaction XDR.";
    const wrongNetwork = /network|passphrase/i.test(message);
    throw new SubmissionError(
      wrongNetwork ? "wrong-network" : "invalid-xdr",
      wrongNetwork
        ? "Transaction was built for a different network than the configured Stellar network."
        : "Transaction XDR is invalid or malformed.",
      { detail: message },
    );
  }
  const server = new rpc.Server(config.rpcUrl);
  let submitted: Awaited<ReturnType<typeof server.sendTransaction>>;
  try {
    submitted = await server.sendTransaction(transaction);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Stellar RPC submission failed.";
    throw new SubmissionError("network-error", "Stellar RPC submission failed.", { detail: message });
  }
  if (submitted.status === "ERROR") {
    throw new SubmissionError("rejected", "Stellar RPC rejected the signed transaction.", {
      hash: submitted.hash,
      detail: submitted.errorResult ? JSON.stringify(submitted.errorResult) : undefined,
    });
  }
  if (submitted.status === "TRY_AGAIN_LATER") {
    throw new SubmissionError(
      "busy",
      "Stellar RPC is busy. The transaction was not accepted; retry with a fresh quote.",
      { hash: submitted.hash },
    );
  }
  return submitted.hash;
}

export async function reconcileTransaction(
  hash: string,
  options?: { attempts?: number; intervalMs?: number },
): Promise<ReconcileResult> {
  const attempts = options?.attempts ?? 10;
  const intervalMs = options?.intervalMs ?? 1500;
  const server = new rpc.Server(config.rpcUrl);
  const explorerUrl = explorerUrlFor(hash);

  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      const response = await server.getTransaction(hash);
      if (response.status === rpc.Api.GetTransactionStatus.SUCCESS) {
        return {
          status: "success",
          hash,
          ledger: response.ledger,
          resultXdr: response.resultXdr?.toXDR("base64"),
          explorerUrl,
        };
      }
      if (response.status === rpc.Api.GetTransactionStatus.FAILED) {
        return {
          status: "failed",
          hash,
          ledger: response.ledger,
          resultXdr: response.resultXdr?.toXDR("base64"),
          failure: "Transaction failed on-chain.",
          explorerUrl,
        };
      }
      if (response.status === rpc.Api.GetTransactionStatus.NOT_FOUND) {
        // Fall through to Horizon as a secondary source before retrying.
        const horizonResult = await reconcileViaHorizon(hash, explorerUrl);
        if (horizonResult) return horizonResult;
      }
    } catch {
      // Ignore transient RPC errors and retry.
    }

    if (attempt < attempts - 1) {
      await new Promise((resolve) => setTimeout(resolve, intervalMs));
    }
  }

  return { status: "pending", hash, explorerUrl };
}

async function reconcileViaHorizon(hash: string, explorerUrl: string): Promise<ReconcileResult | null> {
  if (!config.horizonUrl) return null;
  try {
    const horizon = new Horizon.Server(config.horizonUrl);
    const tx = await horizon.transactions().transaction(hash).call();
    const successful = tx.successful === true;
    return {
      status: successful ? "success" : "failed",
      hash,
      ledger: typeof tx.ledger === "number" ? tx.ledger : Number(tx.ledger) || undefined,
      resultXdr: tx.result_xdr,
      failure: successful ? undefined : "Transaction failed on-chain.",
      explorerUrl,
    };
  } catch {
    return null;
  }
}
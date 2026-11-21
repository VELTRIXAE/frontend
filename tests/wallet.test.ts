import { describe, expect, it, vi } from "vitest";
import { getWalletAdapters, mapWalletError, shortenAddress } from "@/lib/stellar/wallet";

describe("wallet helpers", () => {
  it("shortens public addresses without changing endpoints", () => {
    expect(shortenAddress("GABCDEFGHIJKLMNOPQRSTUVWXYZ123456789", 5)).toBe("GABCD…56789");
  });

  it("maps provider failures to accessible messages", () => {
    expect(mapWalletError(new Error("User rejected the request"))).toMatch(/cancel/i);
    expect(mapWalletError(new Error("Wallet not installed"))).toMatch(/not installed|available/i);
  });

  it("exposes provider-neutral adapters without secret-key methods", () => {
    for (const adapter of getWalletAdapters()) {
      const keys = Object.keys(adapter).join(" ").toLowerCase();
      expect(keys).not.toMatch(/private|secret|seed|mnemonic|recovery/);
      expect(adapter.signTransaction).toBeTypeOf("function");
    }
  });
});

// NOTE: The following are MOCKED regression tests for the signing/submission
// flow boundaries. They are NOT live evidence of real Freighter Testnet
// signing or finality (see issue #59). Live evidence must be recorded
// separately with reproducible steps and actual results.
describe("signing/submission flow boundaries (mocked, not live evidence)", () => {
  type FlowDeps = {
    simulate: (envelopeXdr: string) => Promise<{ ok: boolean; error?: string }>;
    signTransaction: (envelopeXdr: string) => Promise<{ signedXdr: string }>;
    submitDirectRpc: (signedXdr: string) => Promise<{ hash: string }>;
    pollStatus: (hash: string) => Promise<"SUCCESS" | "FAILED" | "PENDING">;
  };

  async function runFlow(
    deps: FlowDeps,
    envelopeXdr: string,
  ): Promise<{ status: "SUCCESS" | "FAILED" | "PENDING"; hash?: string }> {
    const sim = await deps.simulate(envelopeXdr);
    if (!sim.ok) {
      return { status: "FAILED" };
    }
    const { signedXdr } = await deps.signTransaction(envelopeXdr);
    const { hash } = await deps.submitDirectRpc(signedXdr);
    const status = await deps.pollStatus(hash);
    return { status, hash };
  }

  it("calls signTransaction only after a successful simulation", async () => {
    const simulate = vi.fn(async () => ({ ok: true }));
    const signTransaction = vi.fn(async () => ({ signedXdr: "signed-envelope" }));
    const submitDirectRpc = vi.fn(async () => ({ hash: "abc123" }));
    const pollStatus = vi.fn(async () => "SUCCESS" as const);

    await runFlow({ simulate, signTransaction, submitDirectRpc, pollStatus }, "unsigned-envelope");

    expect(simulate).toHaveBeenCalledTimes(1);
    expect(signTransaction).toHaveBeenCalledTimes(1);
    // Simulation must complete before signing is invoked.
    expect(simulate.mock.invocationCallOrder[0]).toBeLessThan(
      signTransaction.mock.invocationCallOrder[0],
    );
  });

  it("does not sign or submit when simulation fails", async () => {
    const simulate = vi.fn(async () => ({ ok: false, error: "simulation failed" }));
    const signTransaction = vi.fn(async () => ({ signedXdr: "signed-envelope" }));
    const submitDirectRpc = vi.fn(async () => ({ hash: "abc123" }));
    const pollStatus = vi.fn(async () => "SUCCESS" as const);

    const result = await runFlow(
      { simulate, signTransaction, submitDirectRpc, pollStatus },
      "unsigned-envelope",
    );

    expect(result.status).toBe("FAILED");
    expect(signTransaction).not.toHaveBeenCalled();
    expect(submitDirectRpc).not.toHaveBeenCalled();
    expect(pollStatus).not.toHaveBeenCalled();
  });

  it("submits the signed envelope via direct RPC", async () => {
    const simulate = vi.fn(async () => ({ ok: true }));
    const signTransaction = vi.fn(async () => ({ signedXdr: "signed-envelope" }));
    const submitDirectRpc = vi.fn(async () => ({ hash: "abc123" }));
    const pollStatus = vi.fn(async () => "SUCCESS" as const);

    await runFlow({ simulate, signTransaction, submitDirectRpc, pollStatus }, "unsigned-envelope");

    expect(submitDirectRpc).toHaveBeenCalledTimes(1);
    expect(submitDirectRpc).toHaveBeenCalledWith("signed-envelope");
    // Submission must happen after signing.
    expect(signTransaction.mock.invocationCallOrder[0]).toBeLessThan(
      submitDirectRpc.mock.invocationCallOrder[0],
    );
  });

  it("reports SUCCESS when status polling confirms finality", async () => {
    const simulate = vi.fn(async () => ({ ok: true }));
    const signTransaction = vi.fn(async () => ({ signedXdr: "signed-envelope" }));
    const submitDirectRpc = vi.fn(async () => ({ hash: "abc123" }));
    const pollStatus = vi.fn(async () => "SUCCESS" as const);

    const result = await runFlow(
      { simulate, signTransaction, submitDirectRpc, pollStatus },
      "unsigned-envelope",
    );

    expect(pollStatus).toHaveBeenCalledWith("abc123");
    expect(result).toEqual({ status: "SUCCESS", hash: "abc123" });
  });

  it("reports FAILED when status polling reports failure", async () => {
    const simulate = vi.fn(async () => ({ ok: true }));
    const signTransaction = vi.fn(async () => ({ signedXdr: "signed-envelope" }));
    const submitDirectRpc = vi.fn(async () => ({ hash: "abc123" }));
    const pollStatus = vi.fn(async () => "FAILED" as const);

    const result = await runFlow(
      { simulate, signTransaction, submitDirectRpc, pollStatus },
      "unsigned-envelope",
    );

    expect(result).toEqual({ status: "FAILED", hash: "abc123" });
  });

  it("reports PENDING when status polling has not reached finality", async () => {
    const simulate = vi.fn(async () => ({ ok: true }));
    const signTransaction = vi.fn(async () => ({ signedXdr: "signed-envelope" }));
    const submitDirectRpc = vi.fn(async () => ({ hash: "abc123" }));
    const pollStatus = vi.fn(async () => "PENDING" as const);

    const result = await runFlow(
      { simulate, signTransaction, submitDirectRpc, pollStatus },
      "unsigned-envelope",
    );

    expect(result).toEqual({ status: "PENDING", hash: "abc123" });
  });
});
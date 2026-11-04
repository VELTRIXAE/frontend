import { describe, expect, it } from "vitest";
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

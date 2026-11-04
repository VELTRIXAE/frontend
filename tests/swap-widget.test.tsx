import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("swap security boundaries", () => {
  const source = readFileSync("components/swap/swap-widget.tsx", "utf8");

  it("requires independent simulation before wallet signing", () => {
    expect(source.indexOf("simulateTransactionXdr")).toBeLessThan(source.indexOf("wallet.signTransaction"));
  });

  it("keeps explorer links on Stellar Testnet", () => {
    expect(source).toContain("stellar.expert/explorer/testnet");
  });

  it("does not request private keys or recovery phrases", () => {
    expect(source.toLowerCase()).not.toContain("private key");
    expect(source.toLowerCase()).not.toContain("recovery phrase");
  });
});

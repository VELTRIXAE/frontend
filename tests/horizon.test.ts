import { afterEach, describe, expect, it, vi } from "vitest";
import { assetCode, getNetworkHealth, getStellarAccount, getTransactionStatus } from "@/lib/stellar/horizon";

const jsonResponse = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

describe("validated Horizon Testnet client", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("combines account balances with recent transactions", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(jsonResponse({ account_id: "GTEST", sequence: "1", subentry_count: 1, last_modified_ledger: 99, balances: [{ balance: "42.0000000", asset_type: "native" }] }))
      .mockResolvedValueOnce(jsonResponse({ _embedded: { records: [{ id: "1", hash: "abc", ledger: 99, created_at: "2026-11-01T00:00:00Z", source_account: "GTEST", operation_count: 1, successful: true, fee_charged: "100", memo_type: "none" }] } }));
    vi.stubGlobal("fetch", fetchMock);
    const account = await getStellarAccount("GTEST");
    expect(account.transactions[0].hash).toBe("abc");
    expect(assetCode(account.balances[0])).toBe("XLM");
  });

  it("validates network health responses", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse({ core_latest_ledger: 100, history_latest_ledger: 100, network_passphrase: "Test SDF Network ; September 2015" })));
    expect((await getNetworkHealth()).core_latest_ledger).toBe(100);
  });

  it("returns a Testnet explorer link for a finalized transaction", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse({ hash: "abc123", ledger: 100, created_at: "2026-11-01T00:00:00Z", successful: true })));
    const status = await getTransactionStatus("abc123");
    expect(status.hash).toBe("abc123");
    expect(status.explorerUrl).toContain("/testnet/tx/abc123");
  });
});

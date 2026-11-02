import { describe, expect, it, vi, beforeEach } from "vitest";
import { shortenAddress } from "@/lib/stellar/wallet";
import {
  createFreighterAdapter,
  createAlbedoAdapter,
  createWalletAdapter,
  mapWalletError,
  type WalletAdapter,
  type WalletSnapshot,
} from "@/lib/stellar/wallet";

describe("wallet helpers", () => {
  it("shortens public addresses without changing endpoints", () => {
    expect(shortenAddress("GABCDEFGHIJKLMNOPQRSTUVWXYZ123456789", 5)).toBe(
      "GABCD…56789"
    );
  });
});

const PUBLIC_KEY = "GABCDEFGHIJKLMNOPQRSTUVWXYZ123456789";
const OTHER_KEY = "GZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZ";

describe("provider-neutral wallet adapter", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  describe("Freighter adapter", () => {
    it("connects and exposes the public address", async () => {
      const adapter = createFreighterAdapter({
        isConnected: vi.fn().mockResolvedValue(true),
        getPublicKey: vi.fn().mockResolvedValue(PUBLIC_KEY),
        getNetwork: vi.fn().mockResolvedValue("PUBLIC"),
        signTransaction: vi.fn().mockResolvedValue("signed-xdr"),
      });

      const snapshot = await adapter.connect();

      expect(snapshot.connected).toBe(true);
      expect(snapshot.address).toBe(PUBLIC_KEY);
      expect(snapshot.network).toBe("PUBLIC");
    });

    it("signs a transaction through the provider", async () => {
      const signTransaction = vi.fn().mockResolvedValue("signed-xdr");
      const adapter = createFreighterAdapter({
        isConnected: vi.fn().mockResolvedValue(true),
        getPublicKey: vi.fn().mockResolvedValue(PUBLIC_KEY),
        getNetwork: vi.fn().mockResolvedValue("TESTNET"),
        signTransaction,
      });

      const result = await adapter.signTransaction("unsigned-xdr", {
        network: "TESTNET",
      });

      expect(result).toBe("signed-xdr");
      expect(signTransaction).toHaveBeenCalledWith("unsigned-xdr", {
        network: "TESTNET",
      });
    });

    it("reports availability when the extension is missing", async () => {
      const adapter = createFreighterAdapter(undefined);

      const availability = await adapter.isAvailable();

      expect(availability.available).toBe(false);
      expect(availability.reason).toBeTruthy();
    });
  });

  describe("additional adapter (Albedo)", () => {
    it("connects and signs a transaction", async () => {
      const signTransaction = vi.fn().mockResolvedValue("albedo-signed-xdr");
      const adapter = createAlbedoAdapter({
        publicKey: vi.fn().mockResolvedValue(PUBLIC_KEY),
        network: vi.fn().mockResolvedValue("PUBLIC"),
        signTransaction,
      });

      const snapshot = await adapter.connect();
      expect(snapshot.connected).toBe(true);
      expect(snapshot.address).toBe(PUBLIC_KEY);

      const signed = await adapter.signTransaction("unsigned-xdr", {
        network: "PUBLIC",
      });
      expect(signed).toBe("albedo-signed-xdr");
      expect(signTransaction).toHaveBeenCalledTimes(1);
    });

    it("is available when the provider is present", async () => {
      const adapter = createAlbedoAdapter({
        publicKey: vi.fn().mockResolvedValue(PUBLIC_KEY),
        network: vi.fn().mockResolvedValue("PUBLIC"),
        signTransaction: vi.fn().mockResolvedValue("signed"),
      });

      const availability = await adapter.isAvailable();
      expect(availability.available).toBe(true);
    });
  });

  describe("account and network change events", () => {
    it("updates the snapshot when the account changes", async () => {
      const adapter = createWalletAdapter({
        id: "freighter",
        name: "Freighter",
        getPublicKey: vi.fn().mockResolvedValue(PUBLIC_KEY),
        getNetwork: vi.fn().mockResolvedValue("PUBLIC"),
        signTransaction: vi.fn().mockResolvedValue("signed"),
      });

      const snapshots: WalletSnapshot[] = [];
      adapter.subscribe((snapshot) => snapshots.push(snapshot));

      await adapter.connect();
      adapter.emitAccountChange(OTHER_KEY);

      const latest = snapshots[snapshots.length - 1];
      expect(latest.address).toBe(OTHER_KEY);
      expect(latest.connected).toBe(true);
    });

    it("updates the snapshot when the network changes", async () => {
      const adapter = createWalletAdapter({
        id: "freighter",
        name: "Freighter",
        getPublicKey: vi.fn().mockResolvedValue(PUBLIC_KEY),
        getNetwork: vi.fn().mockResolvedValue("PUBLIC"),
        signTransaction: vi.fn().mockResolvedValue("signed"),
      });

      const snapshots: WalletSnapshot[] = [];
      adapter.subscribe((snapshot) => snapshots.push(snapshot));

      await adapter.connect();
      adapter.emitNetworkChange("TESTNET");

      const latest = snapshots[snapshots.length - 1];
      expect(latest.network).toBe("TESTNET");
      expect(latest.address).toBe(PUBLIC_KEY);
    });

    it("marks the snapshot disconnected on account removal", async () => {
      const adapter = createWalletAdapter({
        id: "freighter",
        name: "Freighter",
        getPublicKey: vi.fn().mockResolvedValue(PUBLIC_KEY),
        getNetwork: vi.fn().mockResolvedValue("PUBLIC"),
        signTransaction: vi.fn().mockResolvedValue("signed"),
      });

      const snapshots: WalletSnapshot[] = [];
      adapter.subscribe((snapshot) => snapshots.push(snapshot));

      await adapter.connect();
      adapter.emitAccountChange(null);

      const latest = snapshots[snapshots.length - 1];
      expect(latest.connected).toBe(false);
      expect(latest.address).toBeNull();
    });
  });

  describe("provider-specific error mapping", () => {
    it("maps a user rejection to an accessible message", () => {
      const mapped = mapWalletError({ code: "USER_DECLINED", message: "nope" });

      expect(mapped.code).toBe("USER_REJECTED");
      expect(mapped.message).toMatch(/declined|cancel/i);
      expect(mapped.accessible).toBe(true);
    });

    it("maps a missing wallet to an accessible message", () => {
      const mapped = mapWalletError({ code: "NOT_INSTALLED" });

      expect(mapped.code).toBe("WALLET_UNAVAILABLE");
      expect(mapped.message).toMatch(/install|available/i);
      expect(mapped.accessible).toBe(true);
    });

    it("maps an unknown provider error to a generic accessible message", () => {
      const mapped = mapWalletError(new Error("boom"));

      expect(mapped.code).toBe("UNKNOWN");
      expect(mapped.message).toBeTruthy();
      expect(mapped.accessible).toBe(true);
    });

    it("surfaces mapped errors from connect failures", async () => {
      const adapter = createWalletAdapter({
        id: "freighter",
        name: "Freighter",
        getPublicKey: vi
          .fn()
          .mockRejectedValue({ code: "USER_DECLINED", message: "declined" }),
        getNetwork: vi.fn().mockResolvedValue("PUBLIC"),
        signTransaction: vi.fn().mockResolvedValue("signed"),
      });

      await expect(adapter.connect()).rejects.toMatchObject({
        code: "USER_REJECTED",
        accessible: true,
      });
    });
  });

  describe("secret handling", () => {
    it("never requests or stores private keys or recovery phrases", async () => {
      const getPublicKey = vi.fn().mockResolvedValue(PUBLIC_KEY);
      const getNetwork = vi.fn().mockResolvedValue("PUBLIC");
      const signTransaction = vi.fn().mockResolvedValue("signed");

      const adapter: WalletAdapter = createWalletAdapter({
        id: "freighter",
        name: "Freighter",
        getPublicKey,
        getNetwork,
        signTransaction,
      });

      await adapter.connect();
      await adapter.signTransaction("unsigned-xdr", { network: "PUBLIC" });

      const allCalls = [
        ...getPublicKey.mock.calls,
        ...getNetwork.mock.calls,
        ...signTransaction.mock.calls,
      ].flat();

      for (const arg of allCalls) {
        const serialized = JSON.stringify(arg ?? null).toLowerCase();
        expect(serialized).not.toContain("privatekey");
        expect(serialized).not.toContain("private_key");
        expect(serialized).not.toContain("secret");
        expect(serialized).not.toContain("mnemonic");
        expect(serialized).not.toContain("recovery");
        expect(serialized).not.toContain("seed");
      }

      const snapshot = adapter.getSnapshot();
      const snapshotKeys = Object.keys(snapshot).map((k) => k.toLowerCase());
      expect(snapshotKeys).not.toContain("privatekey");
      expect(snapshotKeys).not.toContain("secret");
      expect(snapshotKeys).not.toContain("mnemonic");
      expect(snapshotKeys).not.toContain("recoveryphrase");
    });
  });
});
import { networkPassphrase } from "@/lib/config";

export type WalletSnapshot = { status: "disconnected" | "connecting" | "connected" | "unsupported" | "error"; address: string | null; network: string | null; correctNetwork: boolean; error?: string };

export type WalletAccountChange = { address: string | null; network: string | null; correctNetwork: boolean };
export type WalletUnsubscribe = () => void;

/**
 * Provider-neutral Stellar wallet interface. Adapters must never request or store
 * private keys or recovery phrases; all signing is delegated to the wallet extension.
 */
export interface StellarWalletAdapter {
  id: string;
  name: string;
  isAvailable(): Promise<boolean>;
  connect(): Promise<WalletSnapshot>;
  getAddress(): Promise<string | null>;
  getNetwork(): Promise<{ network: string | null; correctNetwork: boolean }>;
  signTransaction(xdr: string): Promise<string>;
  /** Subscribe to account/network changes without a page reload. Returns an unsubscribe fn. */
  subscribe(listener: (change: WalletAccountChange) => void): WalletUnsubscribe;
}

const errorMessage = (error: unknown) => error instanceof Error ? error.message : "Wallet request failed.";

/** Map provider-specific failures to accessible, user-facing messages. */
export function mapWalletError(error: unknown, walletName = "Wallet"): string {
  const raw = errorMessage(error);
  const lower = raw.toLowerCase();
  if (lower.includes("denied") || lower.includes("reject") || lower.includes("cancel")) return `${walletName} request was cancelled. Please try again.`;
  if (lower.includes("not installed") || lower.includes("not available") || lower.includes("not found")) return `${walletName} is not installed or available.`;
  if (lower.includes("network") || lower.includes("passphrase")) return `${walletName} is on the wrong network. Switch to Testnet and retry.`;
  if (lower.includes("locked")) return `${walletName} is locked. Unlock it and try again.`;
  return `${walletName} request failed. ${raw}`;
}

const disconnected = (): WalletSnapshot => ({ status: "disconnected", address: null, network: null, correctNetwork: false });

const freighterAdapter: StellarWalletAdapter = {
  id: "freighter",
  name: "Freighter",
  async isAvailable() {
    try {
      const wallet = await import("@stellar/freighter-api");
      const available = await wallet.isConnected();
      return Boolean(available.isConnected);
    } catch { return false; }
  },
  async connect() {
    try {
      const wallet = await import("@stellar/freighter-api");
      const available = await wallet.isConnected();
      if (!available.isConnected) return { status: "unsupported", address: null, network: null, correctNetwork: false, error: "Freighter is not installed or available." };
      const access = await wallet.requestAccess();
      if (access.error || !access.address) throw new Error(access.error?.message || "Wallet access was not granted.");
      const network = await wallet.getNetworkDetails();
      return { status: "connected", address: access.address, network: network.network, correctNetwork: network.networkPassphrase === networkPassphrase };
    } catch (error) { return { status: "error", address: null, network: null, correctNetwork: false, error: mapWalletError(error, "Freighter") }; }
  },
  async getAddress() {
    try {
      const wallet = await import("@stellar/freighter-api");
      const account = await wallet.getAddress();
      return account.error || !account.address ? null : account.address;
    } catch { return null; }
  },
  async getNetwork() {
    try {
      const wallet = await import("@stellar/freighter-api");
      const network = await wallet.getNetworkDetails();
      if (network.error) return { network: null, correctNetwork: false };
      return { network: network.network, correctNetwork: network.networkPassphrase === networkPassphrase };
    } catch { return { network: null, correctNetwork: false }; }
  },
  async signTransaction(xdr: string) {
    try {
      const wallet = await import("@stellar/freighter-api");
      const result = await wallet.signTransaction(xdr, { networkPassphrase });
      if (result.error || !result.signedTxXdr) throw new Error(result.error?.message || "Transaction was not signed.");
      return result.signedTxXdr;
    } catch (error) { throw new Error(mapWalletError(error, "Freighter")); }
  },
  subscribe(listener) {
    if (typeof window === "undefined") return () => {};
    const handler = async () => {
      const [address, network] = await Promise.all([freighterAdapter.getAddress(), freighterAdapter.getNetwork()]);
      listener({ address, network: network.network, correctNetwork: network.correctNetwork });
    };
    window.addEventListener("focus", handler);
    return () => window.removeEventListener("focus", handler);
  },
};

const xbullAdapter: StellarWalletAdapter = {
  id: "xbull",
  name: "xBull",
  async isAvailable() {
    try {
      const kit = await import("@creit.tech/stellar-wallets-kit");
      const wallets = kit.StellarWalletsKit?.getSupportedWallets?.() ?? [];
      return wallets.some((w: { id: string }) => w.id === "xbull");
    } catch { return false; }
  },
  async connect() {
    try {
      const kit = await import("@creit.tech/stellar-wallets-kit");
      kit.StellarWalletsKit.init({ network: "TESTNET" });
      kit.StellarWalletsKit.setWallet("xbull");
      const { address } = await kit.StellarWalletsKit.getAddress();
      if (!address) throw new Error("Wallet access was not granted.");
      const network = await xbullAdapter.getNetwork();
      return { status: "connected", address, network: network.network, correctNetwork: network.correctNetwork };
    } catch (error) { return { status: "error", address: null, network: null, correctNetwork: false, error: mapWalletError(error, "xBull") }; }
  },
  async getAddress() {
    try {
      const kit = await import("@creit.tech/stellar-wallets-kit");
      const { address } = await kit.StellarWalletsKit.getAddress();
      return address || null;
    } catch { return null; }
  },
  async getNetwork() {
    try {
      const kit = await import("@creit.tech/stellar-wallets-kit");
      const network = await kit.StellarWalletsKit.getNetwork();
      return { network: network.network, correctNetwork: network.networkPassphrase === networkPassphrase };
    } catch { return { network: null, correctNetwork: false }; }
  },
  async signTransaction(xdr: string) {
    try {
      const kit = await import("@creit.tech/stellar-wallets-kit");
      const { signedTxXdr } = await kit.StellarWalletsKit.signTransaction(xdr, { networkPassphrase });
      if (!signedTxXdr) throw new Error("Transaction was not signed.");
      return signedTxXdr;
    } catch (error) { throw new Error(mapWalletError(error, "xBull")); }
  },
  subscribe(listener) {
    if (typeof window === "undefined") return () => {};
    const handler = async () => {
      const [address, network] = await Promise.all([xbullAdapter.getAddress(), xbullAdapter.getNetwork()]);
      listener({ address, network: network.network, correctNetwork: network.correctNetwork });
    };
    window.addEventListener("focus", handler);
    return () => window.removeEventListener("focus", handler);
  },
};

const adapters: Record<string, StellarWalletAdapter> = {
  freighter: freighterAdapter,
  xbull: xbullAdapter,
};

export function getAdapter(id: string): StellarWalletAdapter | null { return adapters[id] ?? null; }

export async function availableWallets(): Promise<StellarWalletAdapter[]> {
  const results = await Promise.all(Object.values(adapters).map(async (adapter) => ({ adapter, ok: await adapter.isAvailable() })));
  return results.filter((r) => r.ok).map((r) => r.adapter);
}

export async function signWithWallet(adapterId: string, xdr: string): Promise<string> {
  const adapter = getAdapter(adapterId);
  if (!adapter) throw new Error("Selected wallet is not supported.");
  return adapter.signTransaction(xdr);
}

// Backwards-compatible Freighter helpers.
export async function readFreighterWallet(): Promise<WalletSnapshot> {
  try {
    const wallet = await import("@stellar/freighter-api");
    const [available, allowed] = await Promise.all([wallet.isConnected(), wallet.isAllowed()]);
    if (!available.isConnected || !allowed.isAllowed) return disconnected();
    const [account, network] = await Promise.all([wallet.getAddress(), wallet.getNetworkDetails()]);
    if (account.error || network.error || !account.address) return disconnected();
    return { status: "connected", address: account.address, network: network.network, correctNetwork: network.networkPassphrase === networkPassphrase };
  } catch { return disconnected(); }
}
export async function connectFreighter(): Promise<WalletSnapshot> { return freighterAdapter.connect(); }
export async function signWithFreighter(xdr: string) { return freighterAdapter.signTransaction(xdr); }
export function shortenAddress(address: string, size = 5) { return `${address.slice(0, size)}…${address.slice(-size)}`; }

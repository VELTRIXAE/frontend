import { networkPassphrase } from "@/lib/config";

export type WalletSnapshot = { status: "disconnected" | "connecting" | "connected" | "unsupported" | "error"; address: string | null; network: string | null; correctNetwork: boolean; error?: string };
const errorMessage = (error: unknown) => error instanceof Error ? error.message : "Wallet request failed.";
export async function readFreighterWallet(): Promise<WalletSnapshot> {
  try {
    const wallet = await import("@stellar/freighter-api");
    const [available, allowed] = await Promise.all([wallet.isConnected(), wallet.isAllowed()]);
    if (!available.isConnected || !allowed.isAllowed) return { status: "disconnected", address: null, network: null, correctNetwork: false };
    const [account, network] = await Promise.all([wallet.getAddress(), wallet.getNetworkDetails()]);
    if (account.error || network.error || !account.address) return { status: "disconnected", address: null, network: null, correctNetwork: false };
    return { status: "connected", address: account.address, network: network.network, correctNetwork: network.networkPassphrase === networkPassphrase };
  } catch { return { status: "disconnected", address: null, network: null, correctNetwork: false }; }
}
export async function connectFreighter(): Promise<WalletSnapshot> {
  try {
    const wallet = await import("@stellar/freighter-api");
    const available = await wallet.isConnected();
    if (!available.isConnected) return { status: "unsupported", address: null, network: null, correctNetwork: false, error: "Freighter is not installed or available." };
    const access = await wallet.requestAccess();
    if (access.error || !access.address) throw new Error(access.error?.message || "Wallet access was not granted.");
    const network = await wallet.getNetworkDetails();
    return { status: "connected", address: access.address, network: network.network, correctNetwork: network.networkPassphrase === networkPassphrase };
  } catch (error) { return { status: "error", address: null, network: null, correctNetwork: false, error: errorMessage(error) }; }
}
export async function signWithFreighter(xdr: string) {
  const wallet = await import("@stellar/freighter-api");
  const result = await wallet.signTransaction(xdr, { networkPassphrase });
  if (result.error || !result.signedTxXdr) throw new Error(result.error?.message || "Transaction was not signed.");
  return result.signedTxXdr;
}
export function shortenAddress(address: string, size = 5) { return `${address.slice(0, size)}…${address.slice(-size)}`; }

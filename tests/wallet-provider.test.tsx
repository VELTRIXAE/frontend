import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { WalletProvider } from "@/components/wallet/wallet-provider";
import { WalletButton } from "@/components/wallet/wallet-button";

const mockAdapters = vi.hoisted(() => {
  const freighter = {
    id: "freighter",
    name: "Freighter",
    isAvailable: vi.fn(async () => true),
    connect: vi.fn(async () => ({
      address: "GABCDEFGHIJKLMNOPQRSTUVWXYZ123456789",
      network: "TESTNET",
    })),
    disconnect: vi.fn(async () => undefined),
    getAddress: vi.fn(async () => "GABCDEFGHIJKLMNOPQRSTUVWXYZ123456789"),
    getNetwork: vi.fn(async () => "TESTNET"),
    signTransaction: vi.fn(async (xdr: string) => xdr),
    onAccountChange: vi.fn((listener: (address: string | null) => void) => { void listener; return () => undefined; }),
    onNetworkChange: vi.fn((listener: (network: string | null) => void) => { void listener; return () => undefined; }),
  };
  const albedo = {
    id: "albedo",
    name: "Albedo",
    isAvailable: vi.fn(async () => true),
    connect: vi.fn(async () => ({
      address: "GALBEDOABCDEFGHIJKLMNOPQRSTUVWXYZ123456",
      network: "PUBLIC",
    })),
    disconnect: vi.fn(async () => undefined),
    getAddress: vi.fn(async () => "GALBEDOABCDEFGHIJKLMNOPQRSTUVWXYZ123456"),
    getNetwork: vi.fn(async () => "PUBLIC"),
    signTransaction: vi.fn(async (xdr: string) => xdr),
    onAccountChange: vi.fn((listener: (address: string | null) => void) => { void listener; return () => undefined; }),
    onNetworkChange: vi.fn((listener: (network: string | null) => void) => { void listener; return () => undefined; }),
  };
  const unavailable = {
    id: "unavailable-wallet",
    name: "Unavailable Wallet",
    isAvailable: vi.fn(async () => false),
    connect: vi.fn(async () => {
      throw new Error("not available");
    }),
    disconnect: vi.fn(async () => undefined),
    getAddress: vi.fn(async () => null),
    getNetwork: vi.fn(async () => null),
    signTransaction: vi.fn(async (xdr: string) => xdr),
    onAccountChange: vi.fn((listener: (address: string | null) => void) => { void listener; return () => undefined; }),
    onNetworkChange: vi.fn((listener: (network: string | null) => void) => { void listener; return () => undefined; }),
  };
  return { freighter, albedo, unavailable };
});

vi.mock("@/lib/stellar/wallet", () => ({
  shortenAddress: (address: string) => `${address.slice(0, 5)}…${address.slice(-5)}`,
  readFreighterWallet: vi.fn(async () => ({
    status: "disconnected",
    address: null,
    network: null,
    correctNetwork: false,
  })),
  connectFreighter: vi.fn(async () => ({
    status: "connected",
    address: "GABCDEFGHIJKLMNOPQRSTUVWXYZ123456789",
    network: "TESTNET",
    correctNetwork: true,
  })),
  getWalletAdapters: vi.fn(() => [
    mockAdapters.freighter,
    mockAdapters.albedo,
    mockAdapters.unavailable,
  ]),
  mapWalletError: vi.fn((error: unknown) => {
    const message = error instanceof Error ? error.message : String(error);
    if (/reject|denied|cancel/i.test(message)) {
      return "The wallet request was rejected. Please try again.";
    }
    if (/not available|not installed/i.test(message)) {
      return "This wallet is not available in your browser.";
    }
    return "Something went wrong while talking to your wallet.";
  }),
  toUserFacingError: vi.fn((error: unknown) => {
    const message = error instanceof Error ? error.message : String(error);
    if (/reject|denied|cancel/i.test(message)) return "The wallet request was rejected. Please try again.";
    if (/not available|not installed/i.test(message)) return "This wallet is not available in your browser.";
    return "Something went wrong while talking to your wallet.";
  }),
}));

describe("wallet integration controls", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("connects and exposes disconnect without private-key input", async () => {
    render(
      <WalletProvider>
        <WalletButton />
      </WalletProvider>,
    );
    await userEvent.click(screen.getByRole("button", { name: /connect wallet/i }));
    await userEvent.click(await screen.findByRole("menuitem", { name: /freighter/i }));
    expect(
      await screen.findByRole("button", { name: "Disconnect wallet" }),
    ).toBeInTheDocument();
    expect(
      screen.queryByLabelText(/private key|recovery phrase/i),
    ).not.toBeInTheDocument();
  });

  it("lists available wallets and marks unavailable ones as disabled", async () => {
    render(
      <WalletProvider>
        <WalletButton />
      </WalletProvider>,
    );

    await userEvent.click(screen.getByRole("button", { name: /connect wallet/i }));

    const freighterOption = await screen.findByRole("menuitem", {
      name: /freighter/i,
    });
    const albedoOption = await screen.findByRole("menuitem", { name: /albedo/i });
    const unavailableOption = await screen.findByRole("menuitem", {
      name: /unavailable wallet/i,
    });

    expect(freighterOption).toBeEnabled();
    expect(albedoOption).toBeEnabled();
    expect(unavailableOption).toBeDisabled();
    expect(unavailableOption).toHaveAccessibleDescription(/not available/i);
  });

  it("connects via a non-Freighter adapter", async () => {
    render(
      <WalletProvider>
        <WalletButton />
      </WalletProvider>,
    );

    await userEvent.click(screen.getByRole("button", { name: /connect wallet/i }));
    await userEvent.click(await screen.findByRole("menuitem", { name: /albedo/i }));

    expect(mockAdapters.albedo.connect).toHaveBeenCalledTimes(1);
    expect(mockAdapters.freighter.connect).not.toHaveBeenCalled();
    expect(
      await screen.findByRole("button", { name: "Disconnect wallet" }),
    ).toBeInTheDocument();
    expect(screen.getByText(/GALBE…23456/)).toBeInTheDocument();
    expect(
      screen.queryByLabelText(/private key|recovery phrase/i),
    ).not.toBeInTheDocument();
  });

  it("reflects live account changes without a page reload", async () => {
    let accountListener: ((address: string | null) => void) | undefined;
    mockAdapters.albedo.onAccountChange.mockImplementation((cb) => {
      accountListener = cb;
      return () => {
        accountListener = undefined;
      };
    });

    render(
      <WalletProvider>
        <WalletButton />
      </WalletProvider>,
    );

    await userEvent.click(screen.getByRole("button", { name: /connect wallet/i }));
    await userEvent.click(await screen.findByRole("menuitem", { name: /albedo/i }));
    await screen.findByRole("button", { name: "Disconnect wallet" });

    expect(accountListener).toBeDefined();
    accountListener?.("GNEWACCOUNTABCDEFGHIJKLMNOPQRSTUVWXYZ12");

    await waitFor(() => {
      expect(screen.getByText(/GNEWA…XYZ12/)).toBeInTheDocument();
    });
    expect(
      screen.getByRole("button", { name: "Disconnect wallet" }),
    ).toBeInTheDocument();
  });

  it("reflects live network changes without a page reload", async () => {
    let networkListener: ((network: string | null) => void) | undefined;
    mockAdapters.albedo.onNetworkChange.mockImplementation((cb) => {
      networkListener = cb;
      return () => {
        networkListener = undefined;
      };
    });

    render(
      <WalletProvider>
        <WalletButton />
      </WalletProvider>,
    );

    await userEvent.click(screen.getByRole("button", { name: /connect wallet/i }));
    await userEvent.click(await screen.findByRole("menuitem", { name: /albedo/i }));
    await screen.findByRole("button", { name: "Disconnect wallet" });

    expect(networkListener).toBeDefined();
    networkListener?.("TESTNET");

    await waitFor(() => {
      expect(screen.getByText(/testnet/i)).toBeInTheDocument();
    });
    expect(
      screen.getByRole("button", { name: "Disconnect wallet" }),
    ).toBeInTheDocument();
  });

  it("maps provider failures to accessible user-facing errors", async () => {
    mockAdapters.albedo.connect.mockRejectedValueOnce(
      new Error("User rejected the request"),
    );

    render(
      <WalletProvider>
        <WalletButton />
      </WalletProvider>,
    );

    await userEvent.click(screen.getByRole("button", { name: /connect wallet/i }));
    await userEvent.click(await screen.findByRole("menuitem", { name: /albedo/i }));

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent(/rejected/i);
    expect(alert).not.toHaveTextContent(/user rejected the request/i);
    expect(
      screen.queryByLabelText(/private key|recovery phrase/i),
    ).not.toBeInTheDocument();
  });
});

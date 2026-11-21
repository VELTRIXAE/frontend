import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Button } from "@/components/ui/button";
import { TokenSelector } from "@/components/swap/token-selector";
import * as horizon from "@/lib/horizon";

vi.mock("@/lib/horizon", () => ({
  searchHorizonAssets: vi.fn(),
}));

const searchHorizonAssets = vi.mocked(horizon.searchHorizonAssets);

type Asset = {
  contract: string;
  symbol: string;
  name: string;
  decimals: number;
  verification: string;
  issuer?: string;
  supported?: boolean;
};

const supportedAsset: Asset = {
  contract: "C_TOKEN",
  symbol: "XLM",
  name: "Stellar Lumens",
  decimals: 7,
  verification: "onchain-metadata-only",
  issuer: "G_XLM_ISSUER",
  supported: true,
};

const duplicateIssuerA: Asset = {
  contract: "C_USDC_A",
  symbol: "USDC",
  name: "USD Coin (Issuer A)",
  decimals: 7,
  verification: "onchain-metadata-only",
  issuer: "G_ISSUER_A",
  supported: true,
};

const duplicateIssuerB: Asset = {
  contract: "C_USDC_B",
  symbol: "USDC",
  name: "USD Coin (Issuer B)",
  decimals: 7,
  verification: "onchain-metadata-only",
  issuer: "G_ISSUER_B",
  supported: true,
};

const unsupportedAsset: Asset = {
  contract: "C_TESTNET_ONLY",
  symbol: "TST",
  name: "Testnet Only Asset",
  decimals: 7,
  verification: "onchain-metadata-only",
  issuer: "G_TESTNET_ISSUER",
  supported: false,
};

describe("accessible UI", () => {
  it("keeps disabled transaction actions unavailable", () => {
    render(<Button disabled>Submit swap</Button>);
    expect(screen.getByRole("button", { name: "Submit swap" })).toBeDisabled();
  });

  it("opens an accessible searchable token dialog", async () => {
    render(
      <TokenSelector
        assets={[supportedAsset]}
        onSelect={vi.fn()}
        label="Select token"
      />,
    );
    await userEvent.click(screen.getByRole("button", { name: "Select asset" }));
    expect(
      screen.getByRole("dialog", { name: "Select token" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("textbox", { name: "Search tokens" }),
    ).toBeInTheDocument();
  });
});

describe("token selector interactions", () => {
  beforeEach(() => {
    searchHorizonAssets.mockReset();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  const getTrigger = () =>
    screen.getByRole("button", { name: "Select asset" });

  const getDialog = () =>
    screen.queryByRole("dialog", { name: "Select token" });

  const getSearch = () =>
    screen.getByRole("textbox", { name: "Search tokens" });

  it("opens with Enter and focuses the search field, reflecting expanded state", async () => {
    const user = userEvent.setup();
    render(
      <TokenSelector
        assets={[supportedAsset]}
        onSelect={vi.fn()}
        label="Select token"
      />,
    );

    const trigger = getTrigger();
    expect(trigger).toHaveAttribute("aria-expanded", "false");

    trigger.focus();
    await user.keyboard("{Enter}");

    expect(getDialog()).toBeInTheDocument();
    expect(trigger).toHaveAttribute("aria-expanded", "true");
    await waitFor(() => expect(getSearch()).toHaveFocus());
  });

  it("opens with Space and focuses the search field", async () => {
    const user = userEvent.setup();
    render(
      <TokenSelector
        assets={[supportedAsset]}
        onSelect={vi.fn()}
        label="Select token"
      />,
    );

    const trigger = getTrigger();
    trigger.focus();
    await user.keyboard(" ");

    expect(getDialog()).toBeInTheDocument();
    expect(trigger).toHaveAttribute("aria-expanded", "true");
    await waitFor(() => expect(getSearch()).toHaveFocus());
  });

  it("dismisses with Escape and returns focus to the trigger", async () => {
    const user = userEvent.setup();
    render(
      <TokenSelector
        assets={[supportedAsset]}
        onSelect={vi.fn()}
        label="Select token"
      />,
    );

    const trigger = getTrigger();
    await user.click(trigger);
    expect(getDialog()).toBeInTheDocument();
    await waitFor(() => expect(getSearch()).toHaveFocus());

    await user.keyboard("{Escape}");

    await waitFor(() => expect(getDialog()).not.toBeInTheDocument());
    expect(trigger).toHaveAttribute("aria-expanded", "false");
    await waitFor(() => expect(trigger).toHaveFocus());
  });

  it("dismisses with the Close control and returns focus to the trigger", async () => {
    const user = userEvent.setup();
    render(
      <TokenSelector
        assets={[supportedAsset]}
        onSelect={vi.fn()}
        label="Select token"
      />,
    );

    const trigger = getTrigger();
    await user.click(trigger);
    expect(getDialog()).toBeInTheDocument();

    const dialog = getDialog()!;
    await user.click(within(dialog).getByRole("button", { name: /close/i }));

    await waitFor(() => expect(getDialog()).not.toBeInTheDocument());
    expect(trigger).toHaveAttribute("aria-expanded", "false");
    await waitFor(() => expect(trigger).toHaveFocus());
  });

  it("dismisses on outside pointer without swallowing a supported selection", async () => {
    const user = userEvent.setup();
    const onSelect = vi.fn();
    render(
      <div>
        <TokenSelector
          assets={[supportedAsset]}
          onSelect={onSelect}
          label="Select token"
        />
        <button type="button">Outside</button>
      </div>,
    );

    const trigger = getTrigger();

    // Outside pointer dismissal.
    await user.click(trigger);
    expect(getDialog()).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Outside" }));
    await waitFor(() => expect(getDialog()).not.toBeInTheDocument());
    expect(onSelect).not.toHaveBeenCalled();

    // Supported selection is not swallowed by outside-pointer handling.
    await user.click(trigger);
    expect(getDialog()).toBeInTheDocument();
    await user.click(
      within(getDialog()!).getByRole("option", { name: /Stellar Lumens/i }),
    );
    expect(onSelect).toHaveBeenCalledTimes(1);
    expect(onSelect).toHaveBeenCalledWith(
      expect.objectContaining({ contract: "C_TOKEN" }),
    );
    await waitFor(() => expect(getDialog()).not.toBeInTheDocument());
  });

  it("selects a supported asset once and closes the dropdown", async () => {
    const user = userEvent.setup();
    const onSelect = vi.fn();
    render(
      <TokenSelector
        assets={[supportedAsset]}
        onSelect={onSelect}
        label="Select token"
      />,
    );

    const trigger = getTrigger();
    await user.click(trigger);
    await user.click(
      within(getDialog()!).getByRole("option", { name: /Stellar Lumens/i }),
    );

    expect(onSelect).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(getDialog()).not.toBeInTheDocument());
    expect(trigger).toHaveAttribute("aria-expanded", "false");
  });

  it("keeps discovered unsupported assets disabled and never invokes onSelect", async () => {
    const user = userEvent.setup();
    const onSelect = vi.fn();
    searchHorizonAssets.mockResolvedValue([unsupportedAsset]);

    render(
      <TokenSelector
        assets={[supportedAsset]}
        onSelect={onSelect}
        label="Select token"
      />,
    );

    await user.click(getTrigger());
    const dialog = getDialog()!;

    const unsupportedOption = await within(dialog).findByRole("option", {
      name: /Testnet Only Asset/i,
    });
    expect(unsupportedOption).toHaveAttribute("aria-disabled", "true");

    await user.click(unsupportedOption);
    expect(onSelect).not.toHaveBeenCalled();
    expect(getDialog()).toBeInTheDocument();
  });

  it("filters assets by search and distinguishes duplicate symbols by issuer", async () => {
    const user = userEvent.setup();
    searchHorizonAssets.mockResolvedValue([duplicateIssuerA, duplicateIssuerB]);

    render(
      <TokenSelector
        assets={[supportedAsset]}
        onSelect={vi.fn()}
        label="Select token"
      />,
    );

    await user.click(getTrigger());
    const dialog = getDialog()!;

    const optionA = await within(dialog).findByRole("option", {
      name: /Issuer A/i,
    });
    const optionB = await within(dialog).findByRole("option", {
      name: /Issuer B/i,
    });
    expect(optionA).toBeInTheDocument();
    expect(optionB).toBeInTheDocument();
    expect(optionA).not.toBe(optionB);

    await user.type(getSearch(), "Issuer A");
    expect(
      within(dialog).getByRole("option", { name: /Issuer A/i }),
    ).toBeInTheDocument();
    expect(
      within(dialog).queryByRole("option", { name: /Issuer B/i }),
    ).not.toBeInTheDocument();
  });

  it("shows an empty state when search matches nothing", async () => {
    const user = userEvent.setup();
    render(
      <TokenSelector
        assets={[supportedAsset]}
        onSelect={vi.fn()}
        label="Select token"
      />,
    );

    await user.click(getTrigger());
    await user.type(getSearch(), "zzz-no-match");

    expect(
      await screen.findByText(/no (tokens|assets|results)/i),
    ).toBeInTheDocument();
  });

  it("shows an empty state when discovery returns no assets", async () => {
    const user = userEvent.setup();
    searchHorizonAssets.mockResolvedValue([]);

    render(
      <TokenSelector assets={[]} onSelect={vi.fn()} label="Select token" />,
    );

    await user.click(getTrigger());
    expect(
      await screen.findByText(/no (tokens|assets|results)/i),
    ).toBeInTheDocument();
  });

  it("shows an error state when discovery fails", async () => {
    const user = userEvent.setup();
    searchHorizonAssets.mockRejectedValue(new Error("horizon unavailable"));

    render(
      <TokenSelector assets={[]} onSelect={vi.fn()} label="Select token" />,
    );

    await user.click(getTrigger());
    expect(
      await screen.findByText(/unable to (load|discover)|failed|error/i),
    ).toBeInTheDocument();
  });
});
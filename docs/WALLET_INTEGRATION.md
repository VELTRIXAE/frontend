# Wallet integration

The app connects to Stellar through a provider-neutral wallet adapter. UI and transaction code depend only on the adapter interface, not on any single wallet SDK, so additional compatible wallets can be added without touching transaction logic.

## Provider-neutral adapter interface

The adapter exposes a single interface covering:

- **Connect / disconnect** — request access to a wallet and clear local session state.
- **Availability** — report whether a given provider is installed/available in the current environment.
- **Network** — read the active network passphrase and subscribe to network changes.
- **Address** — read the active public address and subscribe to account changes.
- **Signing** — request a signature for a prepared transaction, only after backend preparation and independent RPC simulation.

Wallet-specific SDKs (for example `@stellar/freighter-api` and Stellar Wallets Kit) are wrapped behind this interface. Stellar Wallets Kit is used to reach multiple compatible wallets through one integration, and WalletConnect support was evaluated for mobile flows. No provider-specific types leak into transaction or UI code.

## Supported wallets

- **Freighter** — fully supported via `@stellar/freighter-api`, preserving the original integration.
- **At least one additional compatible wallet** — reachable through Stellar Wallets Kit, working on desktop or mobile.

The app never asks for or stores private keys or recovery phrases. Signing is delegated entirely to the wallet; the app only receives signed transaction envelopes.

## Wallet selection and availability states

A wallet selection step lists the supported providers with an availability state for each:

- **Available** — the provider is detected and can be connected.
- **Not installed / unavailable** — the provider is not present in this environment; the option is shown but disabled with an accessible explanation.
- **Connecting / connected** — pending and active states are surfaced to the user.

Pending states disable the transaction action to prevent duplicate submissions.

## Live account and network changes

The adapter subscribes to account and network changes so the app reacts without a page reload:

- When the active account changes, the displayed shortened public address updates and any in-flight transaction state is reset.
- When the network passphrase changes, it is re-checked against Stellar Testnet; a mismatch surfaces a user-facing error and blocks signing.
- State is also refreshed on focus and visibility changes as a fallback.

Disconnect clears local application state. Because some wallets have no permission-revocation call in this integration, reload may restore a previously authorized session.

## Accessible error mapping

Provider-specific failures are mapped to accessible, user-facing errors rather than raw SDK messages:

- Rejected permissions and rejected signatures surface as clear, announced errors.
- Unavailable or disconnected wallets produce actionable guidance.
- Network mismatch and account-change interruptions are reported with accessible messaging.

Errors are exposed to assistive technology (e.g. via live regions) and never expose private key material.

## Testing notes

Wallet behavior is mocked in unit tests across the adapter interface. A real Freighter + funded Testnet account and a real second-wallet flow have not been verified in this audit.
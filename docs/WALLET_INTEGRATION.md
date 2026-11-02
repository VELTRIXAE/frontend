# Wallet integration

Freighter is the only implemented wallet provider. The app requests access through `@stellar/freighter-api`, checks the network passphrase against Stellar Testnet, displays a shortened public address, and asks Freighter to sign only after backend preparation and independent RPC simulation.

Disconnect clears local application state. Because Freighter has no permission-revocation call in this integration, reload may restore a previously authorized session. Account/network state is refreshed on focus and visibility changes.

Rejected permissions and signatures surface as user-facing errors. Pending states disable the transaction action to prevent duplicate submissions. VELTRIXAE never asks for or persists private keys or recovery phrases.

Wallet behavior is mocked in unit tests. A real Freighter + funded Testnet account has not been verified in this audit.

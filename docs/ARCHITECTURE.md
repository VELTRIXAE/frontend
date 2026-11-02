# Architecture

VELTRIXAE is a Next.js App Router frontend. Server-rendered route shells provide metadata and layout; interactive trading, wallet, and account features are client components.

The data boundaries are intentional:

- `lib/api`: the VELTRIXAE backend contract. Every response is runtime-validated. The backend supplies token metadata, pools, routes, preparation, status, and current protocol counts.
- `lib/stellar/horizon.ts`: public Testnet account balances, recent transactions, and network health.
- `lib/stellar/wallet.ts`: Freighter permission, address/network reads, and signing.
- `lib/stellar/simulation.ts`: independent RPC simulation and direct submission of a wallet-signed envelope.
- `lib/amounts.ts`: decimal/base-unit conversion using strings and `BigInt`.

`WalletProvider` owns the provider session; `AccountProvider` shares Horizon state and refresh behavior. Feature pages retain local UI/request state. This avoids a broad store while the application has only two cross-route domains.

The transaction trust boundary is: quote → backend preparation with a fresh quote → frontend RPC simulation → user review/signing in Freighter → direct Stellar RPC submission → backend status polling. Private keys never enter the application or API.

## Verified Stellar Testnet contract registry

All contracts used by swap and liquidity actions are recorded in a single reviewed registry, which is the source of truth for contract IDs. The registry covers:

- the swap contract,
- the factory contract,
- the router contract,
- every supported pool contract.

Each entry records:

- the contract ID,
- the deployment ledger,
- the source commit the deployment was built from,
- the network passphrase the contract was deployed to,
- the verification status (verified / unverified / deprecated).

Environment values (e.g. `NEXT_PUBLIC_*` contract ID variables) must reference entries that exist in the registry with a verified status and the Testnet network passphrase. Environment values that are missing, unverified, or deployed to a different network are treated as invalid.

### Startup validation

At application startup the registry is validated:

- every contract ID is checked for well-formedness (Stellar contract address format),
- every entry's network passphrase is checked against the expected Testnet passphrase,
- environment-referenced contract IDs are checked against the registry and must resolve to a verified entry.

Validation failures are surfaced as a startup error/diagnostic rather than silently falling back to a default contract.

### Write-action gating

Write actions (swap submission, liquidity add/remove, and any other transaction that targets a registry contract) are disabled unless the registry and environment resolve to verified Testnet deployments. When the registry is invalid, unverified, or points at the wrong network, the UI disables write actions and explains why; read-only views remain available. The transaction preview shows the contract metadata (contract ID, deployment ledger, source commit, network passphrase, verification status) for every contract the transaction touches, so the user can confirm they are interacting with a verified Testnet deployment before signing.

### Review and rotation process

- **Review:** changes to the registry are reviewed like code. A new or updated entry must include the deployment ledger, source commit, and network passphrase, and must be confirmed against the deployed contract on Testnet before its status is set to verified.
- **Rotation:** when a contract is redeployed or superseded, the new entry is added and verified, environment values are updated to reference it, and the old entry is marked deprecated (not deleted) so historical transactions remain traceable. Deprecated entries cannot be referenced by environment values for write actions.
- **Wrong network / unverified:** any entry whose network passphrase does not match Testnet, or whose status is not verified, disables write actions until corrected.
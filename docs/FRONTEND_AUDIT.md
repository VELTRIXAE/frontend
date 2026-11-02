# VELTRIXAE frontend audit

Audit date: 2026-11-02. Scope: frontend `main` at `bb6a1e8`, backend documentation and frontend client on `VELTRIXAE/Aggregator-and-Backend`, and open frontend issues 10–19.

## Executive summary

The repository is a well-structured Next.js 16 application with a coherent dark Web3 visual system, responsive dashboard shell, Freighter support, Horizon account reads, Vitest coverage, and useful CI. The highest-risk defect was its backend layer: the UI called endpoints and response shapes that the real backend does not expose, including a signed-XDR submission endpoint expressly prohibited by the backend contract. That made tokens, pools, quotes, analytics, portfolio, and swap execution fail against the real service.

This audit pass aligned the client with `/api/v1`, added exact integer amount conversion, made requests cancellable, wired verified pool/market/overview data, sourced portfolio quantities from Horizon, and made unsupported actions visibly read-only. A signed transaction, if the backend later returns an executable prepared swap, is submitted directly to Stellar RPC and never to the VELTRIXAE API. The inspected backend currently reports quotes as non-executable and has no completed verified VELTRIXAE Testnet deployment; live swapping is therefore not claimed as verified.

## Structure and routing

- `app/` uses the Next.js App Router. `/` is the marketing site; `/app/*` is the authenticated-style workspace (without application authentication).
- Workspace routes: dashboard, swap, liquidity, pools, markets, portfolio, transactions, analytics, and settings.
- `components/ui` contains small primitives; `components/app`, `components/swap`, `components/wallet`, and `components/landing` separate feature areas.
- `lib/api` owns backend validation; `lib/stellar` owns Horizon, Freighter, RPC simulation, and submission; `lib/amounts.ts` owns base-unit conversions.
- No duplicate route implementations were found. A former pool link targeted a nonexistent dynamic pool route; pool rows are no longer misleading links.

## Dependencies

- Runtime: Next.js 16, React 19, Zod 4, Stellar SDK and Freighter API, React Hook Form, Recharts, Lucide, and Inter.
- React Hook Form/resolvers and Recharts are installed but no longer used in current production code. They are candidates for removal after confirming no near-term forms/chart work depends on them.
- No new runtime dependency was required for this pass.
- The repository requires Node 22 and pnpm 12.16.1.

## Pages and feature status

| Area | Status | Audit result |
| --- | --- | --- |
| Marketing | Functional | Responsive and branded; claims were tightened to distinguish available pool discovery from unavailable liquidity transactions. |
| Dashboard | Functional with wallet | Horizon balances, recent transactions, and network health are live; valuation and positions are explicitly unavailable. |
| Swap quotes | Functional when backend is configured | Uses real token registry, base-unit amounts, cancellation, route/impact/slippage/minimum received, expiry, and explicit API errors. |
| Swap execution | Implemented but not live-verified | Guarded by backend `executable`, network, freshness, independent simulation, Freighter signing, duplicate-submit state, direct RPC submission, and finality polling. Current backend reports non-executable quotes. |
| Pools | Functional read-only | Uses factory-discovered backend snapshot with ledger and observation time. |
| Markets | Functional read-only | Shows raw rational reserve ratios; does not label them as fiat prices. |
| Liquidity | Unavailable | Backend exposes no add/remove preparation contract. Inputs and actions are disabled. |
| Portfolio | Partially functional | Horizon quantities and transactions work. USD prices, distribution, and LP positions remain unavailable without verified providers/indexers. |
| Analytics | Partially functional | Current counts work. Historical volume and TVL remain unavailable because the backend reports no history. |
| Settings | Functional | Reports frontend API configuration and explains that contract readiness is backend-controlled. |

## Wallet and Stellar integration

- Freighter connection, authorized-session restoration, shortened address, copy, local disconnect, network detection, signature rejection errors, and Testnet signing are implemented.
- Wallet state is refreshed on window focus and visibility changes to notice account/network/disconnection changes.
- Secrets and recovery phrases are never requested or stored.
- The disconnect control clears application state; Freighter does not expose a revoke-permission method, so an authorized session can be restored on reload.
- Only Freighter is supported. Multi-wallet support remains issue #13.
- Horizon data is runtime validated and returns a clear unfunded-account state.

## Backend integration findings

The former frontend contract used `/v1/assets`, `/v1/swap/quote`, `/v1/swap/build`, `/v1/transactions/submit`, `/v1/portfolio`, and `/v1/analytics`. None matches the inspected backend.

The corrected integration uses `/api/v1/tokens`, `/pools`, `/markets`, `/quotes`, `/swaps/prepare`, `/transactions/:hash`, `/network/status`, and `/analytics/overview`. It validates error envelopes and response bodies with Zod, uses 12-second timeouts, retries only safe reads, cancels obsolete requests, and never sends a signed envelope to the backend.

## State management and rendering

- Local React state and two narrow contexts are appropriate for the current application size; a global state dependency is unnecessary.
- Account data is shared by `AccountProvider`, avoiding duplicate Horizon reads across dashboard/portfolio/transactions.
- Quote requests are debounced, cancelled, and sequenced to prevent stale responses from replacing newer input.
- Exact financial scaling uses strings and `BigInt`, not floating-point `Number` arithmetic.

## Design, responsive behavior, and accessibility

- Brand color `#845AE8`, spacing, cards, forms, status colors, and typography are consistent across the workspace.
- The existing visual system is dark-only. A light theme was not added because the current gradients, hard-coded chart/modal colors, and marketing art need a deliberate token pass first.
- Layouts collapse at 1050/1000/820/800/760/600/560/520 breakpoints. Data tables become two-column cards on narrow screens.
- Global focus-visible styles and reduced-motion handling exist. Navigation now exposes `aria-current`, menu state and controls; token dialogs close with Escape and expose dialog semantics.
- Remaining accessibility work: automated axe/Playwright checks, full focus trapping/restoration in dialogs, and real-device screen-reader verification (issue #18).

## Tests and automation

- Vitest covers UI primitives, token dialog semantics, wallet controls, Horizon validation, API schemas, exact amount conversion, command navigation, reduced motion, and responsive breakpoints.
- Test/type/lint discovery is explicitly limited to this frontend so unrelated untracked contract sources cannot contaminate results.
- CI installs with a frozen lockfile, lints, type-checks, runs coverage-gated unit tests, and builds. CodeQL and dependency review workflows exist; Dependabot is enabled.
- Missing: browser E2E, automated accessibility assertions, visual regression, and a mocked full swap state-machine test. Tracked by issue #18.

## Open issues reviewed

Open frontend issues #10–19 cover the backend contract, contract registry, Testnet swap execution, multi-wallet support, verified pricing, liquidity transactions, market explorer, indexed analytics, Playwright/accessibility, and production observability. This pass materially addresses #10 and the frontend safeguards in #12, but neither should be closed until a deployed backend and contracts are exercised end to end.

## Remaining risks and recommended order

1. Publish and verify a complete Testnet deployment registry; the backend currently documents no completed VELTRIXAE deployment.
2. Deploy the backend and run live quote/prepare/sign/submit/finality verification with a funded disposable Testnet account.
3. Add Playwright plus axe tests for keyboard, mobile, error, expiry, rejection, and duplicate submission paths.
4. Add reviewed multi-wallet support behind a provider-neutral adapter.
5. Add a verified price source and indexer before enabling USD totals, charts, positions, or historical analytics.
6. Implement liquidity preparation endpoints and contract review before enabling add/remove controls.
7. Remove currently unused form/chart dependencies if planned work will not use them.

## Verification boundary

Static checks and mocked tests verify frontend behavior. No successful wallet signature, Testnet contract invocation, or finalized swap was performed in this audit. Unsupported features remain disabled rather than simulated with production-looking mock data.

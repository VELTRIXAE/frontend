# Contributing

Use Node.js 22+ and the pinned pnpm version. Create focused changes, preserve the non-custodial boundary, and do not add production-looking fabricated financial data.

Before opening a pull request, run `pnpm lint`, `pnpm typecheck`, `pnpm test:coverage`, and `pnpm build`. Add tests for behavior changes. Clearly label mocked wallet/backend behavior and document any live Testnet verification separately.

Never commit secrets, recovery phrases, private keys, funded test accounts, or unreviewed contract identifiers. New API data must be runtime-validated and unavailable states must remain explicit.

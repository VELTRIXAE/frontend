# Testing

Run the complete local verification set:

```bash
pnpm lint
pnpm typecheck
pnpm test:coverage
pnpm build
```

Unit tests use Vitest, Testing Library, and jsdom. Wallet and network calls are mocked unless a test explicitly says otherwise. Tests do not prove that Freighter, the deployed backend, or Stellar Testnet contracts work live.

CI runs frozen dependency installation, lint, strict TypeScript, coverage-gated tests, and a production build. CodeQL and dependency review run separately. Browser E2E and automated axe coverage remain planned in frontend issue #18.

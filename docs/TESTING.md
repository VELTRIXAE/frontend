# Testing

Run the complete local verification set:

```bash
pnpm lint
pnpm typecheck
pnpm test:coverage
pnpm build
pnpm test:e2e
```

Unit tests use Vitest, Testing Library, and jsdom. Wallet and network calls are mocked unless a test explicitly says otherwise. Tests do not prove that Freighter, the deployed backend, or Stellar Testnet contracts work live.

CI runs frozen dependency installation, lint, strict TypeScript, coverage-gated tests, and a production build. CodeQL and dependency review run separately.

## End-to-end, responsive, and accessibility testing

Browser tests use [Playwright](https://playwright.dev/) to exercise critical user journeys in real browsers across desktop and mobile viewports. They run without real funds or private keys: every wallet and network interaction is served by deterministic fixtures.

### Coverage

The Playwright suites cover:

- **Navigation** — landing route to the application routes and back.
- **Token selection** — choosing source and destination tokens.
- **Quoting** — requesting and rendering a quote.
- **Simulation** — running a transaction simulation and displaying results.
- **Signing rejection** — the wallet declining a signature request and the UI surfacing it.
- **Error recovery** — recovering from a failed request and retrying successfully.
- **Accessibility** — automated axe checks on the landing and application routes. Critical violations fail CI.
- **Responsive** — layout regression checks at representative breakpoints.

### Projects

Playwright is configured with two projects:

- **Chromium desktop** — a desktop viewport for the full journey and accessibility suites.
- **Chromium mobile** — a mobile viewport (touch enabled) for the journey, accessibility, and responsive suites.

Both projects must pass in CI.

### Deterministic fixtures

Wallet and API behavior is mocked so results are reproducible and no real funds or keys are involved:

- **Wallet fixture** — a stubbed wallet provider that returns canned account data, approves or rejects signing on demand, and never touches a real extension or secret key.
- **API fixture** — intercepted network routes returning fixed quote, simulation, and error responses. Flaky network and wallet cases (timeouts, rejections, transient failures) are simulated with these deterministic mocks rather than live calls.

Fixtures reset between tests so ordering does not affect outcomes.

### Accessibility

Automated accessibility checks run against the landing and application routes using axe. Critical violations fail the run; lower-severity findings are reported for triage.

### Responsive

Representative breakpoints are captured to catch layout regressions. Screenshots are compared against committed baselines; update baselines intentionally when a layout change is expected.

### Running locally

Install browsers once, then run the suites:

```bash
pnpm exec playwright install --with-deps
pnpm test:e2e
```

Useful variants:

```bash
# Run a single project
pnpm test:e2e --project=chromium-desktop
pnpm test:e2e --project=chromium-mobile

# Run a single spec
pnpm test:e2e --grep "signing rejection"

# Interactive UI mode
pnpm exec playwright test --ui

# Update responsive baselines after an intentional layout change
pnpm test:e2e --update-snapshots
```

### CI behavior

CI installs Playwright browsers with dependencies and runs both Chromium projects. Critical accessibility violations and responsive baseline mismatches fail the build. Because all wallet and network interactions are mocked, the suites require no secrets, real funds, or live backend and run deterministically.
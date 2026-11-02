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

## Observability model

Observability is privacy-conscious and opt-in by environment. It has three layers:

- **Error monitoring**: uncaught errors and handled failures are reported to a monitoring sink. Reports are scrubbed before transmission (see below).
- **Web-vitals reporting**: Core Web Vitals (LCP, INP, CLS, FCP, TTFB) are sampled and reported with route and release metadata only.
- **Health and configuration signals**: backend health checks and environment/configuration validation failures are surfaced as observable events so misconfiguration is detected before it affects users.

Telemetry is disabled unless a monitoring endpoint is configured for the environment. When disabled, reporting calls are no-ops and no data leaves the browser.

### Request-ID correlation

Every backend request carries a request identifier. The `lib/api` layer reads the backend-provided request ID from responses (and generates a client-side correlation ID when the backend does not supply one). That identifier is attached to:

- the corresponding frontend error report, and
- any health or configuration failure event tied to that request.

This lets an operator join a frontend error to the exact backend request and log line. Correlation IDs are opaque strings; they never contain wallet addresses, keys, or payload contents.

### Privacy scrubbing

All telemetry passes through a scrubbing step before transmission. The following must never enter telemetry:

- wallet secrets, private keys, or seed phrases,
- signed XDR or any transaction envelope,
- sensitive account data (full account identifiers are redacted or omitted),
- request/response bodies that could contain the above.

Scrubbing is applied centrally so individual call sites cannot bypass it. Error messages and stack traces are retained only after redaction; arbitrary payloads are dropped rather than logged.

## Mainnet readiness gate

Mainnet is disabled by default. Enabling it requires an explicit build-time gate that cannot be satisfied accidentally:

- A release flag must be set explicitly at build time.
- Contract addresses must be verified for the target network.
- If either condition is missing, the build fails or Mainnet remains disabled.

The gate is evaluated at build time, not at runtime, so a misconfigured deployment cannot silently reach Mainnet. Testnet remains the default target.

## Operational checklists

### Release checklist

- [ ] Environment validation passes (required variables present and well-formed).
- [ ] Backend health check is green.
- [ ] Contract addresses verified for the target network.
- [ ] Mainnet release flag set only if Mainnet is intended and verified.
- [ ] Release version/tag recorded.
- [ ] Monitoring endpoint configured and receiving events.

### Rollback checklist

- [ ] Identify the last known-good release tag.
- [ ] Redeploy the previous release.
- [ ] Confirm health check and configuration validation are green.
- [ ] Verify error and web-vitals reporting resumes normally.
- [ ] Record the rollback reason and outcome.

### Incident checklist

- [ ] Acknowledge the alert and open an incident record.
- [ ] Use request-ID correlation to locate the failing backend request.
- [ ] Assess user impact and whether Mainnet is involved.
- [ ] Apply mitigation (rollback or targeted fix).
- [ ] Confirm recovery via health and error monitoring.
- [ ] Write a post-incident summary.

### Environment-validation checklist

- [ ] All required environment variables are set.
- [ ] Monitoring endpoint is valid or intentionally unset.
- [ ] Network target is correct (Testnet by default).
- [ ] Mainnet gate inputs (release flag, verified contracts) are consistent.
- [ ] Configuration failures are observable in monitoring.

### Incident contacts

- **On-call engineer**: primary responder for alerts and rollbacks.
- **Backend owner**: backend health, request-ID correlation, and API failures.
- **Release owner**: approves releases and rollbacks; owns the Mainnet gate.
- **Security contact**: wallet-secret or sensitive-data exposure concerns.

Contact details are maintained in the private operations runbook and are not committed to this repository.

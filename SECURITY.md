# Security policy

Report suspected vulnerabilities privately through GitHub Security Advisories for `VELTRIXAE/frontend`. Do not open a public issue containing exploit details, wallet data, or credentials.

Supported development is currently Testnet-only. The interface must never request private keys or recovery phrases. Wallet signatures must use provider-supported APIs, and signed envelopes must be submitted directly to Stellar infrastructure rather than the VELTRIXAE backend.

Do not treat metadata, quotes, simulation, or transaction submission as finality. Verify network, contract targets, limits, fees, expiry, and finalized status independently.

## Telemetry privacy

Production observability (error monitoring and web-vitals reporting) must be privacy-conscious by default. The following must never enter telemetry payloads, breadcrumbs, tags, or logs:

- Private keys, recovery phrases, or any wallet secret material.
- Signed XDR envelopes or raw transaction payloads.
- Sensitive account data such as full account addresses beyond what is strictly required for correlation, balances, or personal identifiers.

Telemetry is limited to error type/message, sanitized stack traces, web-vital metrics, release identifiers, and non-sensitive request identifiers. Any new telemetry field must be reviewed against this policy before release.

## Request-ID correlation

Frontend errors are correlated with backend request identifiers. The backend-issued request ID is the only account- or request-linked value permitted in telemetry. Request IDs must be treated as opaque correlation tokens, must not encode wallet secrets or signed payloads, and must not be reused as authentication credentials.

## Mainnet readiness gate

Mainnet remains disabled by default. Mainnet cannot be enabled unless both conditions hold:

1. Contracts are verified (audited and confirmed deployed at the expected addresses on Mainnet).
2. An explicit release flag is set at build time.

The build-time gate must fail closed: absent verified contracts or the explicit release flag, the build must not produce a Mainnet-enabled artifact. Health and configuration failures must remain observable without exposing sensitive data. Operational documentation (release, rollback, incident, and environment-validation checklists, including incident contacts) must be kept current alongside any change to this gate.
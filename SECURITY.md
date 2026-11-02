# Security policy

Report suspected vulnerabilities privately through GitHub Security Advisories for `VELTRIXAE/frontend`. Do not open a public issue containing exploit details, wallet data, or credentials.

Supported development is currently Testnet-only. The interface must never request private keys or recovery phrases. Wallet signatures must use provider-supported APIs, and signed envelopes must be submitted directly to Stellar infrastructure rather than the VELTRIXAE backend.

Do not treat metadata, quotes, simulation, or transaction submission as finality. Verify network, contract targets, limits, fees, expiry, and finalized status independently.

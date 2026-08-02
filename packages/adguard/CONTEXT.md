# AdGuard Home

## Purpose

This context provides typed, agent-first observation and administration of one AdGuard Home instance through its control API and the `adguard` CLI.

## Ubiquitous language

- **Protection**: AdGuard Home's global DNS filtering state, `on` or `off`; it is not service reachability.
- **Query log entry**: one observed DNS request and its answer/filtering outcome.
- **Persistent client**: a configured client identity. **Auto client** is discovered by AdGuard Home; **active client** is returned by IP lookup. Statistical top clients are separate `TopRecord` values.
- **Filter**: a configured blocklist or allowlist subscription. **User rule** is a custom filtering rule.
- **DNS statistics**: aggregate query, blocked-query, processing-time, domain, and client counts.
- **DHCP status**: DHCP configuration and lease summaries exposed by AdGuard Home.

## Responsibilities

- Decode system status, DNS statistics, query logs, client views, filters, DNS configuration, DHCP status, and protection state.
- Own Basic-authenticated `/control` HTTP requests and AdGuard-specific error mapping.
- Expose bounded read operations and an explicitly confirmed global protection toggle.
- Present those operations through the thin `adguard` executable.

## Non-responsibilities

- It does not edit clients, filters, user rules, DNS configuration, or DHCP leases.
- It does not validate IP addresses or filtering-rule syntax.
- It does not persist credentials or provide timed protection changes.
- Opaque DNS/DHCP JSON is not a promise of a fully modeled configuration domain.

## Important domain objects

`SystemStatus`, `ProtectionState`, `Stats`, `QueryLogEntry`, `PersistentClient`, `AutoClient`, `ActiveClient`, `FilterRecord`, and `DhcpStatus` are the main public values. `AdguardConfigValue` contains the endpoint and Basic-auth credentials.

## Invariants and compatibility contracts

- Query-log lists default to 50 records; search defaults to 200.
- Returned list counts describe returned records; several top/client samples are capped at ten during decoding.
- Missing arrays normalize to empty arrays and nullable scalar fields normalize to absence.
- Protection accepts only `on` or `off` and cannot change unless the CLI receives `--confirm-toggle`.
- Root health may represent missing configuration as a successful unconfigured result; subcommands return typed error envelopes.
- All CLI invocations remain subject to the shared one-envelope stdout contract.

## Boundaries and dependencies

`packages/adguard` owns models, wire decoding, configuration, the HTTP adapter, errors, and operations. Live configuration requires `ADGUARD_URL`, `ADGUARD_USERNAME`, and redacted `ADGUARD_PASSWORD`. It depends on Effect and `@garage/cli-protocol`, not on another service package. The external boundary is the AdGuard Home control API.

## Package and app relationship

`apps/adguard-cli` imports the package's public barrel, parses commands/flags, adds next actions and confirmation policy, composes Bun HTTP/config layers, and delegates executable behavior to `runCliMain`. It does not contact AdGuard Home directly.

## Known ambiguities

- **Clients** is overloaded across persistent, auto-detected, and active views; qualify it.
- **Status** combines runtime, network, and protection fields; do not use it as a synonym for protection.
- `elapsedMs` is currently textual despite its numeric-sounding name.

## References

- [Effect services and layers guardrail](../../docs/guardrails/effect-services-and-layers.md)
- [CLI and workspace conventions](../../docs/reference/conventions.md)
- Evidence: `src/model.ts`, `src/api-schema.ts`, `src/http.ts`, `src/operations.ts`, and the paired package/app tests.

# Tailscale

## Purpose

This context provides read-only inspection and diagnostics for the local Tailscale node and its tailnet through the installed `tailscale` executable and the agent-first `tailscale` CLI.

## Ubiquitous language

- **Local node**: the machine running the Tailscale CLI and daemon.
- **Tailnet**: the Tailscale network identity reported by local status.
- **Backend state**: the local daemon/login state; `Running` is required for most diagnostics.
- **Peer**: another tailnet node reported by local status.
- **Exit-node candidate**: a peer advertising exit-node capability. **Current exit node** is the selected peer.
- **MagicDNS**: tailnet DNS capability reported by status; raw DNS status is a separate command projection.
- **Whois**: identity information returned by `tailscale whois`.

## Responsibilities

- Read local status, peers, exit-node candidates/current selection, DNS status, tailnet IPs, whois, and ping results.
- Normalize `tailscale status --json`, sort/bound peers, and classify daemon/command/decode failures.
- Discover and spawn the local executable through an abstract process boundary.
- Expose diagnostics without changing tailnet or local-node configuration.

## Non-responsibilities

- It does not run `up`, `down`, login/logout, route advertisement, or exit-node selection.
- It does not mutate DNS, ACLs, tags, devices, or remote control-plane configuration.
- It does not call Tailscale's remote API.
- It does not fully normalize `whois` or DNS text into domain-specific records.

## Important domain objects

`StatusResult`, `PeerRecord`, `CurrentExitNodeResult`, `DnsResult`, `IpResult`, `PingResult`, `ProcessResult`, and generic whois `JsonObject` describe the public surface.

## Invariants and compatibility contracts

- Bounded peer lists default to 25 and are sorted by hostname, DNS name, then first IP.
- Aggregate peer/online/exit-node counts cover the full decoded set; the records list may be truncated and signals more availability.
- Most reads require backend state `Running`; plain status remains available to explain a stopped/unlogged-in daemon.
- IPv4 and IPv6 probes fail independently; one missing family does not fail the whole operation.
- Ping performs three attempts.
- Executable discovery falls through only on command-not-found, not arbitrary process failures.
- All invocations obey the shared one-envelope stdout contract.

## Boundaries and dependencies

`packages/tailscale` owns Tailscale command sequencing, JSON normalization, daemon policy, and the `TailscaleProcess`/`TailscaleApi` seams. `apps/tailscale-cli` owns Bun child-process spawning and executable discovery. There is no HTTP configuration service.

## Package and app relationship

The app provides `TailscaleProcessLive`, parses diagnostic commands, builds root health/next actions, composes process layers, and calls package operations through `@garage/tailscale`.

## Known ambiguities

- **Online** and **active** preserve different upstream flags and should not be conflated.
- `exitNode` means selected; `exitNodeOption` means advertised capability.
- Root `configured: true` means no credentials are required, not that Tailscale is installed or running.
- **Reachable** reflects local process/backend health, not reachability of every peer.

## References

- [Effect services and layers guardrail](../../docs/guardrails/effect-services-and-layers.md)
- [CLI and workspace conventions](../../docs/reference/conventions.md)
- Evidence: `src/model.ts`, `src/api-schema.ts`, `src/process.ts`, `apps/tailscale-cli/src/process.ts`, and tests.

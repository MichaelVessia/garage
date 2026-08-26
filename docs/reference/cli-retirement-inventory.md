# Garage CLI retirement record

- Status: implemented; deployment and workstation activation tracked separately
- Audited: 2026-08-26
- Related decision: [ADR 0002](../adr/0002-consolidated-garage-mcp-delivery-edge.md)

## Outcome

Executor is the supported agent interface for homelab service APIs. Garage no longer ships agent-first service CLIs or their Nix/release machinery.

| Service | Supported agent path | Retirement disposition |
| --- | --- | --- |
| AdGuard Home | Executor OpenAPI connection `adguard.user.adguardHomelab` | CLI app and unused integration package removed; skill now uses Executor. |
| AutoCaliWeb | Executor → `garage-mcp.user.garageMcpHomelab` | Nine read-only API/catalog tools added to Garage MCP; CLI removed. File ingestion is unsupported. |
| Caddy | Executor OpenAPI connection `caddy.user.homelab` | CLI app and unused integration package removed; local-file diff/reload convenience is unsupported. |
| Immich | Executor OpenAPI connection `immich.user.immichHomelab` | Read-oriented skill migrated; CLI app and unused integration package removed. |
| Jellyfin | Executor OpenAPI connection `jellyfin.user.jellyfinHomelab` | CLI app and unused integration package removed; skill now uses Executor. |
| Jellyseerr | Executor OpenAPI connection `jellyseerr.user.jellyseerrHomelab` | CLI app and unused integration package removed; skill now uses Executor. |
| Prowlarr | Executor OpenAPI connection `prowlarr.user.prowlarrHomelab` | CLI app and unused integration package removed; curated search projections are unsupported. |
| Radarr | Executor OpenAPI connection `radarr.user.radarrHomelab` | CLI app and unused integration package removed; opinionated add/remove defaults are unsupported. |
| SABnzbd | Executor → `garage-mcp.user.garageMcpHomelab` | Eight Garage MCP tools retained with the reusable `@garage/sabnzbd` protocol package. |
| Sonarr | Executor OpenAPI connection `sonarr.user.sonarrHomelab` | CLI app and unused integration package removed; opinionated add/remove defaults are unsupported. |
| Tailscale | Native NixOS service/client only | Garage wrapper, package, and agent skill removed without Executor replacement. |
| TubeArchivist | Executor OpenAPI connection `tubearchivist.user.tubearchivistHomelab` | CLI app and unused integration package removed; curated cross-system import workflow is unsupported. |

## Safety policy

Executor uses exact saved-connection addresses rather than ineffective wildcard approximations.

- SABnzbd pause, resume, and delete remain approval gated.
- AdGuard global protection changes are approval gated.
- Caddy full configuration reload is approval gated.
- Jellyfin scheduled-task start, stop, and update are approval gated.
- Jellyseerr request create, update/status, retry, and delete are approval gated.
- Prowlarr command execution is approval gated.
- Radarr movie create, update, delete, and command execution are approval gated.
- Sonarr series create, update, delete, and command execution are approval gated.
- TubeArchivist channel subscription changes, download queue mutations, and task execution are approval gated.

Representative AdGuard, Caddy, Jellyfin, Jellyseerr, Prowlarr, Radarr, Sonarr, and TubeArchivist mutations were allowed to reach Executor's approval pause and then cancelled before invocation.

## Removed delivery surface

- All `apps/*-cli` workspaces and compiled CLI smoke tests.
- Unused direct-integration packages for services delivered by Executor OpenAPI.
- CLI Nix flake outputs, workstation package installation, and generated Garage CLI Bun dependencies.
- Local service URL/credential shell exports, sops declarations, and encrypted entries.
- Compatibility scripts, raw API references, and bespoke workflows coupled to local credentials.
- Automatic CLI Changesets/versioning/tagging workflow.

## Retained boundaries

- `apps/garage-mcp` is the private deployed MCP delivery edge for AutoCaliWeb and SABnzbd.
- `packages/autocaliweb` and `packages/sabnzbd` retain external protocol ownership.
- `packages/cli-protocol` remains because those integration packages still use its transport-neutral configuration, HTTP, schema, error, and test utilities. Extracting or renaming those responsibilities is a separate cleanup.
- The native NixOS Tailscale service and client remain unchanged.

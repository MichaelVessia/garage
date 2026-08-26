#!/usr/bin/env bash
set -euo pipefail

nix flake show --no-write-lock-file
# Build separately so each derivation's full monorepo install is released
# before the next begins instead of doubling peak temporary disk usage.
nix build --no-link .#sonarr
nix build --no-link .#tailscale
nix build --no-link .#garage-mcp-image
nix build --no-link .#pi-extensions

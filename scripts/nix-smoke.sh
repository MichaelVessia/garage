#!/usr/bin/env bash
set -euo pipefail

nix flake show --no-write-lock-file
# Build deployed deliverables separately to bound peak temporary disk usage.
nix build --no-link .#garage-mcp-image
nix build --no-link .#pi-extensions

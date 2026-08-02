#!/usr/bin/env bash
set -euo pipefail

nix flake show --no-write-lock-file
nix build --no-link .#sonarr .#tailscale

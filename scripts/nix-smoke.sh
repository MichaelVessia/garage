#!/usr/bin/env bash
set -euo pipefail

nix flake show --no-write-lock-file
nix develop --no-write-lock-file --command bun --version

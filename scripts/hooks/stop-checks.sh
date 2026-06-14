#!/usr/bin/env bash
# Cheap end-of-turn gate for coding agents: the fast subset of `bun run validate`
# (typecheck, lint, structural lint) without the test suite. Tests belong in the
# pre-commit hook and CI. Run from the repo root.
set -euo pipefail

cd "$(dirname "$0")/../.."

echo "stop-checks: typecheck"
bun run typecheck

echo "stop-checks: lint"
bun run lint

echo "stop-checks: ast-grep"
bun run ast-grep

echo "stop-checks: ok"

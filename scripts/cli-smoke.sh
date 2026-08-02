#!/usr/bin/env bash
set -euo pipefail

smoke_cli() {
  local executable="$1"
  shift

  local stdout_file stderr_file status line_count
  stdout_file="$(mktemp)"
  stderr_file="$(mktemp)"
  trap 'rm -f "$stdout_file" "$stderr_file"' RETURN

  set +e
  env -u JELLYSEERR_URL -u JELLYSEERR_API_KEY \
    "$executable" "$@" >"$stdout_file" 2>"$stderr_file"
  status=$?
  set -e

  test "$status" -eq 0
  test ! -s "$stderr_file"
  line_count="$(wc -l <"$stdout_file")"
  test "$line_count" -eq 1
  jq -e '
    (type == "object") and
    (.ok | type == "boolean") and
    (.command | type == "string") and
    (if .ok then has("result") else (.error.code | type == "string") end)
  ' <"$stdout_file" >/dev/null
}

smoke_cli apps/jellyseerr-cli/dist/jellyseerr
smoke_cli apps/jellyseerr-cli/dist/jellyseerr __garage_unknown_command__
smoke_cli apps/tailscale-cli/dist/tailscale
smoke_cli apps/tailscale-cli/dist/tailscale __garage_unknown_command__

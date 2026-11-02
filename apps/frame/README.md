# Frame

Wall dashboard for a PF1007L photo frame: Today (clock, weather, today and tomorrow), Calendar (day and week), Shopping list, and an Ambient clock after idle time. One Bun process serves the SPA and an Effect RPC endpoint at `/rpc`.

The layout and type are adapted from Wes Bos's [photo-frame-dashboard](https://github.com/wesbos/photo-frame-dashboard) (MIT, © Wes Bos). No code was copied; the views were rewritten for Foldkit.

## Layout

- `src/main.ts` — composition root: configuration, adapters, Bun HTTP server.
- `src/server.ts` — routes: `GET /health` (readiness and build id), `POST /rpc`, and the SPA with an `index.html` fallback.
- `src/handlers.ts` — RPC handlers; map upstream failures to a credential-free `UpstreamUnavailable`.
- `src/calendar/` — iCalendar feed adapter (5-minute cache, stale fallback) and recurrence expansion with `ical.js`.
- `src/home-assistant/` — weather and shopping list adapter over Home Assistant REST.
- `src/shared/` — schemas and the RPC group shared with the browser (imported as `#shared`).
- `web/` — Foldkit SPA: `main.ts` (Model, update, subscriptions), `message.ts`, `command.ts`, `view.ts`.
- `scripts/check-webview-compat.ts` — fails the build if `web/dist` uses features WebView 106 lacks.
- `alchemy.run.ts` and `scripts/verify-deploy.ts` — the deploy to CT 126.

## Configuration

| Variable | Required | Default | Purpose |
| --- | --- | --- | --- |
| `CALENDAR_ICS_URL` | yes | none | Redacted secret iCalendar address of the family calendar |
| `HOME_ASSISTANT_URL` | yes | none | Home Assistant base URL, for example `http://192.0.2.10:8123` |
| `HOME_ASSISTANT_TOKEN` | yes | none | Redacted long-lived access token; a non-admin user is enough |
| `HOME_ASSISTANT_WEATHER_ENTITY` | no | `weather.forecast_home` | Weather entity |
| `HOME_ASSISTANT_SHOPPING_ENTITY` | no | `todo.shopping_list` | To-do entity shown as the shopping list |
| `FRAME_TIMEZONE` | no | `America/New_York` | Household IANA timezone |
| `FRAME_PORT` | no | `8080` | HTTP listen port |
| `FRAME_WEB_ROOT` | no | `web/dist` | Directory holding the built SPA |
| `FRAME_BUILD_ID` | no | `index.html` fingerprint | Build id reported by `/health`; the image sets it |

Supply credentials through a root-readable environment file on the host, never through command arguments, images, repository files, or logs. Resetting the secret address in Google Calendar invalidates the old URL.

## Development

```sh
bun run --filter '@garage/frame' typecheck
bun run --filter '@garage/frame' test
bun run --filter '@garage/frame' build          # vite build + WebView 106 check
bun run --filter '@garage/frame' dev            # server on :8080 (needs the variables above)
bun run --filter '@garage/frame' dev:web        # vite on :5173, proxies /rpc to :8080
```

## Deploy

The frame server runs as a Docker container on Proxmox CT 126 (`192.168.1.147`). One command from the workstation builds and ships it; there is no registry and no CI deploy.

### One-time setup

1. Authorize the workstation's SSH key for `root@192.168.1.147` and accept its host key (`ssh root@192.168.1.147 true`). Docker reaches the remote daemon over this SSH connection.
2. Create `apps/frame/.env.prod` (gitignored) with:

   | Variable | Required |
   | --- | --- |
   | `CALENDAR_ICS_URL` | yes |
   | `HOME_ASSISTANT_URL` | yes |
   | `HOME_ASSISTANT_TOKEN` | yes |
   | `FRAME_TIMEZONE` | no |
   | `HOME_ASSISTANT_WEATHER_ENTITY` | no |
   | `HOME_ASSISTANT_SHOPPING_ENTITY` | no |

   Keep it mode `0600`.

### Ship it

```sh
bun run --filter '@garage/frame' deploy:prod
```

This runs, in order:

1. `nix eval .#garage-frame-image.imageTag`: the image tag is a build id derived from the server and SPA store paths.
2. `alchemy deploy --stage prod --env-file .env.prod --yes` with `alchemy.run.ts`:
   - `Command.Exec load-image` builds `.#garage-frame-image` and streams it into CT 126 with `docker -H ssh://root@192.168.1.147 load`. It re-runs only when the tag changes.
   - `Docker.Container frame` (named `garage-frame`) runs `garage-frame:<tag>` on port 8080 with `restart: unless-stopped` and a `/health` check. The two credentials are passed as `Redacted` values.
3. `scripts/verify-deploy.ts` polls `http://192.168.1.147:8080/health` until it reports the new build id, and fails after about two minutes.

Alchemy keeps its state in `apps/frame/.alchemy/` on the deploying workstation (gitignored). That state includes the credential values Alchemy passed to the container, so treat the directory like `.env.prod`. Deploy from the same checkout each time, or copy `.alchemy/` with it.

The image runs as UID/GID `65532`. Alchemy's `Docker.Container` has no options for a read-only root filesystem, dropped capabilities, or `no-new-privileges`, so those garage-mcp hardening flags are not applied here.

### Rollback

Check out an older commit and run `deploy:prod` again. Nix rebuilds that commit's image (usually from the store cache), and older tags remain on CT 126 until pruned.

### The frame picks up deploys by itself

The server reports its build id from `/health` and stamps it into the page it serves. The SPA polls `/health` every five minutes and reloads when the id changes. During a deploy the frame keeps showing its last data with an "Offline" marker in the rail, retries, and reloads itself if the app never mounts.

## The frame

Point the kiosk at `http://<host>:8080/`. Constraints found on the device:

- Android System WebView 106 (after replacing the stock WebView 44): no CSS nesting, `:has()`, `oklch()`, `color-mix()`, dynamic viewport units, or JavaScript APIs newer than Chrome 106.
- It rejects 4- and 8-digit hex colours, so the CSS build target is `chrome61`.
- 1280 × 800 at density 160; layouts assume that viewport and do not scroll the page.
- No Let's Encrypt root in the stock trust store, so plain HTTP on the LAN is the default.

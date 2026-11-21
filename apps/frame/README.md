# Frame

Wall dashboard for a PF1007L photo frame: Today (clock, colour-coded weather, today and tomorrow), Calendar (day and week), Shopping list with "Buy again", detail sheets for events and the weather, and an Ambient clock after idle time. One Bun process serves the SPA and an Effect RPC endpoint at `/rpc`.

The layout and type are adapted from Wes Bos's [photo-frame-dashboard](https://github.com/wesbos/photo-frame-dashboard) (MIT, © Wes Bos). No code was copied; the views were rewritten for Foldkit.

## Layout

- `src/app.ts` — shared adapter and RPC handler composition.
- `src/main.ts` — local Bun server entry point for development and preflight.
- `src/service.ts` — Alchemy `Docker.Service` entry point: bundles the server with embedded `web/dist` assets into a content-addressed Bun image and deploys it to a single-node Swarm over SSH.
- `src/server.ts` — routes: `GET /health` (readiness and build id), `POST /rpc`, `GET /media/art/<entity>` (artwork proxy for configured players), and the SPA (from disk or embedded assets) with an `index.html` fallback.
- `src/handlers.ts` — RPC handlers; map upstream failures to a credential-free `UpstreamUnavailable`.
- `src/calendar/` — Google Calendar API adapter: service-account sign-in, expanded events with their Google colours, a 5-minute cache per window, and a stale fallback.
- `src/home-assistant/` — weather, shopping list, and media adapter over Home Assistant REST; `media.ts` owns the media configuration, state mapping, and action allowlist.
- `src/shared/` — schemas and the RPC group shared with the browser (imported as `#shared`).
- `web/` — Foldkit SPA: `main.ts` (Model, update, subscriptions), `message.ts`, `command.ts`, `view.ts` (root view) and `view/` (screen and shared rendering modules).
- `scripts/check-webview-compat.ts` — fails the build if `web/dist` uses features WebView 106 lacks.
- `alchemy.run.ts`, `scripts/preflight.ts`, and `scripts/verify-deploy.ts` — the deploy.

## Configuration

| Variable | Required | Default | Purpose |
| --- | --- | --- | --- |
| `GOOGLE_CALENDAR_ID` | yes | none | Calendar ID of the family calendar (Google Calendar settings, "Integrate calendar") |
| `GOOGLE_SERVICE_ACCOUNT_KEY` | yes | none | Redacted JSON key file of a Google service account the calendar is shared with |
| `GOOGLE_CALENDAR_COLOR` | no | none | The calendar's colour as `#rrggbb`, shown for events with no label or colour of their own; without it they stay neutral |
| `HOME_ASSISTANT_URL` | yes | none | Home Assistant base URL, for example `http://192.0.2.10:8123` |
| `HOME_ASSISTANT_TOKEN` | yes | none | Redacted long-lived access token; a non-admin user is enough |
| `HOME_ASSISTANT_WEATHER_ENTITY` | no | `weather.forecast_home` | Weather entity |
| `HOME_ASSISTANT_SHOPPING_ENTITY` | no | `todo.shopping_list` | To-do entity shown as the shopping list |
| `HOME_ASSISTANT_MEDIA_PLAYERS` | no | none | Media screen cards in order, comma-separated. Each entry is `media_player.x` (controls from Home Assistant's supported features) or `media_player.x=power+volume+mute` (only these; tokens: `power`, `playback`, `volume`, `mute`, `source`). The literal `zones` places the speaker card; without it the card goes last |
| `HOME_ASSISTANT_SPEAKER_ZONES` | no | none | Comma-separated `switch.*` speaker zones shown as toggles |
| `HOME_ASSISTANT_SPEAKERS_ALL_ON` | no | none | `button.*` pressed by the speaker card's "All on" |
| `HOME_ASSISTANT_SPEAKERS_ALL_OFF` | no | none | `button.*` pressed by the speaker card's "All off" |
| `HOME_ASSISTANT_SPOTIFY_PLAYER` | no | none | `media_player.*` from Home Assistant's Spotify integration, shown as the now-playing card with a "Play on" device picker |
| `FRAME_TIMEZONE` | no | `America/New_York` | Household IANA timezone |
| `FRAME_PORT` | no | `8080` | HTTP listen port |
| `FRAME_WEB_ROOT` | no | `web/dist` | Directory holding the built SPA |
| `FRAME_BUILD_ID` | no | `index.html` fingerprint | Build id reported by `/health`; the image sets it |
| `FRAME_ENV_FILE` | no | none | Dotenv file read for every variable above that the process environment does not set; the deployed container sets it |

The server accepts media changes only for these entities and only the listed controls; anything else is refused with `MediaActionRejected`. Artwork is fetched by the server from Home Assistant's media player proxy, so the frame never needs to reach Home Assistant. An invalid media entry fails startup with `FRAME_ENV_INVALID`.

Supply credentials through the frame host's env file (see Deploy), never through command arguments, images, repository files, or logs.

### Google Calendar access

The frame reads the calendar as a Google service account, so it sees each event's colour as set in Google Calendar.

1. In a Google Cloud project, enable the Google Calendar API and create a service account. Give it no project roles.
2. Create a JSON key for the service account. Store the whole file as `GOOGLE_SERVICE_ACCOUNT_KEY`.
3. In Google Calendar, share the family calendar with the service account's email address and select "Make changes to events". Google sends `colorId` only to accounts that can change events; with "See all event details" every event arrives uncoloured. The frame still only reads, because it requests the `calendar.readonly` scope.
4. Copy the calendar ID from the calendar's "Integrate calendar" settings into `GOOGLE_CALENDAR_ID`.
5. Optionally set `GOOGLE_CALENDAR_COLOR` to the calendar's colour as Google shows it to you. Google keeps a calendar's colour per viewer, so the service account cannot read yours.

The frame colours each event as Google Calendar does: its label colour, then its classic colour, then the calendar's colour. Label and event colour changes in Google appear within five minutes.

To revoke access, delete the key in Google Cloud or remove the service account from the calendar's sharing settings.

## Development

```sh
bun run --filter '@garage/frame' typecheck
bun run --filter '@garage/frame' test
bun run --filter '@garage/frame' build          # vite build + WebView 106 check
bun run --filter '@garage/frame' dev            # server on :8080 (needs the variables above)
bun run --filter '@garage/frame' dev:web        # vite on :5173, proxies /rpc to :8080
```

## Deploy

The frame server runs as a single-node Docker Swarm service (`Docker.Service`) on a LAN Proxmox LXC with Docker. Nothing is exposed to the public internet: port 8080 stays on your LAN (for the PF1007L) and tailnet (via the host or subnet router). One command from any machine with SSH access to the host builds, checks, and ships it; there is no registry and no CI deploy.

### One-time setup

The frame host owns the server's credentials and settings. The deploying machine needs only SSH access to the host and Bun (plus Nix on Linux for the Chromium 106 preflight).

1. Authorize the deploying machine's SSH key for `root@<frame-host>` and accept its host key (`ssh root@<frame-host> true`). Docker reaches the remote daemon over this SSH connection.
2. On the frame host, write every server variable from the configuration table to `/opt/garage-frame/frame.env` in dotenv format, one `NAME=value` per line. Single-quote `GOOGLE_SERVICE_ACCOUNT_KEY` so its JSON stays verbatim, and lock permissions down to root:

   ```sh
   install -d -m 0755 /opt/garage-frame
   install -m 0440 -o root -g 65532 frame.env /opt/garage-frame/frame.env
   ```

   The server reads the file once at startup. After you edit it on the host, run `docker service update --force garage-frame` to restart the task.
3. If migrating from the older standalone `garage-frame` container, remove it once before the first Swarm deploy so port 8080 is free (`docker rm -f garage-frame`).
4. On the deploying machine, set these non-secret variables, for example in your shell profile:

   | Variable | Required | Example | Purpose |
   | --- | --- | --- | --- |
   | `FRAME_DOCKER_HOST` | yes | `ssh://root@<frame-host>` | Remote Docker host over SSH |
   | `FRAME_URL` | yes | `http://<frame-host>:8080` | URL polled by `verify-deploy.ts` |
   | `FRAME_SWARM_ADVERTISE_ADDR` | no | `eth0` or `192.168.1.50` | Interface or IP for `docker swarm init` when the host has multiple interfaces (e.g. LAN + Tailscale) |

### Preflight

```sh
bun run --filter @garage/frame preflight
```

`scripts/preflight.ts` checks the built SPA and local Bun server before anything reaches the frame. It copies the host's `/opt/garage-frame/frame.env` over SSH into a private temporary directory, which it removes on exit; this is the only time credentials reach the deploying machine. Variables set in the deploying shell override the file. It builds `.#chromium-webview-106` (Playwright's archived Chromium 106.0.5249.30, the engine of the frame's Android System WebView 106; Linux only), runs `bun run src/main.ts` locally on port 8099 against `web/dist` with that env file and the real upstreams, and drives the page over the Chrome DevTools Protocol. It fails unless the app mounts, Today, Calendar, Shopping, and Media each finish loading, and the page reports no uncaught exception or `console.error`; a failure names the check and the script errors. `deploy:prod` runs it first, so a build that breaks in WebView 106 is never deployed.

The static check in `bun run build` catches unsupported syntax and CSS early; the preflight catches runtime failures that a static scan cannot see.

### Ship it

```sh
bun run --filter '@garage/frame' deploy:prod
```

This runs, in order:

1. `bun run build`: Vite builds `web/dist` and `scripts/check-webview-compat.ts` checks WebView 106 compatibility.
2. `scripts/preflight.ts`: verifies the local Bun server + `web/dist` in headless Chromium 106.
3. `alchemy deploy --stage prod --yes` with `alchemy.run.ts` and `src/service.ts`: initializes the single-node `Docker.Swarm` on `$FRAME_DOCKER_HOST` if needed, bundles the server together with the built `web/dist` assets into a content-addressed `oven/bun:1` image directly on the remote Docker daemon (no registry and no manual `docker load`), and deploys `Docker.Service frame` (named `garage-frame`) on host port 8080 with a read-only root filesystem, `stop-first` updates with rollback on failure, and a `/health` check. It bind-mounts `/opt/garage-frame/frame.env` read-only and reads it inside the container, so neither Alchemy's arguments nor its state carry credentials.
4. `scripts/verify-deploy.ts`: polls `$FRAME_URL/health` until it reports the fingerprint of the built `web/dist/index.html`, and fails after about two minutes.

Alchemy keeps its state in `apps/frame/.alchemy/` on the deploying machine (gitignored). The state holds no credentials. A machine without state adopts the running service, because Alchemy labels the services it creates.

### Rollback

Check out an older commit and run `deploy:prod` again, or run `docker -H "$FRAME_DOCKER_HOST" service rollback garage-frame` on the host.

### The frame picks up deploys by itself

The server reports its build id from `/health` and stamps it into the page it serves. The SPA polls `/health` every five minutes and reloads when the id changes. During a deploy the frame keeps showing its last data with an "Offline" marker in the rail, retries, and reloads itself if the app never mounts.

## The frame

Point the kiosk at `http://<host>:8080/`. Constraints found on the device:

- Android System WebView 106 (after replacing the stock WebView 44): no CSS nesting, `:has()`, `oklch()`, `color-mix()`, dynamic viewport units, or JavaScript APIs newer than Chrome 106.
- It rejects 4- and 8-digit hex colours, so the CSS build target is `chrome61`.
- 1280 × 800 at density 160; layouts assume that viewport and do not scroll the page.
- No Let's Encrypt root in the stock trust store, so plain HTTP on the LAN is the default.

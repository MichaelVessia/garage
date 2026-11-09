# Frame

Wall dashboard for a PF1007L photo frame: Today (clock, colour-coded weather, today and tomorrow), Calendar (day and week), Shopping list, and an Ambient clock after idle time. One Bun process serves the SPA and an Effect RPC endpoint at `/rpc`.

The layout and type are adapted from Wes Bos's [photo-frame-dashboard](https://github.com/wesbos/photo-frame-dashboard) (MIT, © Wes Bos). No code was copied; the views were rewritten for Foldkit.

## Layout

- `src/main.ts` — composition root: configuration, adapters, Bun HTTP server.
- `src/server.ts` — routes: `GET /health` (readiness and build id), `POST /rpc`, `GET /media/art/<entity>` (artwork proxy for configured players), and the SPA with an `index.html` fallback.
- `src/handlers.ts` — RPC handlers; map upstream failures to a credential-free `UpstreamUnavailable`.
- `src/calendar/` — Google Calendar API adapter: service-account sign-in, expanded events with their Google colours, a 5-minute cache per window, and a stale fallback.
- `src/home-assistant/` — weather, shopping list, and media adapter over Home Assistant REST; `media.ts` owns the media configuration, state mapping, and action allowlist.
- `src/shared/` — schemas and the RPC group shared with the browser (imported as `#shared`).
- `web/` — Foldkit SPA: `main.ts` (Model, update, subscriptions), `message.ts`, `command.ts`, `view.ts` (root view) and `view/` (screen and shared rendering modules).
- `scripts/check-webview-compat.ts` — fails the build if `web/dist` uses features WebView 106 lacks.
- `alchemy.run.ts`, `scripts/load-image.ts`, and `scripts/verify-deploy.ts` — the deploy.

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

The frame server runs as a Docker container on a Proxmox LXC with Docker. One command from any machine with SSH access to the host builds and ships it; there is no registry and no CI deploy.

### One-time setup

The frame host owns the server's credentials and settings. The deploying machine needs only SSH access to the host and Nix, so any such machine can deploy.

1. Authorize the deploying machine's SSH key for `root@<frame-host>` and accept its host key (`ssh root@<frame-host> true`). Docker reaches the remote daemon over this SSH connection.
2. On the frame host, write every server variable from the configuration table to `/opt/garage-frame/frame.env` in dotenv format, one `NAME=value` per line. Single-quote `GOOGLE_SERVICE_ACCOUNT_KEY` so its JSON stays verbatim. The container runs as UID/GID `65532` and reads the file through a read-only bind mount, so restrict it to root and that group:

   ```sh
   install -d -m 0755 /opt/garage-frame
   install -m 0440 -o root -g 65532 frame.env /opt/garage-frame/frame.env
   ```

   Edit the file on the host to change a credential or setting, then run `deploy:prod` again or restart the container (`docker restart garage-frame`).
3. On the deploying machine, set two non-secret variables, for example in your shell profile:

   | Variable | Example |
   | --- | --- |
   | `FRAME_DOCKER_HOST` | `ssh://root@<frame-host>` |
   | `FRAME_URL` | `http://<frame-host>:8080` |

### Preflight

```sh
bun run --filter @garage/frame preflight
```

`scripts/preflight.ts` checks the exact build that would ship before anything reaches the frame. It copies the host's `/opt/garage-frame/frame.env` over SSH into a private temporary directory, which it removes on exit. It builds `.#garage-frame`, `.#garage-frame-web`, and `.#chromium-webview-106` (Playwright's archived Chromium 106.0.5249.30, the engine of the frame's Android System WebView 106; Linux only), runs the server locally on port 8099 with that env file and the real upstreams, and drives the page over the Chrome DevTools Protocol. It fails unless the app mounts, Today, Calendar, and Shopping each finish loading, and the page reports no uncaught exception or `console.error`; a failure names the check and the script errors. `deploy:prod` runs it first, so a build that breaks in WebView 106 is never deployed.

The static check in `bun run build` catches unsupported syntax and CSS early; the preflight catches runtime failures that a static scan cannot see.

### Ship it

```sh
bun run --filter '@garage/frame' deploy:prod
```

This runs, in order:

0. The preflight above.
1. `nix eval .#garage-frame-image.imageTag`: the image tag is a build id derived from the server and SPA store paths.
2. `scripts/load-image.ts` builds `.#garage-frame-image` and streams it into the host with `docker -H $FRAME_DOCKER_HOST load`, unless the host already has that tag.
3. `alchemy deploy --stage prod --yes` with `alchemy.run.ts`: `Docker.Container frame` (named `garage-frame`) runs `garage-frame:<tag>` on port 8080 with `restart: unless-stopped` and a `/health` check. It bind-mounts the host's `/opt/garage-frame/frame.env` read-only and points `FRAME_ENV_FILE` at it, so no credential passes through the deploying machine. A new tag makes Alchemy replace the container.
4. `scripts/verify-deploy.ts` polls `$FRAME_URL/health` until it reports the new build id, and fails after about two minutes.

The image is loaded before Alchemy runs, not as an Alchemy resource: an `Output`-valued `image` makes `Docker.Container` skip its diff, so a new tag would update state without replacing the running container.

Alchemy keeps its state in `apps/frame/.alchemy/` on the deploying machine (gitignored). The state holds no credentials. A machine without state adopts the running container, because Alchemy labels the containers it creates.

The image runs as UID/GID `65532`. Alchemy's `Docker.Container` has no options for a read-only root filesystem, dropped capabilities, or `no-new-privileges`, so those garage-mcp hardening flags are not applied here.

### Rollback

Check out an older commit and run `deploy:prod` again. Nix rebuilds that commit's image (usually from the store cache), and older tags remain on the host until pruned.

### The frame picks up deploys by itself

The server reports its build id from `/health` and stamps it into the page it serves. The SPA polls `/health` every five minutes and reloads when the id changes. During a deploy the frame keeps showing its last data with an "Offline" marker in the rail, retries, and reloads itself if the app never mounts.

## The frame

Point the kiosk at `http://<host>:8080/`. Constraints found on the device:

- Android System WebView 106 (after replacing the stock WebView 44): no CSS nesting, `:has()`, `oklch()`, `color-mix()`, dynamic viewport units, or JavaScript APIs newer than Chrome 106.
- It rejects 4- and 8-digit hex colours, so the CSS build target is `chrome61`.
- 1280 × 800 at density 160; layouts assume that viewport and do not scroll the page.
- No Let's Encrypt root in the stock trust store, so plain HTTP on the LAN is the default.

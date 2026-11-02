# Frame

Wall dashboard for a PF1007L photo frame: Today (clock, weather, today and tomorrow), Calendar (day and week), Shopping list, and an Ambient clock after idle time. One Bun process serves the SPA and an Effect RPC endpoint at `/rpc`.

The layout and type are adapted from Wes Bos's [photo-frame-dashboard](https://github.com/wesbos/photo-frame-dashboard) (MIT, © Wes Bos). No code was copied; the views were rewritten for Foldkit.

## Layout

- `src/main.ts` — composition root: configuration, adapters, Bun HTTP server.
- `src/server.ts` — routes: `GET /health`, `POST /rpc`, and the SPA with an `index.html` fallback.
- `src/handlers.ts` — RPC handlers; map upstream failures to a credential-free `UpstreamUnavailable`.
- `src/calendar/` — iCalendar feed adapter (5-minute cache, stale fallback) and recurrence expansion with `ical.js`.
- `src/home-assistant/` — weather and shopping list adapter over Home Assistant REST.
- `src/shared/` — schemas and the RPC group shared with the browser (imported as `#shared`).
- `web/` — Foldkit SPA: `main.ts` (Model, update, subscriptions), `message.ts`, `command.ts`, `view.ts`.
- `scripts/check-webview-compat.ts` — fails the build if `web/dist` uses features WebView 106 lacks.

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

Supply credentials through a root-readable environment file on the host, never through command arguments, images, repository files, or logs. Resetting the secret address in Google Calendar invalidates the old URL.

## Development

```sh
bun run --filter '@garage/frame' typecheck
bun run --filter '@garage/frame' test
bun run --filter '@garage/frame' build          # vite build + WebView 106 check
bun run --filter '@garage/frame' dev            # server on :8080 (needs the variables above)
bun run --filter '@garage/frame' dev:web        # vite on :5173, proxies /rpc to :8080
```

## Image

```sh
nix build .#garage-frame-image
docker load < result
docker run -d --name garage-frame --restart unless-stopped -p 8080:8080 --env-file /opt/garage-frame/frame.env garage-frame:0.0.0
```

The image runs as UID/GID `65532`, serves the SPA from the Nix store, and defines a health check on `GET /health`. The endpoint has no authentication: publish it only on the household LAN.

## The frame

Point the kiosk at `http://<host>:8080/`. Constraints found on the device:

- Android System WebView 106 (after replacing the stock WebView 44): no CSS nesting, `:has()`, `oklch()`, `color-mix()`, dynamic viewport units, or JavaScript APIs newer than Chrome 106.
- It rejects 4- and 8-digit hex colours, so the CSS build target is `chrome61`.
- 1280 × 800 at density 160; layouts assume that viewport and do not scroll the page.
- No Let's Encrypt root in the stock trust store, so plain HTTP on the LAN is the default.

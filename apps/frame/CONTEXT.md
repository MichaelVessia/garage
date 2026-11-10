# Frame

## Purpose

Frame is the household wall dashboard shown on a rooted PF1007L photo frame. One Bun process serves a Foldkit SPA and an Effect RPC endpoint that reads the family calendar and Home Assistant.

## Ubiquitous language

- **Frame**: the PF1007L display (1280 × 800, Android 6, System WebView 106) running a full-screen kiosk.
- **Family calendar**: one shared Google calendar read through the Google Calendar API as a service account it is shared with.
- **Event colour**: the colour Google Calendar shows an event in: its label colour, else its classic colour, else the calendar's colour (`GOOGLE_CALENDAR_COLOR`); events with none stay neutral.
- **Occurrence**: one expanded instance of a calendar event inside a requested window; either timed (UTC instants) or all-day (local dates, exclusive end).
- **Calendar window**: a local-date range, `to` exclusive, resolved to instants in the frame timezone.
- **Frame timezone**: the household IANA timezone the server owns; it places all-day events, floating times, and "today".
- **Upcoming**: the occurrences from today through the next few days, used by the Today and Ambient screens.
- **Ambient**: the dim full-screen clock shown after idle time, sooner at night; any touch wakes the frame.
- **Shopping list**: the Home Assistant `todo` entity whose items can be checked off from the frame.
- **Buy again**: completed shopping list items, grouped by name and ranked by how often they appear; tapping one reopens its completed entry instead of adding a duplicate.
- **Detail sheet**: the sheet that opens over a screen with more about one event or the weather; tapping outside it, Close, or dimming to Ambient dismisses it.
- **Media card**: one configured Home Assistant media player, or the speaker zone card, on the Media screen.
- **Media action**: one allowlisted change (power, playback, volume, mute, source, zone toggle, all-zones button) the frame may request for a configured entity.

## Responsibilities

- Fetch the family calendar feed, cache it briefly, fall back to the last good copy, and expand recurrences, exceptions, cancellations, all-day events, and time zones into occurrences.
- Read current weather with its details (feels like, humidity, wind, UV) and the hourly and daily forecasts from Home Assistant; an integration without an hourly forecast still shows the rest.
- Read and update shopping list items in Home Assistant.
- Read configured media players, speaker zones, and an optional Spotify player; run allowlisted media actions; proxy their artwork.
- Serve the SPA, RPC, and a readiness endpoint from one process.
- Render the Today, Calendar (day and week), Shopping, Media, and Ambient screens and the detail sheets for touch use at 1280 × 800. Every event, the weather card, day headings, and card titles open more detail or the matching calendar day.

## Non-responsibilities

- It does not write to the calendar, model people or presence, or authenticate users; it is a LAN service for one display.
- It does not manage the frame device, its kiosk APK, or its Android settings.
- It does not persist data; upstream systems are the sources of truth.

## Invariants

- Credentials never reach the browser, logs, spans, or error messages; RPC failures carry a fixed `UpstreamUnavailable` message.
- Media actions are accepted only for configured entities and allowed controls; artwork is proxied only for configured players, from Home Assistant's media player proxy path.
- Calendar fixtures are synthetic.
- Built assets stay within Chromium 106 JavaScript and the CSS the frame's WebView accepts.
- `/health` reports the build id the page was stamped with; the frame reloads when it changes.

## Boundaries and dependencies

External systems are Google Calendar (the Calendar API through `@distilled.cloud/google-workspace`, signed in with a service account key) and Home Assistant REST. Alchemy (`alchemy.run.ts`) deploys the Nix-built image to a Docker host over SSH. `src/calendar/` and `src/home-assistant/` each own one adapter; `src/handlers.ts` maps them to the shared RPC contract in `src/shared/`; `src/main.ts` composes configuration, adapters, and the Bun server.

## References

- [Frame README](README.md)
- Evidence: `src/`, `web/`, `scripts/`, and tests.

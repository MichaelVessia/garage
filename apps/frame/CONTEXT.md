# Frame

## Purpose

Frame is the household wall dashboard shown on a rooted PF1007L photo frame. One Bun process serves a Foldkit SPA and an Effect RPC endpoint that reads the family calendar and Home Assistant.

## Ubiquitous language

- **Frame**: the PF1007L display (1280 × 800, Android 6, System WebView 106) running a full-screen kiosk.
- **Family calendar**: one shared Google calendar read from its secret iCalendar address.
- **Occurrence**: one expanded instance of a calendar event inside a requested window; either timed (UTC instants) or all-day (local dates, exclusive end).
- **Calendar window**: a local-date range, `to` exclusive, resolved to instants in the frame timezone.
- **Frame timezone**: the household IANA timezone the server owns; it places all-day events, floating times, and "today".
- **Upcoming**: the occurrences from today through the next few days, used by the Today and Ambient screens.
- **Ambient**: the dim full-screen clock shown after idle time, sooner at night; any touch wakes the frame.
- **Shopping list**: the Home Assistant `todo` entity whose items can be checked off from the frame.

## Responsibilities

- Fetch the family calendar feed, cache it briefly, fall back to the last good copy, and expand recurrences, exceptions, cancellations, all-day events, and time zones into occurrences.
- Read current weather and the daily forecast from Home Assistant.
- Read and update shopping list items in Home Assistant.
- Serve the SPA, RPC, and a readiness endpoint from one process.
- Render the Today, Calendar (day and week), Shopping, and Ambient screens for touch use at 1280 × 800.

## Non-responsibilities

- It does not write to the calendar, model people or presence, or authenticate users; it is a LAN service for one display.
- It does not manage the frame device, its kiosk APK, or its Android settings.
- It does not persist data; upstream systems are the sources of truth.

## Invariants

- Credentials never reach the browser, logs, spans, or error messages; RPC failures carry a fixed `UpstreamUnavailable` message.
- Calendar fixtures are synthetic.
- Built assets stay within Chromium 106 JavaScript and the CSS the frame's WebView accepts.

## Boundaries and dependencies

External systems are Google Calendar (secret iCalendar URL over HTTPS) and Home Assistant REST. `src/calendar/` and `src/home-assistant/` each own one adapter; `src/handlers.ts` maps them to the shared RPC contract in `src/shared/`; `src/main.ts` composes configuration, adapters, and the Bun server.

## References

- [Frame README](README.md)
- Evidence: `src/`, `web/`, `scripts/`, and tests.

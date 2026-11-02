# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

Two adults in one household. They glance at the frame from 1 to 3 metres while cooking or passing through the kitchen, and touch it up close now and then to page the calendar, check off or add shopping items, or control home media.

## Product Purpose

Frame is the household's wall dashboard on a rooted 10-inch photo frame in the kitchen. It answers "what time is it and what is happening today" from across the room, and gives quick touch access to the family calendar, the shopping list, and home media. Success means the clock and today's events are readable at a glance without walking up to it, and every touch action works on the first tap.

## Operating Context

- Mounted on or near the kitchen counter, landscape, viewed while standing and moving; hands may be busy or wet.
- Always on. After idle time, and sooner at night, it switches to a dim ambient clock; a tap wakes it.
- Data comes from the family Google calendar (one shared calendar, no per-person colours), Home Assistant weather, the Home Assistant shopping list, and Home Assistant media players, speaker zones, and Spotify.
- Updates ship over the network and the page reloads itself; the device is rarely touched for maintenance.

## Capabilities and Constraints

- Screens: Today, Calendar (day and week), Shopping (check off, add with the on-screen keyboard), Media (power, playback, volume, mute, source; speaker zones; Spotify now playing and "play on"), and an ambient clock.
- Display: 1280 × 800 CSS pixels at density 160, landscape, touch only (no hover, no keyboard except the Android on-screen keyboard).
- Engine: Android System WebView 106 on a 1 GB Android 6 device. No CSS nesting, `:has()`, `oklch()`, `color-mix()`, dynamic viewport units, 4/8-digit hex colours, or JS APIs newer than Chrome 106; `bun run build` and the Chromium 106 preflight enforce this. Keep rendering and animation light.
- The Android on-screen keyboard covers the lower half of the screen while typing.
- Fonts must be self-hosted; the frame cannot reach the internet.

## Brand Commitments

- Standing preference (2026-11-01): the category standard for family wall dashboards, executed at the craft level of Skylight / Hearth family calendars and Home Assistant's newer dashboards (tile cards, sections). No invented visual world; distinction comes from finish, alignment, and readability.
- Layout and type were originally adapted from Wes Bos's MIT photo-frame-dashboard; nothing about that look is binding.

## Evidence on Hand

Real calendar, weather, shopping, and media data come only from the household's own services at runtime. Fixtures and screenshots in the repository must stay synthetic.

## Product Principles

- Glanceable first: time and today's events win the space and contrast; everything else yields.
- One tap, obvious result: every control is large, labelled, and shows its new state at once.
- Calm in the kitchen: no motion or colour that pulls attention without a reason.
- Honest status: unavailable, offline, or loading states read as such, never as empty.

## Accessibility & Inclusion

Readable at 1 to 3 metres for adult eyes; strong contrast in both a bright kitchen and at night.

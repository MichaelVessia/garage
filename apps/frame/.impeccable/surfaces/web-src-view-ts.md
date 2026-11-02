---
version: 1
slug: "web-src-view-ts"
primary_target: "web/src/view.ts"
related_targets: ["web/src/index.css"]
---

# Frame wall dashboard (all screens)

Scope: the whole SPA in `apps/frame/web` (Today, Calendar, Shopping, Media, ambient). Mode: Operate. Build path: code-led.

Audience and job: two adults in the kitchen read the time and today's events from 1 to 3 m; up close they page the calendar, check off or add shopping items, and control media. Constraints: 1280 × 800 at density 160, touch only, Android System WebView 106, 1 GB RAM, self-hosted fonts.

## Direction contract

THESIS: The family wall dashboard as its category ships it at its best (Skylight / Hearth for the calendar, Home Assistant's newer dashboards for controls), refusing the current cream-and-serif poster look and every invented world.

OWN-WORLD: Cool neutral ground, white cards with one soft offset shadow, a single indigo accent reserved for now/next and selection, green/amber/red only for state. One self-hosted UI grotesk with tabular numerals at four sizes. Line icons from one set. Light by day, dark at night.

STORY: From across the kitchen the visitor reads the time, the date, the next event and how long until it, and the weather. Up close they switch screens from a labelled icon rail and act with one tap.

FIRST VIEWPORT: Left rail 104 px, icon over label, active item filled accent. Content on a 12-column grid, 24 px gutters and outer padding. Top band: clock at display size with date beneath (columns 1–7); current weather and a 4-day strip (columns 8–12). Lower band: Today agenda card (columns 1–7) with the next event as an accent-tinted row and a time-until badge, all-day items as chips; Tomorrow card and shopping summary card stacked (columns 8–12).

FORM: category standard (canon), chosen on the re-roll round; benchmarks Skylight / Hearth and Home Assistant dashboards. seed: none (unavailable)

FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance

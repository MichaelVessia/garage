---
name: Frame
description: The household's kitchen wall dashboard, readable from across the room and operable with one tap.
colors:
  ground: "#f3f4f6"
  card: "#ffffff"
  rail: "#ffffff"
  ink: "#14171c"
  ink-2: "#5b6270"
  line: "#e4e7ec"
  sunken: "#eef0f3"
  accent: "#4f5bd5"
  accent-ink: "#3b46b8"
  accent-tint: "#eceefd"
  on-accent: "#ffffff"
  good: "#1f8a4c"
  good-tint: "#e2f3e9"
  bad: "#c2332b"
  ground-night: "#0e1014"
  card-night: "#191c22"
  rail-night: "#14161b"
  ink-night: "#eef0f3"
  ink-2-night: "#a3a9b6"
  line-night: "#2a2e37"
  sunken-night: "#22262e"
  accent-night: "#5e69e0"
  accent-ink-night: "#a9b0ff"
  accent-tint-night: "#252a4a"
  good-night: "#4cc27f"
  good-tint-night: "#1c3326"
  bad-night: "#f07a71"
  ambient-ground: "#050608"
  ambient-time: "#e3e5ea"
  ambient-ink: "#c9ccd3"
  ambient-muted: "#8b909b"
typography:
  ambient-clock:
    fontFamily: "'Figtree Variable', 'Roboto', system-ui, sans-serif"
    fontSize: "200px"
    fontWeight: 600
    lineHeight: 0.95
  display:
    fontFamily: "'Figtree Variable', 'Roboto', system-ui, sans-serif"
    fontSize: "152px"
    fontWeight: 600
    lineHeight: 0.92
  headline:
    fontFamily: "'Figtree Variable', 'Roboto', system-ui, sans-serif"
    fontSize: "64px"
    fontWeight: 600
    lineHeight: 1
    letterSpacing: "-0.02em"
  emphasis:
    fontFamily: "'Figtree Variable', 'Roboto', system-ui, sans-serif"
    fontSize: "36px"
    fontWeight: 700
    letterSpacing: "-0.01em"
  title:
    fontFamily: "'Figtree Variable', 'Roboto', system-ui, sans-serif"
    fontSize: "30px"
    fontWeight: 700
    lineHeight: 1.15
    letterSpacing: "-0.01em"
  body:
    fontFamily: "'Figtree Variable', 'Roboto', system-ui, sans-serif"
    fontSize: "22px"
    fontWeight: 400
    lineHeight: 1.3
  body-strong:
    fontFamily: "'Figtree Variable', 'Roboto', system-ui, sans-serif"
    fontSize: "22px"
    fontWeight: 600
    lineHeight: 1.3
  label:
    fontFamily: "'Figtree Variable', 'Roboto', system-ui, sans-serif"
    fontSize: "16px"
    fontWeight: 600
    lineHeight: 1.3
  numeric:
    fontFamily: "'Figtree Variable', 'Roboto', system-ui, sans-serif"
    fontSize: "22px"
    fontWeight: 600
    fontFeature: "tnum"
rounded:
  ev: "10px"
  sm: "12px"
  md: "16px"
  pill: "28px"
  full: "50%"
spacing:
  xs: "4px"
  sm: "8px"
  md: "12px"
  lg: "16px"
  gap: "24px"
  rail: "104px"
  control: "56px"
  media-row: "208px"
components:
  rail-item:
    textColor: "{colors.ink-2}"
    rounded: "{rounded.md}"
    size: "88px"
  rail-item-active:
    backgroundColor: "{colors.accent}"
    textColor: "{colors.on-accent}"
    rounded: "{rounded.md}"
    size: "88px"
  card:
    backgroundColor: "{colors.card}"
    textColor: "{colors.ink}"
    rounded: "{rounded.md}"
    padding: "24px"
  button:
    backgroundColor: "{colors.sunken}"
    textColor: "{colors.ink}"
    typography: "{typography.body-strong}"
    rounded: "{rounded.pill}"
    padding: "0 22px"
    height: "56px"
  button-primary:
    backgroundColor: "{colors.ink}"
    textColor: "{colors.card}"
    typography: "{typography.body-strong}"
    rounded: "{rounded.pill}"
    padding: "0 22px"
    height: "56px"
  icon-button:
    backgroundColor: "{colors.sunken}"
    textColor: "{colors.ink}"
    rounded: "{rounded.full}"
    size: "56px"
  icon-button-on:
    backgroundColor: "{colors.good-tint}"
    textColor: "{colors.good}"
    rounded: "{rounded.full}"
    size: "56px"
  field:
    backgroundColor: "{colors.card}"
    textColor: "{colors.ink}"
    typography: "{typography.body}"
    rounded: "{rounded.sm}"
    padding: "0 18px"
    height: "56px"
  segmented-item-active:
    backgroundColor: "{colors.card}"
    textColor: "{colors.ink}"
    typography: "{typography.body-strong}"
    rounded: "24px"
    padding: "0 20px"
    height: "48px"
  chip:
    backgroundColor: "{colors.sunken}"
    textColor: "{colors.ink}"
    rounded: "22px"
    padding: "0 16px"
    height: "44px"
  count:
    backgroundColor: "{colors.sunken}"
    textColor: "{colors.ink}"
    rounded: "20px"
    padding: "0 12px"
    height: "40px"
  badge-until:
    backgroundColor: "{colors.accent}"
    textColor: "{colors.on-accent}"
    typography: "{typography.label}"
    rounded: "18px"
    padding: "0 14px"
    height: "36px"
  agenda-row-next:
    backgroundColor: "{colors.accent-tint}"
    textColor: "{colors.ink}"
    rounded: "{rounded.sm}"
    padding: "14px 16px"
  week-event:
    textColor: "{colors.ink}"
    typography: "{typography.label}"
    rounded: "{rounded.ev}"
    padding: "8px 10px"
  week-event-now:
    backgroundColor: "{colors.accent-tint}"
    textColor: "{colors.ink}"
    rounded: "{rounded.ev}"
    padding: "8px 10px"
  shopping-row:
    textColor: "{colors.ink}"
    rounded: "{rounded.sm}"
    padding: "0 12px"
    height: "64px"
  media-tile:
    backgroundColor: "{colors.card}"
    textColor: "{colors.ink}"
    rounded: "{rounded.md}"
    padding: "24px"
    height: "208px"
  switch:
    backgroundColor: "{colors.sunken}"
    textColor: "{colors.ink}"
    rounded: "{rounded.sm}"
    padding: "0 16px 0 20px"
    height: "64px"
---

# Design System: Frame

## Overview

**Creative North Star: "The Kitchen Wall, Done Properly"**

Frame is the family wall dashboard as its category ships it at its best: Skylight and Hearth for the calendar, Home Assistant's newer tile dashboards for controls. It invents no world. Its distinction is finish: a cool neutral ground, white cards that lift slightly, one grotesk at a few large sizes, line icons from one set, and a single indigo accent that marks only what is happening now or next, or what is selected. By day the frame is light. At night it turns dark, and after idle time it falls to a near-black ambient clock.

Density is low because the reader is 1 to 3 metres away. The clock and today's agenda take the most space and the most contrast. Everything else yields. Every control is a large, labelled touch target that shows its new state at once, because there is no hover and no keyboard.

The screen is a fixed 1280 × 800 canvas inside Android System WebView 106. That engine sets hard limits on the CSS the system may use; they are rules, not preferences.

**Key Characteristics:**
- Cool grey ground, white cards, flat dark cards at night.
- One indigo accent, only for now, next, and selection.
- Green for "on" and "done", red only for "offline". No other state hues.
- Figtree Variable at 16, 22, 30 px for UI, plus the clock sizes.
- Fixed-width digits wherever a number changes in place.
- Lucide line icons, 24 px grid, 2 px stroke.
- Fixed 104 px rail plus a 12-column grid with 24 px gutters and padding.

## Colors

A cool, low-chroma neutral palette with one indigo accent and two state colours, defined twice: a light day theme on `:root` and a dark night theme on `.theme-dark`. The tokens keep the same names in both themes; the frontmatter lists the night values with a `-night` suffix.

### Primary
- **Kitchen Indigo** (`accent`): the active rail item, today's date in the week view, and the time-until badge. It is a fill, with white text on it.
- **Deep Indigo Ink** (`accent-ink`): text in the accent family on a light surface, such as the time of the next event or today's weekday name. At night it inverts to a pale periwinkle (`accent-ink-night`) so it reads on dark cards.
- **Indigo Wash** (`accent-tint`): the background of the next agenda row and of the current event in the week view.

### Secondary
- **Pantry Green** (`good`, `good-tint`): state only. A device that is on, a player that is playing, a checked shopping item, a switch that is on. The tint fills icon circles; the solid fills a playing tile icon, a checked box, and a switch track.
- **Signal Red** (`bad`): only the rail's "Offline" status.

### Neutral
- **Cool Ground** (`ground`): the stage behind the cards.
- **Card White** (`card`) and **Rail White** (`rail`): card and rail surfaces. At night the rail is darker than the cards so the cards still read as the top layer.
- **Ink** (`ink`): primary text and the filled primary control.
- **Slate** (`ink-2`): secondary text, times of non-next events, inactive rail items, past items.
- **Hairline** (`line`): row dividers, field borders, week-column rules, pressed state for sunken controls.
- **Sunken Grey** (`sunken`): chips, counts, round buttons, forecast days, switches, and the empty album-art well.
- **Ambient** (`ambient-ground`, `ambient-time`, `ambient-ink`, `ambient-muted`): the ambient clock only. It is darker than the night theme and borrows `accent-ink-night` for the next event's time.

### Named Rules
**The Now-and-Next Rule.** Indigo marks only what is happening now, what comes next, and what is selected. It is never decoration, never a heading colour, never a second button style.

**The State-Only Rule.** Green means on, playing, or done. Red means offline. A colour that is not one of these states stays neutral. There are no per-person or per-calendar colours.

**The Six-Digit Rule.** Colours are 6-digit hex or `rgba()`. WebView 106 cannot use `oklch()`, `color-mix()`, or 4- and 8-digit hex.

## Typography

**Display Font:** Figtree Variable (with Roboto, system-ui, sans-serif)
**Body Font:** Figtree Variable
**Label/Mono Font:** none; numbers use Figtree with tabular figures

**Character:** One friendly, open grotesk, self-hosted because the frame cannot reach the internet. Hierarchy comes from size and weight (400 to 700), not from a second family.

### Hierarchy
- **Ambient clock** (600, 200 px, 0.95): the ambient screen's time.
- **Display** (600, 152 px, 0.92): the Today screen's clock. The meridiem sits beside it at 30 px in Slate.
- **Headline** (600, 64 px, 1): current temperature.
- **Emphasis** (700, 36 px): the next event's title on the Today card only.
- **Title** (700, 30 px): screen titles, the now-playing title, the date under the clock (600, Slate), and Today rows at 30 px.
- **Body** (400 to 650, 22 px, 1.3): card titles (650), rows, chips (550), shopping items (550), buttons, fields. 22 px is the floor for anything read from across the room.
- **Label** (600 to 650, 16 px): rail labels, weekday names, forecast, locations, statuses, week-view events, group titles. Read up close only.

### Named Rules
**The Steady Clock Rule.** Clock digits are Figtree's proportional figures, each in a fixed-width box (0.6 em per digit, 0.28 em for the colon). The time does not shift as minutes change, and the "1" keeps its plain form.

**The Tabular Numbers Rule.** Every other changing number (event times, counts, temperatures, volume, the until-badge, week dates) uses `font-variant-numeric: tabular-nums`.

**The Four-Size Rule.** UI text uses 16, 22, and 30 px. The 36, 64, 152, and 200 px sizes have one job each. Do not add sizes between them.

## Layout

The stage is a fixed 1280 × 800 grid: a 104 px rail, then the content view with 24 px padding. Content uses 12 equal columns with 24 px gutters (about 72 px columns). Spacing steps are 4, 8, 12, 16, and 24 px; 24 px (`gap`) separates cards and screen sections.

- **Today:** a 216 px top band, then the remainder. The clock takes columns 1 to 7 and the weather card columns 8 to 12. Below, the Today card takes columns 1 to 7; the Tomorrow card and a 152 px shopping card stack in columns 8 to 12.
- **Calendar, Shopping, Media:** a 56 px toolbar (screen title, navigation, segmented control), then one scrolling card or grid that fills the rest.
- **Media:** a 12-column grid with fixed 208 px rows. Three rows and two gutters fill the 672 px area exactly. Scrolling snaps to row starts (`scroll-snap-type: y mandatory`) and the scrollbar is hidden. Now-playing and speaker zones span all 12 columns; device tiles span 6, and an odd last tile spans 12.
- **Shopping:** two columns of 64 px rows with an 8 px by 24 px gap; the add form is 552 px wide at the top so the on-screen keyboard does not cover it.

Text that can overflow truncates with an ellipsis on one line; week-view titles clamp at three lines. Nothing scrolls the page itself.

### Named Rules
**The Fixed Canvas Rule.** Design for exactly 1280 × 800 CSS pixels. Use `height: 100%` and absolute insets, never `dvh`, `svh`, or `lvh`.

**The Whole Row Rule.** A scrolling grid shows whole rows. Fix the row height so rows and gutters fill the area exactly, and snap to row starts.

## Elevation & Depth

By day, cards lift off the cool ground with one soft, two-layer shadow. At night, shadows vanish and a 1 px hairline ring defines each card instead, because shadows are invisible on a dark ground. Inside cards, depth is tonal: Sunken Grey wells sit below the card surface. The rail is separated by a 1 px hairline, not a shadow.

### Shadow Vocabulary
- **Day card** (`box-shadow: 0 1px 2px rgba(16, 24, 40, 0.06), 0 6px 16px rgba(16, 24, 40, 0.06)`): every card and the active segmented item.
- **Night edge** (`box-shadow: 0 0 0 1px #2a2e37`): the same elements at night, in place of the day card shadow.
- **Switch thumb** (`box-shadow: 0 1px 3px rgba(16, 24, 40, 0.3)`): the switch thumb only.

### Named Rules
**The One Lift Rule.** There is one elevation level. Cards sit on the ground; nothing floats above a card.

## Shapes

Soft, consistent corners. Cards and rail items use 16 px. Inner surfaces (fields, rows, forecast days, album art, switches, shopping rows) use 12 px. Week-view events use 10 px. Everything a finger presses that is not a row is a full pill or a circle: 56 px round buttons, 56 px pill buttons, pill chips, counts, badges, and the segmented control. Row dividers are 1 px inset shadows, not borders, so they do not change row height.

## Components

### Rail
- **Character:** a labelled icon rail, Home Assistant style.
- **Shape:** 88 px square items with 16 px corners, icon (28 px) over a 16 px label, in a 104 px column with 8 px between items.
- **States:** inactive is Slate on the rail; pressed fills Sunken Grey; active fills Kitchen Indigo with white icon and label.
- **Footer:** the rail ends with a small clock (22 px time over a 16 px meridiem) and, when the frame is offline, a red "Offline" status above it.

### Buttons
- **Shape:** 56 px tall pills (28 px radius) or 56 px circles.
- **Default:** Sunken Grey with Ink text, 22 px at 600, 24 px icon with 8 px gap.
- **Primary:** Ink fill with card-coloured text (the shopping "Add" button, a playing control). It inverts at night.
- **On:** a round button for a device that is on uses Green Wash with green icon.
- **Pressed:** `:active` darkens to Hairline (Slate for primary). There is no hover.
- **Disabled:** 40% opacity.

### Segmented control
- A Sunken Grey pill with 4 px inset; items are 48 px tall, at least 96 px wide. The active item is a card-coloured pill with the card shadow and Ink text; inactive items are Slate.

### Chips
- **Style:** 44 px Sunken Grey pills, 22 px text at 550, one line with ellipsis. They carry all-day events above the timed rows.
- **Count:** a 40 px Sunken Grey pill with a tabular number, beside card and screen titles.
- **Until badge:** a 36 px indigo pill (44 px and 22 px text on the Today card) with white text such as "in 1 h 32 min". It appears only on the next event.

### Cards / Containers
- **Corner Style:** 16 px.
- **Background:** Card White (night: Card Night).
- **Shadow Strategy:** day card shadow by day, night edge at night.
- **Internal Padding:** 24 px. The card title is 22 px at 650.

### Agenda rows
- **Layout:** a grid of time, title over location, and an optional badge, baseline-aligned, with 1 px hairline dividers. Time columns are 112 px, or 168 px on the Today card where time and title grow to 30 px.
- **Next:** the next event bleeds 16 px past the card padding into a 12 px rounded Indigo Wash band with Deep Indigo time; on the Today card its title grows to 36 px at 700.
- **Past:** time and title turn Slate.
- **Overflow:** a "+N more" text button in Slate opens the calendar.

### Calendar week and day
- **Week:** one card split into 7 equal columns by 1 px hairlines. Each head is 88 px with a 16 px weekday over a 44 px date circle; today fills the circle indigo and tints the weekday Deep Indigo. Events are 10 px rounded boxes with a hairline ring, 16 px time over a three-line 16 px title. All-day events are Sunken Grey, the current event is Indigo Wash, and past events drop to 55% opacity.
- **Day:** agenda rows in one card, with chips above. An empty day shows a plain Slate notice.

### Inputs / Fields
- **Style:** 56 px tall, 12 px corners, 1 px hairline border, card background, 22 px text, indigo caret.
- **Focus:** the border turns Kitchen Indigo.
- **Select:** same field with a drawn Slate chevron at the right.

### Shopping rows
- **Style:** 64 px rows in two columns, 12 px corners, a 36 px round check ring (2 px Slate) before a 22 px name at 550.
- **Done:** the ring fills green with a white check; the name turns Slate with a strike-through. Done items group under a 16 px "Done · N" heading.
- **Pressed:** the row fills Sunken Grey.

### Media tiles
- **Now playing:** full-width card with 160 px album art (12 px corners; a Sunken Grey well with a music icon when empty), a 30 px title, a 22 px Slate artist line, round transport controls, and a "Play on" speaker select.
- **Device tile:** a card in a fixed 208 px row, a 56 px round icon well, a 22 px name over a 16 px status, an optional 200 px source select, and a row of round controls. On: green-tint icon well and green status. Playing: solid green well. Unavailable: name and icon at 50% opacity.
- **Speaker zones:** a full-width card with three 64 px switches per row; each switch is a Sunken Grey bar with a 56 × 32 px track that turns green when on, with the thumb sliding 24 px (160 ms ease-out).

### Ambient clock
- A near-black full-screen layer above the stage: the 200 px clock with a 36 px meridiem, the date at 30 px, the next event at 30 px (time in periwinkle, "Now" when current), and the weather at 22 px with a 28 px icon. All non-time text is Ambient Muted. A tap wakes the frame.

### Icons
- Lucide line icons (lucide-static, ISC), drawn on a 24 px grid with a 2 px round-capped stroke in `currentColor`, inlined as SVG. Default 28 px; 24 px in buttons and forecast; 56 px for weather; 48 px in the empty art well. Icons are decorative; the control carries the accessible name.

## Do's and Don'ts

### Do:
- **Do** keep indigo for now, next, and selection only (the Now-and-Next Rule).
- **Do** give every changing number tabular figures, and put clock digits in fixed-width boxes (0.6 em digits, 0.28 em colon).
- **Do** make touch targets at least 56 px (44 px for chips and text buttons) and show the pressed state with `:active`.
- **Do** define every themed colour as a custom property in both `:root` and `.theme-dark`, and replace the day card shadow with the 1 px night edge.
- **Do** place cards on the 12-column, 24 px grid and use the 4, 8, 12, 16, 24 px spacing steps.
- **Do** truncate overflowing text with an ellipsis and keep the page itself from scrolling.
- **Do** use only synthetic events, items, and devices in fixtures and screenshots.

### Don't:
- **Don't** use CSS nesting, `:has()`, `oklch()`, `color-mix()`, `dvh`/`svh`/`lvh`, 4- or 8-digit hex, or JavaScript APIs newer than Chrome 106. The WebView 106 build check rejects them.
- **Don't** load fonts or icons from the network. The frame is offline; Figtree is self-hosted and icons are inline SVG.
- **Don't** add per-person or per-calendar colours, or state colours other than green and red.
- **Don't** add text smaller than 16 px, or put information meant for across the room below 22 px.
- **Don't** rely on hover or keyboard focus for any state; the frame is touch only.
- **Don't** animate anything except short state transitions (160 ms ease-out), and keep rendering light for the 1 GB device.
- **Don't** add a second elevation level or a shadow at night.

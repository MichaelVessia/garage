import * as Arr from 'effect/Array'
import * as DateTime from 'effect/DateTime'
import * as Function from 'effect/Function'
import type * as Option from 'effect/Option'
import * as Str from 'effect/String'
import type { Html, HtmlBuilder } from 'foldkit/html'

import type { CalendarEvent, EventColor, IanaTimezone } from '#shared'

import { icon } from '../icons.js'
import { Message } from '../message.js'
import { formatTime, hasEnded, isAllDay, isHappening, isTimed } from '../time.js'

export type H = HtmlBuilder<Message>

export const eventTime: {
  (timezone: IanaTimezone): (event: CalendarEvent) => string
  (event: CalendarEvent, timezone: IanaTimezone): string
} = Function.dual(2, (event: CalendarEvent, timezone: IanaTimezone): string =>
  isAllDay(event) ? 'All day' : formatTime(event.start, timezone)
)

// The first timed event that has not ended yet: the one the kitchen needs to see.
export const nextTimed: {
  (now: DateTime.DateTime): (events: ReadonlyArray<CalendarEvent>) => Option.Option<CalendarEvent>
  (events: ReadonlyArray<CalendarEvent>, now: DateTime.DateTime): Option.Option<CalendarEvent>
} = Function.dual(2, (events: ReadonlyArray<CalendarEvent>, now: DateTime.DateTime): Option.Option<CalendarEvent> =>
  Arr.findFirst(events, (event): boolean => isTimed(event) && !hasEnded(event, now))
)

// "Now", "in 18 min", "in 1 h 18 min", "in 18 h", "in 3 days".
export const untilLabel: {
  (now: DateTime.DateTime): (event: CalendarEvent) => string
  (event: CalendarEvent, now: DateTime.DateTime): string
} = Function.dual(2, (event: CalendarEvent, now: DateTime.DateTime): string => {
  if (isHappening(event, now) || !isTimed(event)) {
    return 'Now'
  }

  const minutes = Math.max(1, Math.round((DateTime.toEpochMillis(event.start) - DateTime.toEpochMillis(now)) / 60_000))
  const hours = Math.floor(minutes / 60)
  const rest = minutes % 60

  if (hours === 0) {
    return `in ${rest} min`
  }

  if (hours < 6) {
    return rest === 0 ? `in ${hours} h` : `in ${hours} h ${rest} min`
  }

  return hours < 48 ? `in ${hours} h` : `in ${Math.round(hours / 24)} days`
})

// Each digit sits in a fixed-width box, so the clock does not shift as the minutes change.
export const viewClockDigits: {
  (time: string): (h: H) => ReadonlyArray<Html>
  (h: H, time: string): ReadonlyArray<Html>
} = Function.dual(2, (h: H, time: string): ReadonlyArray<Html> =>
  // oxlint-disable-next-line typescript/no-misused-spread -- a clock string is ASCII digits and a colon
  Arr.map([...time], (character) => h.span([h.Class(character === ':' ? 'clock-colon' : 'clock-digit')], [character]))
)

export const classes = (...names: ReadonlyArray<string | false>): string =>
  Arr.join(
    Arr.filter(names, (name): name is string => name !== false && name !== ''),
    ' '
  )

export const viewNotice: {
  (text: string): (h: H) => Html
  (h: H, text: string): Html
} = Function.dual(2, (h: H, text: string): Html => h.p([h.Class('notice')], [text]))

const WHITE = '#ffffff'
const INK = '#14171c'

// WCAG 2 relative luminance of a `#rrggbb` colour.
const luminance = (color: string): number => {
  const channel = (offset: number): number => {
    const value = Number.parseInt(Str.slice(offset, offset + 2)(color), 16) / 255

    return value <= 0.03928 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4
  }

  return 0.2126 * channel(1) + 0.7152 * channel(3) + 0.0722 * channel(5)
}

const contrast = (a: string, b: string): number =>
  (Math.max(luminance(a), luminance(b)) + 0.05) / (Math.min(luminance(a), luminance(b)) + 0.05)

/** White or Ink, whichever reads better on a Google event colour. */
const inkOn = (color: EventColor): string => (contrast(color, WHITE) >= contrast(color, INK) ? WHITE : INK)

/** The class that marks an event Google Calendar shows in a colour. */
export const colorClass = (event: CalendarEvent): string | false => event.color !== null && 'is-coloured'

/** Paints an element in its event's Google Calendar colour; uncoloured events stay neutral. */
export const colorAttributes: {
  (event: CalendarEvent): (h: H) => ReadonlyArray<ReturnType<H['Style']>>
  (h: H, event: CalendarEvent): ReadonlyArray<ReturnType<H['Style']>>
} = Function.dual(2, (h: H, event: CalendarEvent): ReadonlyArray<ReturnType<H['Style']>> =>
  event.color === null ? [] : [h.Style({ '--ev': event.color, '--on-ev': inkOn(event.color) })]
)

interface Sheet {
  readonly title: string
  readonly className: string
  readonly body: ReadonlyArray<Html>
  readonly actions: ReadonlyArray<Html>
}

/** A sheet over the screen with more about one thing; tapping outside it or Close dismisses it. */
export const viewSheet: {
  (sheet: Sheet): (h: H) => Html
  (h: H, sheet: Sheet): Html
} = Function.dual(2, (h: H, sheet: Sheet): Html =>
  h.div(
    [h.Class('sheet-layer')],
    [
      h.button([h.Class('sheet-scrim'), h.Type('button'), h.AriaLabel('Close'), h.OnClick(Message.ClosedDetail())], []),
      h.section(
        [h.Class(`sheet ${sheet.className}`), h.Role('dialog'), h.AriaLabel(sheet.title)],
        [
          h.header(
            [h.Class('sheet-head')],
            [
              h.h2([h.Class('sheet-title')], [sheet.title]),
              h.button(
                [h.Class('icon-btn'), h.Type('button'), h.AriaLabel('Close'), h.OnClick(Message.ClosedDetail())],
                [icon(h, 'close')]
              ),
            ]
          ),
          h.div([h.Class('sheet-body')], sheet.body),
          ...(Arr.isReadonlyArrayNonEmpty(sheet.actions) ? [h.footer([h.Class('sheet-actions')], sheet.actions)] : []),
        ]
      ),
    ]
  )
)

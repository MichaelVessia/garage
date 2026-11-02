import * as Arr from 'effect/Array'
import type * as DateTime from 'effect/DateTime'
import * as Function from 'effect/Function'
import type * as Option from 'effect/Option'
import type { Html, HtmlBuilder } from 'foldkit/html'

import type { CalendarEvent, IanaTimezone } from '#shared'

import type { Message } from '../message.js'
import { formatTime, hasEnded, isAllDay, isTimed } from '../time.js'

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

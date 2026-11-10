import * as Arr from 'effect/Array'
import * as DateTime from 'effect/DateTime'
import * as Function from 'effect/Function'
import * as Match from 'effect/Match'
import type { Html } from 'foldkit/html'

import { addCalendarDays, calendarDateOf } from '#shared'
import type { AllDayEvent, CalendarDate, CalendarEvent, IanaTimezone, TimedEvent } from '#shared'

import { icon } from '../icons.js'
import { Message } from '../message.js'
import { formatTime, hasEnded, isHappening, monthDay, weekdayName } from '../time.js'
import type { H } from './shared.js'
import { classes, colorAttributes, colorClass, untilLabel, viewSheet } from './shared.js'

const dayLabel = (date: CalendarDate): string => `${weekdayName(date)}, ${monthDay(date)}`

// "1 h 30 min", "45 min", "2 h".
const durationLabel = (event: TimedEvent): string => {
  const minutes = Math.round((DateTime.toEpochMillis(event.end) - DateTime.toEpochMillis(event.start)) / 60_000)
  const hours = Math.floor(minutes / 60)
  const rest = minutes % 60

  return Arr.join(
    Arr.filter([hours > 0 ? `${hours} h` : '', rest > 0 ? `${rest} min` : ''], (part) => part !== ''),
    ' '
  )
}

const whenTimed = (event: TimedEvent, timezone: IanaTimezone): ReadonlyArray<string> => {
  const startDate = calendarDateOf(event.start, timezone)
  const endDate = calendarDateOf(event.end, timezone)

  const range =
    startDate === endDate
      ? `${formatTime(event.start, timezone)} – ${formatTime(event.end, timezone)}`
      : `${formatTime(event.start, timezone)} – ${dayLabel(endDate)}, ${formatTime(event.end, timezone)}`

  return [dayLabel(startDate), `${range} · ${durationLabel(event)}`]
}

// All-day events end on an exclusive date, so the last day shown is the one before it.
const whenAllDay = (event: AllDayEvent): ReadonlyArray<string> => {
  const last = addCalendarDays(event.endDate, -1)

  return last <= event.startDate
    ? [dayLabel(event.startDate), 'All day']
    : [`${dayLabel(event.startDate)} – ${dayLabel(last)}`, 'All day']
}

const firstDay = (event: CalendarEvent, timezone: IanaTimezone): CalendarDate =>
  Match.valueTags(event, {
    TimedEvent: (timed) => calendarDateOf(timed.start, timezone),
    AllDayEvent: (allDay) => allDay.startDate,
  })

const statusLabel = (event: CalendarEvent, now: DateTime.DateTime): ReadonlyArray<string> => {
  if (hasEnded(event, now)) {
    return ['Ended']
  }

  return Match.valueTags(event, {
    TimedEvent: (timed) =>
      isHappening(timed, now) || DateTime.isGreaterThan(timed.start, now) ? [untilLabel(timed, now)] : [],
    AllDayEvent: () => [],
  })
}

const viewEventSheet = (h: H, event: CalendarEvent, timezone: IanaTimezone, now: DateTime.DateTime) => {
  const [date, time] = Match.valueTags(event, {
    TimedEvent: (timed) => whenTimed(timed, timezone),
    AllDayEvent: whenAllDay,
  })

  return [
    h.div(
      [h.Class(classes('ev-head', colorClass(event))), ...colorAttributes(h, event)],
      [
        h.p([h.Class('ev-title')], [event.title]),
        ...Arr.map(statusLabel(event, now), (status) => h.span([h.Class('badge num')], [status])),
      ]
    ),
    h.div(
      [h.Class('ev-facts')],
      [
        h.div(
          [h.Class('ev-fact')],
          [
            icon(h, 'calendar', 'ev-icon'),
            h.span([h.Class('ev-lines')], [h.span([h.Class('ev-strong')], [date ?? '']), h.span([], [time ?? ''])]),
          ]
        ),
        ...Arr.map(Arr.fromNullishOr(event.location), (location) =>
          h.div([h.Class('ev-fact')], [icon(h, 'place', 'ev-icon'), h.span([h.Class('ev-strong')], [location])])
        ),
      ]
    ),
    ...Arr.map(Arr.fromNullishOr(event.description), (description) => h.p([h.Class('ev-notes')], [description])),
  ]
}

export const viewEventDetail: {
  (event: CalendarEvent, timezone: IanaTimezone, now: DateTime.DateTime): (h: H) => Html
  (h: H, event: CalendarEvent, timezone: IanaTimezone, now: DateTime.DateTime): Html
} = Function.dual(4, (h: H, event: CalendarEvent, timezone: IanaTimezone, now: DateTime.DateTime): Html =>
  viewSheet(h, {
    title: 'Event',
    className: 'sheet-event',
    body: viewEventSheet(h, event, timezone, now),
    actions: [
      h.button(
        [
          h.Class('btn'),
          h.Type('button'),
          h.OnClick(Message.ClickedDate({ date: firstDay(event, timezone), mode: 'day' })),
        ],
        [icon(h, 'calendar'), 'Open day']
      ),
    ],
  })
)

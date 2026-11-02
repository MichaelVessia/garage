import * as Arr from 'effect/Array'
import * as DateTime from 'effect/DateTime'
import * as Function from 'effect/Function'
import * as Option from 'effect/Option'
import type { Html } from 'foldkit/html'

import { addCalendarDays, calendarDateOf } from '#shared'
import type { CalendarDate, CalendarEvent, IanaTimezone } from '#shared'

import { icon } from '../icons.js'
import type { IconName } from '../icons.js'
import { calendarFrom } from '../main.js'
import type { Model } from '../main.js'
import { Message } from '../message.js'
import {
  clockParts,
  dayOfMonth,
  formatTime,
  hasEnded,
  isAllDay,
  isHappening,
  isTimed,
  monthDay,
  occursOn,
  today,
  weekdayName,
  weekdayShort,
} from '../time.js'
import type { H } from './shared.js'
import { classes, eventTime, nextTimed, viewClockDigits, viewNotice } from './shared.js'
import { viewShoppingSummary } from './shopping.js'
import { viewWeather } from './weather.js'

const eventsOn = (events: ReadonlyArray<CalendarEvent>, date: CalendarDate, timezone: IanaTimezone) =>
  Arr.filter(events, (event) => occursOn(event, date, timezone))

// "Now", "in 18 min", "in 1 h 18 min", "in 18 h", "in 3 days".
const untilLabel = (event: CalendarEvent, now: DateTime.DateTime): string => {
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
}

// The colour picked for the event in Google Calendar; uncoloured events keep the neutral mark.
const colorClass = (event: CalendarEvent): string | false => event.color !== null && `is-coloured ev-${event.color}`

const viewChip = (h: H, event: CalendarEvent) =>
  h.li([h.Key(event.id), h.Class(classes('chip', colorClass(event)))], [h.span([h.Class('chip-text')], [event.title])])

const viewEventRow = (
  h: H,
  event: CalendarEvent,
  timezone: IanaTimezone,
  now: DateTime.DateTime,
  options: { readonly isNext: boolean; readonly day: Option.Option<string> }
) =>
  h.li(
    [
      h.Key(event.id),
      h.Class(classes('row', colorClass(event), options.isNext && 'is-next', hasEnded(event, now) && 'is-past')),
    ],
    [
      h.span([h.Class('row-time num')], [eventTime(event, timezone)]),
      h.span(
        [h.Class('row-main')],
        [
          h.span([h.Class('row-title')], [event.title]),
          ...Arr.map(
            Arr.filter([Option.getOrNull(options.day), event.location], (part): part is string => part !== null),
            (part) => h.span([h.Class('row-where')], [part])
          ),
        ]
      ),
      ...(options.isNext ? [h.span([h.Class('badge num')], [untilLabel(event, now)])] : []),
    ]
  )

const viewChips = (h: H, events: ReadonlyArray<CalendarEvent>) =>
  Arr.isReadonlyArrayNonEmpty(events)
    ? [
        h.ul(
          [h.Class('chips')],
          Arr.map(events, (event) => viewChip(h, event))
        ),
      ]
    : []

const viewMore = (h: H, hidden: number) =>
  hidden > 0
    ? [
        h.button(
          [h.Class('more'), h.Type('button'), h.OnClick(Message.ClickedScreen({ screen: 'calendar' }))],
          [`+${hidden} more`]
        ),
      ]
    : []

// Timed rows that fit the card: upcoming first, then the latest past ones while space remains.
// "+n more" counts only upcoming rows that did not fit; past rows that do not fit are simply left out.
const visibleRows = (timed: ReadonlyArray<CalendarEvent>, now: DateTime.DateTime, budget: number) => {
  const upcoming = Arr.filter(timed, (event) => !hasEnded(event, now))
  const past = Arr.filter(timed, (event) => hasEnded(event, now))
  const room = Math.max(1, budget)

  const shown =
    upcoming.length >= room ? Arr.take(upcoming, room) : [...Arr.takeRight(past, room - upcoming.length), ...upcoming]

  return { shown, hidden: Math.max(0, upcoming.length - room) }
}

// A full day's agenda for the calendar's day view: all-day chips, then every timed row.
const viewAgenda = (
  h: H,
  items: ReadonlyArray<CalendarEvent>,
  timezone: IanaTimezone,
  now: DateTime.DateTime,
  options: { readonly markNext: boolean; readonly empty: string }
) => {
  const allDay = Arr.filter(items, (event) => isAllDay(event))
  const timed = Arr.filter(items, (event) => isTimed(event))
  const next = options.markNext ? Option.map(nextTimed(timed, now), (event) => event.id) : Option.none<string>()

  return [
    ...viewChips(h, allDay),
    ...(Arr.isReadonlyArrayNonEmpty(timed)
      ? [
          h.ul(
            [h.Class('rows')],
            Arr.map(timed, (event) =>
              viewEventRow(h, event, timezone, now, { isNext: Option.contains(next, event.id), day: Option.none() })
            )
          ),
        ]
      : [viewNotice(h, Arr.isReadonlyArrayNonEmpty(allDay) ? 'No timed events' : options.empty)]),
    ...(options.markNext && Arr.isReadonlyArrayNonEmpty(timed) && Option.isNone(next)
      ? [viewNotice(h, 'Nothing else today')]
      : []),
  ]
}

// ============================================
// Today
// ============================================

// Today: the next event always shows, even when it falls on a later day.
const viewTodayAgenda = (
  h: H,
  events: ReadonlyArray<CalendarEvent>,
  timezone: IanaTimezone,
  now: DateTime.DateTime
) => {
  const date = today(now, timezone)
  const items = eventsOn(events, date, timezone)
  const allDay = Arr.filter(items, (event) => isAllDay(event))
  const timed = Arr.filter(items, (event) => isTimed(event))
  const nextToday = nextTimed(timed, now)

  const nextLater = Option.isNone(nextToday)
    ? Arr.findFirst(
        Arr.filter(events, isTimed),
        (event): boolean => !hasEnded(event, now) && !occursOn(event, date, timezone)
      )
    : Option.none()

  const budget = 4 - (Arr.isReadonlyArrayNonEmpty(allDay) ? 1 : 0)
  // Once nothing remains today, the past rows give way to the next event on a later day.
  const { shown, hidden } = Option.isSome(nextToday) ? visibleRows(timed, now, budget) : { shown: [], hidden: 0 }
  const nextId = Option.map(nextToday, (event) => event.id)

  return [
    ...viewChips(h, allDay),
    ...(Arr.isReadonlyArrayNonEmpty(shown)
      ? [
          h.ul(
            [h.Class('rows')],
            Arr.map(shown, (event) =>
              viewEventRow(h, event, timezone, now, { isNext: Option.contains(nextId, event.id), day: Option.none() })
            )
          ),
        ]
      : []),
    ...viewMore(h, hidden),
    ...(Option.isNone(nextToday) ? [viewNotice(h, 'Nothing else today')] : []),
    ...Arr.map(Arr.fromOption(nextLater), (event) =>
      h.ul(
        [h.Class('rows')],
        [
          viewEventRow(h, event, timezone, now, {
            isNext: true,
            day: Option.some(
              occursOn(event, addCalendarDays(date, 1), timezone)
                ? 'Tomorrow'
                : weekdayName(calendarDateOf(event.start, timezone))
            ),
          }),
        ]
      )
    ),
  ]
}

const viewTomorrowAgenda = (
  h: H,
  events: ReadonlyArray<CalendarEvent>,
  timezone: IanaTimezone,
  now: DateTime.DateTime
) => {
  const items = eventsOn(events, addCalendarDays(today(now, timezone), 1), timezone)
  const allDay = Arr.filter(items, (event) => isAllDay(event))
  const timed = Arr.filter(items, (event) => isTimed(event))
  const { shown, hidden } = visibleRows(timed, now, Arr.isReadonlyArrayNonEmpty(allDay) ? 2 : 3)

  if (!Arr.isReadonlyArrayNonEmpty(items)) {
    return [viewNotice(h, 'Nothing planned')]
  }

  return [
    ...viewChips(h, allDay),
    h.ul(
      [h.Class('rows')],
      Arr.map(shown, (event) => viewEventRow(h, event, timezone, now, { isNext: false, day: Option.none() }))
    ),
    ...viewMore(h, hidden),
  ]
}

const viewCalendarCard = (
  h: H,
  model: Model,
  options: { readonly title: string; readonly className: string },
  body: (events: ReadonlyArray<CalendarEvent>) => ReadonlyArray<Html>
) =>
  h.section(
    [h.Class(`card ${options.className}`)],
    [
      h.h2([h.Class('card-title')], [options.title]),
      ...Option.match(model.upcoming.data, {
        onNone: () => [viewNotice(h, model.upcoming.failed ? 'Calendar unavailable' : 'Loading calendar…')],
        onSome: body,
      }),
    ]
  )

export const viewToday: {
  (model: Model, timezone: IanaTimezone): (h: H) => Html
  (h: H, model: Model, timezone: IanaTimezone): Html
} = Function.dual(3, (h: H, model: Model, timezone: IanaTimezone): Html => {
  const date = today(model.now, timezone)
  const tomorrow = addCalendarDays(date, 1)
  const { time, meridiem } = clockParts(model.now, timezone)

  return h.div(
    [h.Class('today')],
    [
      h.section(
        [h.Class('t-clock')],
        [
          h.div([h.Class('t-time')], [...viewClockDigits(h, time), h.span([h.Class('t-meridiem')], [meridiem])]),
          h.div([h.Class('t-date')], [`${weekdayName(date)}, ${monthDay(date)}`]),
        ]
      ),
      viewWeather(h, model),
      viewCalendarCard(h, model, { title: 'Today', className: 't-today' }, (events) =>
        viewTodayAgenda(h, events, timezone, model.now)
      ),
      h.div(
        [h.Class('t-side')],
        [
          viewCalendarCard(
            h,
            model,
            { title: `Tomorrow · ${weekdayName(tomorrow)}`, className: 't-tomorrow' },
            (events) => viewTomorrowAgenda(h, events, timezone, model.now)
          ),
          viewShoppingSummary(h, model),
        ]
      ),
    ]
  )
})

// ============================================
// Calendar
// ============================================

const iconButton = (h: H, name: IconName, label: string, message: Message) =>
  h.button([h.Class('icon-btn'), h.Type('button'), h.AriaLabel(label), h.OnClick(message)], [icon(h, name)])

const viewCalendarHeader = (h: H, model: Model, anchor: CalendarDate) => {
  const from = calendarFrom(model.calendarMode, anchor)

  const title =
    model.calendarMode === 'week'
      ? `${monthDay(from)} – ${monthDay(addCalendarDays(from, 6))}`
      : `${weekdayName(anchor)}, ${monthDay(anchor)}`

  return h.header(
    [h.Class('toolbar')],
    [
      h.div(
        [h.Class('toolbar-nav')],
        [
          iconButton(h, 'chevronLeft', 'Previous', Message.ClickedShift({ direction: -1 })),
          h.button([h.Class('btn'), h.Type('button'), h.OnClick(Message.ClickedToday())], ['Today']),
          iconButton(h, 'chevronRight', 'Next', Message.ClickedShift({ direction: 1 })),
        ]
      ),
      h.h1([h.Class('screen-title')], [title]),
      h.div(
        [h.Class('seg'), h.Role('group'), h.AriaLabel('View')],
        Arr.map(['day', 'week'] as const, (mode) =>
          h.button(
            [
              h.Key(mode),
              h.Type('button'),
              h.Class(model.calendarMode === mode ? 'seg-item is-active' : 'seg-item'),
              h.AriaPressed(model.calendarMode === mode ? 'true' : 'false'),
              h.OnClick(Message.ClickedCalendarMode({ mode })),
            ],
            [mode === 'day' ? 'Day' : 'Week']
          )
        )
      ),
    ]
  )
}

const viewWeekEvent = (h: H, event: CalendarEvent, timezone: IanaTimezone, now: DateTime.DateTime) =>
  h.li(
    [
      h.Key(event.id),
      h.Class(
        classes(
          'wk-ev',
          colorClass(event),
          isAllDay(event) && 'is-allday',
          isHappening(event, now) && 'is-now',
          hasEnded(event, now) && 'is-past'
        )
      ),
    ],
    [
      ...(isTimed(event) ? [h.span([h.Class('wk-time num')], [formatTime(event.start, timezone)])] : []),
      h.span([h.Class('wk-title')], [event.title]),
    ]
  )

const viewWeekColumn = (
  h: H,
  model: Model,
  events: ReadonlyArray<CalendarEvent>,
  date: CalendarDate,
  timezone: IanaTimezone
) => {
  const items = eventsOn(events, date, timezone)
  const ordered = [...Arr.filter(items, (event) => isAllDay(event)), ...Arr.filter(items, (event) => isTimed(event))]

  return h.section(
    [h.Key(date), h.Class(date === today(model.now, timezone) ? 'wk-day is-today' : 'wk-day')],
    [
      h.div(
        [h.Class('wk-head')],
        [
          h.span([h.Class('wk-name')], [weekdayShort(date)]),
          h.span([h.Class('wk-date num')], [String(dayOfMonth(date))]),
        ]
      ),
      h.ul(
        [h.Class('wk-list')],
        Arr.map(ordered, (event) => viewWeekEvent(h, event, timezone, model.now))
      ),
    ]
  )
}

const viewCalendarBody = (h: H, model: Model, anchor: CalendarDate, timezone: IanaTimezone) =>
  Option.match(model.week.data, {
    onNone: () =>
      h.div(
        [h.Class('card cal-body')],
        [viewNotice(h, model.week.failed ? 'Calendar unavailable' : 'Loading calendar…')]
      ),
    onSome: (events) =>
      model.calendarMode === 'day'
        ? h.div(
            [h.Class('card cal-day')],
            viewAgenda(h, eventsOn(events, anchor, timezone), timezone, model.now, {
              markNext: anchor === today(model.now, timezone),
              empty: 'Nothing scheduled',
            })
          )
        : h.div(
            [h.Class('card cal-body cal-week')],
            Arr.map(
              Arr.makeBy(7, (offset) => addCalendarDays(calendarFrom('week', anchor), offset)),
              (date) => viewWeekColumn(h, model, events, date, timezone)
            )
          ),
  })

export const viewCalendar: {
  (model: Model, timezone: IanaTimezone): (h: H) => Html
  (h: H, model: Model, timezone: IanaTimezone): Html
} = Function.dual(3, (h: H, model: Model, timezone: IanaTimezone): Html =>
  Option.match(model.anchor, {
    onNone: () => viewNotice(h, 'Loading calendar…'),
    onSome: (anchor) =>
      h.div(
        [h.Class('screen cal')],
        [viewCalendarHeader(h, model, anchor), viewCalendarBody(h, model, anchor, timezone)]
      ),
  })
)

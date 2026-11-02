import * as Arr from 'effect/Array'
import * as DateTime from 'effect/DateTime'
import * as Match from 'effect/Match'
import * as Option from 'effect/Option'
import type { Html, HtmlBuilder } from 'foldkit/html'

import { addCalendarDays, calendarDateOf } from '#shared'
import type {
  CalendarDate,
  CalendarEvent,
  ForecastDay,
  IanaTimezone,
  MediaAction,
  MediaCard,
  MediaPlayer,
  MediaPlayerStatus,
  ShoppingItem,
  SpeakerZones,
  Weather,
} from '#shared'

import { icon } from './icons.js'
import type { IconName } from './icons.js'
import { calendarFrom } from './main.js'
import type { Model } from './main.js'
import { Message } from './message.js'
import type { Screen } from './message.js'
import {
  clockParts,
  dayOfMonth,
  formatTime,
  hasEnded,
  isAllDay,
  isDarkHour,
  isHappening,
  isTimed,
  monthDay,
  occursOn,
  today,
  weekdayName,
  weekdayShort,
} from './time.js'

type H = HtmlBuilder<Message>

// Home Assistant weather condition values, their display labels, and icons.
const CONDITIONS: ReadonlyArray<readonly [string, string, IconName]> = [
  ['clear-night', 'Clear', 'moon'],
  ['cloudy', 'Cloudy', 'cloud'],
  ['exceptional', 'Unusual', 'cloud'],
  ['fog', 'Fog', 'fog'],
  ['hail', 'Hail', 'snow'],
  ['lightning', 'Storms', 'storm'],
  ['lightning-rainy', 'Storms', 'storm'],
  ['partlycloudy', 'Partly cloudy', 'partlyCloudy'],
  ['pouring', 'Heavy rain', 'rain'],
  ['rainy', 'Rain', 'rain'],
  ['snowy', 'Snow', 'snow'],
  ['snowy-rainy', 'Sleet', 'drizzle'],
  ['sunny', 'Sunny', 'sun'],
  ['windy', 'Windy', 'wind'],
  ['windy-variant', 'Windy', 'wind'],
]

const condition = (value: string) => Arr.findFirst(CONDITIONS, ([key]) => key === value)

const conditionLabel = (value: string): string =>
  Option.getOrElse(
    Option.map(condition(value), ([, label]) => label),
    () => value
  )

const conditionIcon = (value: string): IconName =>
  Option.getOrElse(
    Option.map(condition(value), (entry) => entry[2]),
    (): IconName => 'cloud'
  )

const degrees = (value: Option.Option<number>): string =>
  Option.match(value, { onNone: () => '–', onSome: (degree) => `${Math.round(degree)}°` })

const eventsOn = (events: ReadonlyArray<CalendarEvent>, date: CalendarDate, timezone: IanaTimezone) =>
  Arr.filter(events, (event) => occursOn(event, date, timezone))

const eventTime = (event: CalendarEvent, timezone: IanaTimezone): string =>
  isAllDay(event) ? 'All day' : formatTime(event.start, timezone)

// The first timed event that has not ended yet: the one the kitchen needs to see.
const nextTimed = (events: ReadonlyArray<CalendarEvent>, now: DateTime.DateTime) =>
  Arr.findFirst(events, (event): boolean => isTimed(event) && !hasEnded(event, now))

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

// Each digit sits in a fixed-width box, so the clock does not shift as the minutes change.
const viewClockDigits = (h: H, time: string): ReadonlyArray<Html> =>
  // oxlint-disable-next-line typescript/no-misused-spread -- a clock string is ASCII digits and a colon
  Arr.map([...time], (character) => h.span([h.Class(character === ':' ? 'clock-colon' : 'clock-digit')], [character]))

const classes = (...names: ReadonlyArray<string | false>): string =>
  names.filter((name): name is string => name !== false && name !== '').join(' ')

// The colour picked for the event in Google Calendar; uncoloured events keep the neutral mark.
const colorClass = (event: CalendarEvent): string | false => event.color !== null && `ev-${event.color}`

// ============================================
// Shared pieces
// ============================================

const viewNotice = (h: H, text: string) => h.p([h.Class('notice')], [text])

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
// Rail
// ============================================

const RAIL: ReadonlyArray<readonly [Screen, string, IconName]> = [
  ['today', 'Today', 'today'],
  ['calendar', 'Calendar', 'calendar'],
  ['shopping', 'Shopping', 'shopping'],
  ['media', 'Media', 'media'],
]

const viewRail = (h: H, model: Model) =>
  h.nav(
    [h.Class('rail'), h.AriaLabel('Screens')],
    [
      ...Arr.map(RAIL, ([screen, label, name]) =>
        h.button(
          [
            h.Key(screen),
            h.Class(model.screen === screen ? 'rail-item is-active' : 'rail-item'),
            h.AriaPressed(model.screen === screen ? 'true' : 'false'),
            h.OnClick(Message.ClickedScreen({ screen })),
          ],
          [icon(h, name, 'rail-icon'), h.span([h.Class('rail-label')], [label])]
        )
      ),
      h.div([h.Class('rail-fill')], []),
      ...(model.isOffline
        ? [h.div([h.Class('rail-offline'), h.Role('status')], [icon(h, 'offline', 'rail-icon'), 'Offline'])]
        : []),
      h.div(
        [h.Class('rail-clock')],
        Option.match(model.timezone, {
          onNone: () => [],
          onSome: (timezone) => {
            const { time, meridiem } = clockParts(model.now, timezone)
            return [h.b([], viewClockDigits(h, time)), h.span([], [meridiem])]
          },
        })
      ),
    ]
  )

// ============================================
// Today
// ============================================

const viewForecastDay = (h: H, day: ForecastDay) =>
  h.li(
    [h.Key(day.date), h.Class('fc-day')],
    [
      h.span([h.Class('fc-name')], [weekdayShort(day.date)]),
      icon(h, conditionIcon(day.condition), 'fc-icon'),
      h.span(
        [h.Class('fc-temp num')],
        [
          h.b([], [degrees(Option.fromNullishOr(day.high))]),
          h.span([h.Class('fc-low')], [degrees(Option.fromNullishOr(day.low))]),
        ]
      ),
    ]
  )

const viewWeather = (h: H, model: Model) =>
  h.section(
    [h.Class('card t-weather')],
    Option.match(model.weather.data, {
      onNone: () => [viewNotice(h, model.weather.failed ? 'Weather unavailable' : 'Loading weather…')],
      onSome: (weather: Weather) => {
        const first = Arr.head(weather.forecast)
        return [
          h.div(
            [h.Class('wx-now')],
            [
              icon(h, conditionIcon(weather.condition), 'wx-icon'),
              h.span([h.Class('wx-temp num')], [degrees(Option.fromNullishOr(weather.temperature))]),
              h.span(
                [h.Class('wx-cond')],
                [
                  h.span([h.Class('wx-label')], [conditionLabel(weather.condition)]),
                  ...Arr.map(Arr.fromOption(first), (day) =>
                    h.span(
                      [h.Class('wx-range num')],
                      [`H ${degrees(Option.fromNullishOr(day.high))}  L ${degrees(Option.fromNullishOr(day.low))}`]
                    )
                  ),
                ]
              ),
            ]
          ),
          h.ul(
            [h.Class('fc')],
            Arr.map(Arr.take(Arr.drop(weather.forecast, 1), 4), (day) => viewForecastDay(h, day))
          ),
        ]
      },
    })
  )

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

const viewShoppingSummary = (h: H, model: Model) => {
  const open = Option.map(model.shopping.data, (items) => Arr.filter(items, (item) => item.status === 'needs_action'))
  return h.button(
    [h.Class('card t-shopping'), h.OnClick(Message.ClickedScreen({ screen: 'shopping' }))],
    [
      h.span(
        [h.Class('t-shopping-head')],
        [
          h.span([h.Class('card-title')], ['Shopping']),
          h.span(
            [h.Class('count num')],
            [Option.match(open, { onNone: () => '–', onSome: (items) => String(items.length) })]
          ),
        ]
      ),
      h.span(
        [h.Class('t-shopping-preview')],
        [
          Option.match(open, {
            onNone: () => (model.shopping.failed ? 'Shopping list unavailable' : 'Loading shopping list…'),
            onSome: (items) =>
              Arr.isReadonlyArrayNonEmpty(items)
                ? Arr.map(Arr.take(items, 3), (item) => item.summary).join(', ') +
                  (items.length > 3 ? ` and ${items.length - 3} more` : '')
                : 'Nothing to buy',
          }),
        ]
      ),
    ]
  )
}

const viewToday = (h: H, model: Model, timezone: IanaTimezone) => {
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
}

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

const viewCalendar = (h: H, model: Model, timezone: IanaTimezone) =>
  Option.match(model.anchor, {
    onNone: () => viewNotice(h, 'Loading calendar…'),
    onSome: (anchor) =>
      h.div(
        [h.Class('screen cal')],
        [viewCalendarHeader(h, model, anchor), viewCalendarBody(h, model, anchor, timezone)]
      ),
  })

// ============================================
// Shopping
// ============================================

const viewShoppingItem = (h: H, item: ShoppingItem) => {
  const done = item.status === 'completed'
  return h.li(
    [h.Key(item.uid)],
    [
      h.button(
        [
          h.Type('button'),
          h.Class(done ? 'shop-item is-done' : 'shop-item'),
          h.AriaPressed(done ? 'true' : 'false'),
          h.OnClick(Message.ClickedShoppingItem({ uid: item.uid, status: done ? 'needs_action' : 'completed' })),
        ],
        [
          h.span([h.Class('check')], done ? [icon(h, 'check', 'check-icon')] : []),
          h.span([h.Class('shop-name')], [item.summary]),
        ]
      ),
    ]
  )
}

const viewShoppingAdd = (h: H, model: Model) =>
  h.form(
    [h.Class('shop-add'), h.OnSubmit(Message.SubmittedShoppingItem())],
    [
      h.input([
        h.Class('field'),
        h.Type('text'),
        h.AriaLabel('New item'),
        h.Placeholder('Add an item'),
        h.Value(model.shoppingDraft),
        h.OnInput((value) => Message.ChangedShoppingDraft({ value })),
      ]),
      h.button([h.Class('btn btn-primary'), h.Type('submit')], [icon(h, 'plus'), 'Add']),
    ]
  )

const viewShoppingList = (h: H, items: ReadonlyArray<ShoppingItem>) => {
  const open = Arr.filter(items, (item) => item.status === 'needs_action')
  const done = Arr.take(
    Arr.filter(items, (item) => item.status === 'completed'),
    12
  )
  if (!Arr.isReadonlyArrayNonEmpty(items)) {
    return [viewNotice(h, 'The list is empty. Add an item above or from Home Assistant.')]
  }
  return [
    ...(Arr.isReadonlyArrayNonEmpty(open)
      ? [
          h.ul(
            [h.Class('shop-grid')],
            Arr.map(open, (item) => viewShoppingItem(h, item))
          ),
        ]
      : [viewNotice(h, 'Everything is checked off')]),
    ...(Arr.isReadonlyArrayNonEmpty(done)
      ? [
          h.h2([h.Class('group-title')], [`Done · ${done.length}`]),
          h.ul(
            [h.Class('shop-grid')],
            Arr.map(done, (item) => viewShoppingItem(h, item))
          ),
        ]
      : []),
  ]
}

const viewShopping = (h: H, model: Model) => {
  const openCount = Option.map(
    model.shopping.data,
    (items) => Arr.filter(items, (item) => item.status === 'needs_action').length
  )
  return h.div(
    [h.Class('screen shop')],
    [
      h.header(
        [h.Class('toolbar')],
        [
          h.h1(
            [h.Class('screen-title')],
            [
              'Shopping list',
              ...Arr.map(Arr.fromOption(openCount), (count) => h.span([h.Class('count num')], [String(count)])),
            ]
          ),
          viewShoppingAdd(h, model),
        ]
      ),
      h.div(
        [h.Class('card shop-body')],
        Option.match(model.shopping.data, {
          onNone: () => [viewNotice(h, model.shopping.failed ? 'Shopping list unavailable' : 'Loading shopping list…')],
          onSome: (items) => viewShoppingList(h, items),
        })
      ),
    ]
  )
}

// ============================================
// Media
// ============================================

const STATUS_LABEL = {
  off: 'Off',
  on: 'On',
  idle: 'Idle',
  playing: 'Playing',
  paused: 'Paused',
  unavailable: 'Not available',
} satisfies Record<MediaPlayerStatus, string>

const mediaButton = (
  h: H,
  name: IconName,
  label: string,
  action: MediaAction,
  options: { readonly isDisabled: boolean; readonly state?: 'on' | 'pressed' | 'primary' }
) =>
  h.button(
    [
      h.Class(options.state === undefined ? 'icon-btn' : `icon-btn is-${options.state}`),
      h.Type('button'),
      h.AriaLabel(label),
      h.Disabled(options.isDisabled),
      h.OnClick(Message.ClickedMediaAction({ action })),
    ],
    [icon(h, name)]
  )

// A native select: Android shows its own picker, which suits a touch screen.
const viewSourceSelect = (h: H, label: string, placeholder: string, player: MediaPlayer, isDisabled: boolean) =>
  h.select(
    [
      h.Class('field source'),
      h.AriaLabel(label),
      h.Disabled(isDisabled),
      h.OnChange((source) =>
        // The placeholder option has no source to select.
        source === ''
          ? Message.Interacted()
          : Message.ClickedMediaAction({ action: { _tag: 'SelectSource', entityId: player.entityId, source } })
      ),
    ],
    [
      h.option([h.Value(''), h.Selected(player.source === null)], [placeholder]),
      ...Arr.map(player.sources, (source) =>
        h.option([h.Value(source), h.Selected(player.source === source)], [source])
      ),
    ]
  )

const viewSourcePicker = (h: H, label: string, player: MediaPlayer, isDisabled: boolean) =>
  h.label(
    [h.Class('picker')],
    [h.span([h.Class('picker-label')], [label]), viewSourceSelect(h, label, 'Choose a speaker', player, isDisabled)]
  )

const viewPlayerControls = (h: H, player: MediaPlayer, isDisabled: boolean) => {
  const { entityId } = player
  const has = (control: MediaPlayer['controls'][number]) => player.controls.includes(control)
  const isPlaying = player.status === 'playing'
  const isOn = player.status !== 'off' && player.status !== 'unavailable'
  const transport = [
    ...(has('power')
      ? [
          isOn
            ? mediaButton(h, 'power', 'Turn off', { _tag: 'TurnOff', entityId }, { isDisabled, state: 'on' })
            : mediaButton(h, 'power', 'Turn on', { _tag: 'TurnOn', entityId }, { isDisabled }),
        ]
      : []),
    ...(has('playback')
      ? [
          ...(player.canSkip
            ? [mediaButton(h, 'previous', 'Previous', { _tag: 'PreviousTrack', entityId }, { isDisabled })]
            : []),
          isPlaying
            ? mediaButton(h, 'pause', 'Pause', { _tag: 'PlayPause', entityId }, { isDisabled, state: 'on' })
            : mediaButton(h, 'play', 'Play', { _tag: 'PlayPause', entityId }, { isDisabled }),
          ...(player.canSkip ? [mediaButton(h, 'next', 'Next', { _tag: 'NextTrack', entityId }, { isDisabled })] : []),
        ]
      : []),
  ]
  const volume = [
    ...(has('volume')
      ? [
          mediaButton(h, 'volumeDown', 'Volume down', { _tag: 'VolumeDown', entityId }, { isDisabled }),
          mediaButton(h, 'volumeUp', 'Volume up', { _tag: 'VolumeUp', entityId }, { isDisabled }),
        ]
      : []),
    ...(has('mute')
      ? [
          player.isMuted
            ? mediaButton(
                h,
                'muted',
                'Unmute',
                { _tag: 'SetMute', entityId, muted: false },
                { isDisabled, state: 'pressed' }
              )
            : mediaButton(h, 'muted', 'Mute', { _tag: 'SetMute', entityId, muted: true }, { isDisabled }),
        ]
      : []),
  ]
  return h.div([h.Class('controls')], [...transport, ...volume])
}

const volumeLabel = (player: MediaPlayer): ReadonlyArray<string> =>
  player.volume === null || !player.controls.includes('volume') ? [] : [` · ${Math.round(player.volume * 100)}%`]

const deviceIcon = (player: MediaPlayer): IconName => {
  const name = `${player.entityId} ${player.name}`.toLowerCase()
  if (name.includes('tv')) {
    return 'media'
  }
  return name.includes('receiver') || name.includes('onkyo') ? 'receiver' : 'speaker'
}

const stateClass = (player: MediaPlayer): string =>
  Match.value(player.status).pipe(
    Match.when('playing', () => 'is-playing'),
    Match.when('unavailable', () => 'is-unavailable'),
    Match.when('off', () => 'is-off'),
    Match.orElse(() => 'is-on')
  )

const viewPlayerCard = (h: H, player: MediaPlayer, isWide: boolean) => {
  const isDisabled = player.status === 'unavailable'
  return h.section(
    [h.Key(player.entityId), h.Class(classes('card tile', stateClass(player), isWide && 'is-wide'))],
    [
      h.div(
        [h.Class('tile-head')],
        [
          h.span([h.Class('tile-icon')], [icon(h, deviceIcon(player))]),
          h.span(
            [h.Class('tile-text')],
            [
              h.h2([h.Class('tile-name')], [player.name]),
              h.span(
                [h.Class('status num')],
                player.nowPlaying === null
                  ? [STATUS_LABEL[player.status], ...(isWide ? [] : volumeLabel(player))]
                  : [player.nowPlaying.title]
              ),
            ]
          ),
          ...(player.controls.includes('source') ? [viewSourceSelect(h, 'Source', 'Source…', player, isDisabled)] : []),
        ]
      ),
      ...(isWide && player.volume !== null && player.controls.includes('volume')
        ? [h.span([h.Class('tile-volume num')], [`${Math.round(player.volume * 100)}%`])]
        : []),
      viewPlayerControls(h, player, isDisabled),
    ]
  )
}

const viewSpeakers = (h: H, speakers: SpeakerZones) =>
  h.section(
    [h.Key('speaker-zones'), h.Class('card zones')],
    [
      h.div(
        [h.Class('zones-head')],
        [
          h.span([h.Class('tile-icon')], [icon(h, 'speaker')]),
          h.h2([h.Class('tile-name')], ['Speakers']),
          h.div(
            [h.Class('zones-all')],
            [
              ...(speakers.hasAllOn
                ? [
                    h.button(
                      [
                        h.Class('btn'),
                        h.Type('button'),
                        h.OnClick(Message.ClickedMediaAction({ action: { _tag: 'AllZonesOn' } })),
                      ],
                      ['All on']
                    ),
                  ]
                : []),
              ...(speakers.hasAllOff
                ? [
                    h.button(
                      [
                        h.Class('btn'),
                        h.Type('button'),
                        h.OnClick(Message.ClickedMediaAction({ action: { _tag: 'AllZonesOff' } })),
                      ],
                      ['All off']
                    ),
                  ]
                : []),
            ]
          ),
        ]
      ),
      h.ul(
        [h.Class('zone-list')],
        Arr.map(speakers.zones, (zone) =>
          h.li(
            [h.Key(zone.entityId)],
            [
              h.button(
                [
                  h.Type('button'),
                  h.Class(zone.isOn ? 'switch is-on' : 'switch'),
                  h.Role('switch'),
                  h.AriaChecked(zone.isOn),
                  h.Disabled(!zone.isAvailable),
                  h.OnClick(
                    Message.ClickedMediaAction({
                      action: zone.isOn
                        ? { _tag: 'ZoneOff', entityId: zone.entityId }
                        : { _tag: 'ZoneOn', entityId: zone.entityId },
                    })
                  ),
                ],
                [
                  h.span([h.Class('switch-name')], [zone.name]),
                  h.span([h.Class('switch-track')], [h.span([h.Class('switch-thumb')], [])]),
                ]
              ),
            ]
          )
        )
      ),
    ]
  )

const isZonesCard = (card: MediaCard): boolean =>
  Match.value(card).pipe(
    Match.tag('ZonesCard', () => true),
    Match.orElse(() => false)
  )

// Device tiles pair up two per row; the last tile of an odd run spans the row so no cell is left empty.
const viewMediaCards = (h: H, cards: ReadonlyArray<MediaCard>) =>
  Arr.map(cards, (card, index) =>
    Match.valueTags(card, {
      PlayerCard: ({ player }) => {
        const runStart = Arr.findLastIndex(Arr.take(cards, index), isZonesCard)
        const positionInRun = index - (Option.getOrElse(runStart, () => -1) + 1)
        const nextIsPlayer = Option.exists(Arr.get(cards, index + 1), (other) => !isZonesCard(other))
        return viewPlayerCard(h, player, positionInRun % 2 === 0 && !nextIsPlayer)
      },
      ZonesCard: ({ speakers }) => viewSpeakers(h, speakers),
    })
  )

const viewSpotify = (h: H, player: MediaPlayer) => {
  const isDisabled = player.status === 'unavailable'
  const { entityId, nowPlaying } = player
  const isPlaying = player.status === 'playing'
  return h.section(
    [h.Key(entityId), h.Class('card spotify')],
    [
      nowPlaying === null || nowPlaying.artVersion === null
        ? h.div([h.Class('art is-empty')], [icon(h, 'music', 'art-icon')])
        : h.img([
            h.Class('art'),
            h.Src(`/media/art/${encodeURIComponent(entityId)}?v=${nowPlaying.artVersion}`),
            h.Alt(''),
          ]),
      h.div(
        [h.Class('spotify-main')],
        [
          h.div(
            [h.Class('spotify-text')],
            [
              h.p([h.Class('spotify-title')], [nowPlaying === null ? 'Nothing playing' : nowPlaying.title]),
              h.p(
                [h.Class('spotify-artist')],
                [
                  nowPlaying === null || nowPlaying.artist === null ? player.name : nowPlaying.artist,
                  ...volumeLabel(player),
                ]
              ),
            ]
          ),
          h.div(
            [h.Class('spotify-controls')],
            [
              h.div(
                [h.Class('controls')],
                [
                  mediaButton(h, 'previous', 'Previous', { _tag: 'PreviousTrack', entityId }, { isDisabled }),
                  mediaButton(
                    h,
                    isPlaying ? 'pause' : 'play',
                    isPlaying ? 'Pause' : 'Play',
                    { _tag: 'PlayPause', entityId },
                    { isDisabled, state: 'primary' }
                  ),
                  mediaButton(h, 'next', 'Next', { _tag: 'NextTrack', entityId }, { isDisabled }),
                  mediaButton(h, 'volumeDown', 'Volume down', { _tag: 'VolumeDown', entityId }, { isDisabled }),
                  mediaButton(h, 'volumeUp', 'Volume up', { _tag: 'VolumeUp', entityId }, { isDisabled }),
                ]
              ),
              ...(Arr.isReadonlyArrayNonEmpty(player.sources)
                ? [viewSourcePicker(h, 'Play on', player, isDisabled)]
                : []),
            ]
          ),
        ]
      ),
    ]
  )
}

const viewMedia = (h: H, model: Model) =>
  h.div(
    [h.Class('screen media')],
    [
      h.header([h.Class('toolbar')], [h.h1([h.Class('screen-title')], ['Media'])]),
      Option.match(model.media.data, {
        onNone: () => viewNotice(h, model.media.failed ? 'Media unavailable' : 'Loading media…'),
        onSome: (snapshot) =>
          snapshot.spotify === null && !Arr.isReadonlyArrayNonEmpty(snapshot.cards)
            ? viewNotice(h, 'No media configured')
            : h.div(
                [h.Class('media-grid')],
                [
                  ...(snapshot.spotify === null ? [] : [viewSpotify(h, snapshot.spotify)]),
                  ...viewMediaCards(h, snapshot.cards),
                ]
              ),
      }),
    ]
  )

// ============================================
// Ambient
// ============================================

const viewAmbient = (h: H, model: Model, timezone: IanaTimezone) => {
  const date = today(model.now, timezone)
  const { time, meridiem } = clockParts(model.now, timezone)
  const next = Option.flatMap(model.upcoming.data, (events) => nextTimed(events, model.now))
  return h.div(
    [h.Class('ambient')],
    [
      h.div([h.Class('amb-time')], [...viewClockDigits(h, time), h.span([h.Class('amb-meridiem')], [meridiem])]),
      h.div([h.Class('amb-date')], [`${weekdayName(date)}, ${monthDay(date)}`]),
      ...Arr.map(Arr.fromOption(next), (event) =>
        h.div(
          [h.Class('amb-next')],
          [
            h.span([h.Class('amb-when num')], [isHappening(event, model.now) ? 'Now' : eventTime(event, timezone)]),
            h.span([], [event.title]),
            ...(occursOn(event, date, timezone)
              ? []
              : [h.span([h.Class('amb-day')], [weekdayName(addCalendarDays(date, 1))])]),
          ]
        )
      ),
      ...Arr.map(Arr.fromOption(model.weather.data), (weather) =>
        h.div(
          [h.Class('amb-wx')],
          [
            icon(h, conditionIcon(weather.condition), 'amb-icon'),
            h.span([h.Class('num')], [degrees(Option.fromNullishOr(weather.temperature))]),
            h.span([], [conditionLabel(weather.condition)]),
          ]
        )
      ),
    ]
  )
}

// ============================================
// Root
// ============================================

const viewScreen = (h: H, model: Model, timezone: IanaTimezone) =>
  Match.value(model.screen).pipe(
    Match.when('today', () => viewToday(h, model, timezone)),
    Match.when('calendar', () => viewCalendar(h, model, timezone)),
    Match.when('shopping', () => viewShopping(h, model)),
    Match.when('media', () => viewMedia(h, model)),
    Match.exhaustive
  )

export const view = (model: Model, h: H): Html =>
  Option.match(model.timezone, {
    onNone: () => h.div([h.Class('stage theme-light')], [h.div([h.Class('booting')], ['Starting…'])]),
    onSome: (timezone) =>
      h.div(
        [h.Class(isDarkHour(model.now, timezone) ? 'stage theme-dark' : 'stage theme-light')],
        [
          viewRail(h, model),
          h.main([h.Class('view')], [viewScreen(h, model, timezone)]),
          ...(model.isAmbient ? [viewAmbient(h, model, timezone)] : []),
        ]
      ),
  })

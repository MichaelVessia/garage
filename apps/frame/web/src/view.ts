import * as Arr from 'effect/Array'
import * as DateTime from 'effect/DateTime'
import * as Match from 'effect/Match'
import * as Option from 'effect/Option'
import type { Html, HtmlBuilder } from 'foldkit/html'

import { addCalendarDays } from '#shared'
import type { CalendarDate, CalendarEvent, ForecastDay, IanaTimezone, ShoppingItem, Weather } from '#shared'

import { calendarFrom } from './main.js'
import type { Model } from './main.js'
import {
  ChangedShoppingDraft,
  ClickedCalendarMode,
  ClickedScreen,
  ClickedShift,
  ClickedShoppingItem,
  ClickedToday,
  SubmittedShoppingItem,
} from './message.js'
import type { Message, Screen } from './message.js'
import {
  clockParts,
  dayOfMonth,
  formatTime,
  hasEnded,
  isAllDay,
  isHappening,
  isTimed,
  localHour,
  monthDay,
  occursOn,
  today,
  weekdayName,
  weekdayShort,
} from './time.js'

type H = HtmlBuilder<Message>

// Home Assistant weather condition values and their display labels.
const CONDITIONS: ReadonlyArray<readonly [string, string]> = [
  ['clear-night', 'Clear'],
  ['cloudy', 'Cloudy'],
  ['exceptional', 'Unusual'],
  ['fog', 'Fog'],
  ['hail', 'Hail'],
  ['lightning', 'Storms'],
  ['lightning-rainy', 'Storms'],
  ['partlycloudy', 'Partly cloudy'],
  ['pouring', 'Heavy rain'],
  ['rainy', 'Rain'],
  ['snowy', 'Snow'],
  ['snowy-rainy', 'Sleet'],
  ['sunny', 'Sunny'],
  ['windy', 'Windy'],
  ['windy-variant', 'Windy'],
]

const conditionLabel = (condition: string): string =>
  Option.getOrElse(
    Option.map(
      Arr.findFirst(CONDITIONS, ([value]) => value === condition),
      ([, label]) => label
    ),
    () => condition
  )

const degrees = (value: Option.Option<number>): string =>
  Option.match(value, { onNone: () => '–', onSome: (degree) => `${Math.round(degree)}°` })

const eventsOn = (events: ReadonlyArray<CalendarEvent>, date: CalendarDate, timezone: IanaTimezone) =>
  Arr.filter(events, (event) => occursOn(event, date, timezone))

const eventTime = (event: CalendarEvent, timezone: IanaTimezone): string =>
  isAllDay(event) ? 'All day' : formatTime(event.start, timezone)

const eventClass = (event: CalendarEvent, now: DateTime.DateTime, base: string): string =>
  [base, isHappening(event, now) ? 'is-now' : '', hasEnded(event, now) ? 'is-past' : '']
    .filter((name) => name !== '')
    .join(' ')

// ============================================
// Shared pieces
// ============================================

const viewNotice = (h: H, text: string) => h.p([h.Class('notice')], [text])

const viewEventRow = (h: H, event: CalendarEvent, timezone: IanaTimezone, now: DateTime.DateTime) =>
  h.li(
    [h.Key(event.id), h.Class(eventClass(event, now, isAllDay(event) ? 'ev ev--allday' : 'ev'))],
    [
      h.span([h.Class('ev-time')], [isHappening(event, now) ? 'Now' : eventTime(event, timezone)]),
      h.span([h.Class('ev-title')], [event.title]),
      ...(event.location === null ? [] : [h.span([h.Class('ev-where')], [event.location])]),
    ]
  )

const viewDayAgenda = (
  h: H,
  events: ReadonlyArray<CalendarEvent>,
  date: CalendarDate,
  timezone: IanaTimezone,
  now: DateTime.DateTime
) => {
  const items = eventsOn(events, date, timezone)
  return Arr.isReadonlyArrayNonEmpty(items)
    ? h.ul(
        [h.Class('agenda')],
        Arr.map(items, (event) => viewEventRow(h, event, timezone, now))
      )
    : viewNotice(h, 'Nothing scheduled')
}

// ============================================
// Rail
// ============================================

const RAIL: ReadonlyArray<readonly [Screen, string]> = [
  ['today', 'Today'],
  ['calendar', 'Calendar'],
  ['shopping', 'Shopping'],
]

const viewRail = (h: H, model: Model) =>
  h.nav(
    [h.Class('rail'), h.AriaLabel('Screens')],
    [
      ...Arr.map(RAIL, ([screen, label]) =>
        h.button(
          [
            h.Key(screen),
            h.Class(model.screen === screen ? 'rail-item is-active' : 'rail-item'),
            h.OnClick(ClickedScreen({ screen })),
          ],
          [label]
        )
      ),
      ...(model.isOffline ? [h.div([h.Class('rail-offline'), h.Role('status')], ['Offline'])] : []),
      h.div(
        [h.Class('rail-clock')],
        Option.match(model.timezone, {
          onNone: () => [],
          onSome: (timezone) => {
            const { time, meridiem } = clockParts(model.now, timezone)
            return [h.b([], [time]), h.span([], [meridiem])]
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
      h.span([h.Class('fc-cond')], [conditionLabel(day.condition)]),
      h.span(
        [h.Class('fc-temp')],
        [`${degrees(Option.fromNullishOr(day.high))} / ${degrees(Option.fromNullishOr(day.low))}`]
      ),
      ...(day.precipitationProbability === null || day.precipitationProbability < 20
        ? []
        : [h.span([h.Class('fc-wet')], [`${Math.round(day.precipitationProbability)}%`])]),
    ]
  )

const viewWeather = (h: H, model: Model) =>
  h.section(
    [h.Class('t-weather')],
    Option.match(model.weather.data, {
      onNone: () => [viewNotice(h, model.weather.failed ? 'Weather unavailable' : 'Loading weather…')],
      onSome: (weather: Weather) => [
        h.div(
          [h.Class('wx-now')],
          [
            h.span([h.Class('wx-temp num')], [degrees(Option.fromNullishOr(weather.temperature))]),
            h.span([h.Class('wx-cond')], [conditionLabel(weather.condition)]),
          ]
        ),
        h.ul(
          [h.Class('fc')],
          Arr.map(Arr.take(weather.forecast, 5), (day) => viewForecastDay(h, day))
        ),
      ],
    })
  )

const viewDayColumn = (h: H, model: Model, timezone: IanaTimezone, label: string, date: CalendarDate) =>
  h.section(
    [h.Class('t-day')],
    [
      h.h2([h.Class('label')], [`${label} · ${weekdayName(date)}, ${monthDay(date)}`]),
      Option.match(model.upcoming.data, {
        onNone: () => viewNotice(h, model.upcoming.failed ? 'Calendar unavailable' : 'Loading calendar…'),
        onSome: (events) => viewDayAgenda(h, events, date, timezone, model.now),
      }),
    ]
  )

const viewShoppingSummary = (h: H, model: Model) => {
  const open = Option.map(model.shopping.data, (items) => Arr.filter(items, (item) => item.status === 'needs_action'))
  return h.button(
    [h.Class('t-shopping card'), h.OnClick(ClickedScreen({ screen: 'shopping' }))],
    [
      h.span([h.Class('label')], ['Shopping list']),
      h.span(
        [h.Class('t-shopping-count num')],
        [Option.match(open, { onNone: () => '–', onSome: (items) => String(items.length) })]
      ),
      h.span(
        [h.Class('t-shopping-preview')],
        [
          Option.match(open, {
            onNone: () => '',
            onSome: (items) => Arr.map(Arr.take(items, 4), (item) => item.summary).join(' · '),
          }),
        ]
      ),
    ]
  )
}

const viewToday = (h: H, model: Model, timezone: IanaTimezone) => {
  const date = today(model.now, timezone)
  const { time, meridiem } = clockParts(model.now, timezone)
  return h.div(
    [h.Class('today')],
    [
      h.section(
        [h.Class('t-clock')],
        [
          h.div([h.Class('t-time num')], [time, h.span([h.Class('t-ampm')], [meridiem])]),
          h.div([h.Class('t-date')], [h.b([], [weekdayName(date)]), monthDay(date)]),
        ]
      ),
      viewWeather(h, model),
      viewDayColumn(h, model, timezone, 'Today', date),
      h.div(
        [h.Class('t-side')],
        [viewDayColumn(h, model, timezone, 'Tomorrow', addCalendarDays(date, 1)), viewShoppingSummary(h, model)]
      ),
    ]
  )
}

// ============================================
// Calendar
// ============================================

const viewCalendarHeader = (h: H, model: Model, anchor: CalendarDate) => {
  const from = calendarFrom(model.calendarMode, anchor)
  const title =
    model.calendarMode === 'week'
      ? `${monthDay(from)} – ${monthDay(addCalendarDays(from, 6))}`
      : `${weekdayName(anchor)}, ${monthDay(anchor)}`
  return h.header(
    [h.Class('cal-head')],
    [
      h.button([h.Class('btn'), h.AriaLabel('Previous'), h.OnClick(ClickedShift({ direction: -1 }))], ['‹']),
      h.button([h.Class('btn'), h.OnClick(ClickedToday())], ['Today']),
      h.button([h.Class('btn'), h.AriaLabel('Next'), h.OnClick(ClickedShift({ direction: 1 }))], ['›']),
      h.h1([h.Class('cal-title')], [title]),
      h.div(
        [h.Class('seg')],
        Arr.map(['day', 'week'] as const, (mode) =>
          h.button(
            [
              h.Key(mode),
              h.Class(model.calendarMode === mode ? 'is-active' : ''),
              h.OnClick(ClickedCalendarMode({ mode })),
            ],
            [mode === 'day' ? 'Day' : 'Week']
          )
        )
      ),
    ]
  )
}

const viewWeekColumn = (
  h: H,
  model: Model,
  events: ReadonlyArray<CalendarEvent>,
  date: CalendarDate,
  timezone: IanaTimezone
) =>
  h.section(
    [h.Key(date), h.Class(date === today(model.now, timezone) ? 'wk-day is-today' : 'wk-day')],
    [
      h.div(
        [h.Class('wk-head')],
        [h.span([h.Class('num')], [String(dayOfMonth(date))]), h.b([], [weekdayShort(date)])]
      ),
      h.ul(
        [h.Class('wk-list')],
        Arr.map(eventsOn(events, date, timezone), (event) =>
          h.li(
            [h.Key(event.id), h.Class(eventClass(event, model.now, isAllDay(event) ? 'wk-ev wk-ev--allday' : 'wk-ev'))],
            [
              ...(isTimed(event) ? [h.span([h.Class('wk-time')], [formatTime(event.start, timezone)])] : []),
              h.span([h.Class('wk-title')], [event.title]),
            ]
          )
        )
      ),
    ]
  )

const viewCalendarBody = (h: H, model: Model, anchor: CalendarDate, timezone: IanaTimezone) =>
  Option.match(model.week.data, {
    onNone: () => viewNotice(h, model.week.failed ? 'Calendar unavailable' : 'Loading calendar…'),
    onSome: (events) =>
      model.calendarMode === 'day'
        ? h.div([h.Class('cal-day')], [viewDayAgenda(h, events, anchor, timezone, model.now)])
        : h.div(
            [h.Class('cal-week')],
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
      h.div([h.Class('cal')], [viewCalendarHeader(h, model, anchor), viewCalendarBody(h, model, anchor, timezone)]),
  })

// ============================================
// Shopping
// ============================================

const viewShoppingItem = (h: H, item: ShoppingItem) => {
  const done = item.status === 'completed'
  return h.button(
    [
      h.Key(item.uid),
      h.Class(done ? 'shop-item is-done' : 'shop-item'),
      h.AriaPressed(done ? 'true' : 'false'),
      h.OnClick(ClickedShoppingItem({ uid: item.uid, status: done ? 'needs_action' : 'completed' })),
    ],
    [h.span([h.Class('shop-check')], [done ? '✓' : '']), h.span([h.Class('shop-name')], [item.summary])]
  )
}

const viewShoppingAdd = (h: H, model: Model) =>
  h.form(
    [h.Class('shop-add'), h.OnSubmit(SubmittedShoppingItem())],
    [
      h.input([
        h.Class('shop-add-input'),
        h.Type('text'),
        h.Placeholder('Add an item'),
        h.Value(model.shoppingDraft),
        h.OnInput((value) => ChangedShoppingDraft({ value })),
      ]),
      h.button([h.Class('shop-add-button'), h.Type('submit')], ['Add']),
    ]
  )

const viewShopping = (h: H, model: Model) =>
  h.div(
    [h.Class('shop')],
    [
      h.div([h.Class('shop-head')], [h.h1([h.Class('shop-title')], ['Shopping list']), viewShoppingAdd(h, model)]),
      Option.match(model.shopping.data, {
        onNone: () => viewNotice(h, model.shopping.failed ? 'Shopping list unavailable' : 'Loading shopping list…'),
        onSome: (items) => {
          const open = Arr.filter(items, (item) => item.status === 'needs_action')
          const done = Arr.filter(items, (item) => item.status === 'completed')
          return Arr.isReadonlyArrayNonEmpty(items)
            ? h.div(
                [h.Class('shop-grid')],
                Arr.map([...open, ...Arr.take(done, 12)], (item) => viewShoppingItem(h, item))
              )
            : viewNotice(h, 'The list is empty')
        },
      }),
    ]
  )

// ============================================
// Ambient
// ============================================

const nextEvent = (model: Model) =>
  Option.flatMap(model.upcoming.data, (events) =>
    Arr.findFirst(events, (event): boolean => isTimed(event) && DateTime.isGreaterThan(event.end, model.now))
  )

const viewAmbient = (h: H, model: Model, timezone: IanaTimezone) => {
  const hour = localHour(model.now, timezone)
  const isNight = hour >= 22 || hour < 6
  const date = today(model.now, timezone)
  const { time, meridiem } = clockParts(model.now, timezone)
  return h.div(
    [h.Class(isNight ? 'ambient is-night' : 'ambient')],
    [
      h.div([h.Class('amb-time num')], [time, h.span([h.Class('amb-ampm')], [meridiem])]),
      h.div([h.Class('amb-date')], [`${weekdayName(date)}, ${monthDay(date)}`]),
      ...Arr.map(Arr.fromOption(nextEvent(model)), (event) =>
        h.div(
          [h.Class('amb-next')],
          [
            h.b([], [isHappening(event, model.now) ? 'Now' : eventTime(event, timezone)]),
            ` ${event.title}`,
            occursOn(event, date, timezone) ? '' : ` · ${weekdayName(addCalendarDays(date, 1))}`,
          ]
        )
      ),
      ...Arr.map(Arr.fromOption(model.weather.data), (weather) =>
        h.div(
          [h.Class('amb-wx')],
          [`${degrees(Option.fromNullishOr(weather.temperature))} ${conditionLabel(weather.condition)}`]
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
    Match.exhaustive
  )

export const view = (model: Model, h: H): Html =>
  h.div(
    [h.Class('stage')],
    Option.match(model.timezone, {
      onNone: () => [h.div([h.Class('booting')], ['Starting…'])],
      onSome: (timezone) => [
        viewRail(h, model),
        h.main([h.Class('view')], [viewScreen(h, model, timezone)]),
        ...(model.isAmbient ? [viewAmbient(h, model, timezone)] : []),
      ],
    })
  )

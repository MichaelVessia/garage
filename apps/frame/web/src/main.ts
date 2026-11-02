import * as Arr from 'effect/Array'
import * as DateTime from 'effect/DateTime'
import * as Duration from 'effect/Duration'
import * as Effect from 'effect/Effect'
import * as Match from 'effect/Match'
import * as Option from 'effect/Option'
import * as Schedule from 'effect/Schedule'
import * as Schema from 'effect/Schema'
import * as Stream from 'effect/Stream'
import { Subscription } from 'foldkit'
import { evo } from 'foldkit/struct'

import { CalendarDate, CalendarEvent, IanaTimezone, ShoppingItem, Weather, addCalendarDays } from '#shared'
import type { ShoppingItemStatus } from '#shared'

import { FetchSettings, FetchShopping, FetchUpcoming, FetchWeather, FetchWeek, UpdateShoppingItem } from './command.js'
import type { Commands } from './command.js'
import { CalendarMode, Interacted, RefreshDue, Screen, TickedClock } from './message.js'
import type { Message } from './message.js'
import { localHour, today, weekStart } from './time.js'

// ============================================
// Model
// ============================================

const feed = <S extends Schema.Top>(data: S) =>
  Schema.Struct({
    data: Schema.Option(data),
    failed: Schema.Boolean,
  })

const EventsFeed = feed(CalendarEvent.pipe(Schema.Array))
type EventsFeed = typeof EventsFeed.Type

export const Flags = Schema.Struct({ now: Schema.DateTimeUtc })
export type Flags = typeof Flags.Type

export const Model = Schema.Struct({
  now: Schema.DateTimeUtc,
  lastInteraction: Schema.DateTimeUtc,
  isAmbient: Schema.Boolean,
  screen: Screen,
  calendarMode: CalendarMode,
  anchor: Schema.Option(CalendarDate),
  timezone: Schema.Option(IanaTimezone),
  upcoming: EventsFeed,
  week: EventsFeed,
  weather: feed(Weather),
  shopping: feed(ShoppingItem.pipe(Schema.Array)),
})
export type Model = typeof Model.Type

// The frame dims to the ambient clock after this much idle time, sooner at night.
const IDLE_DAY = Duration.minutes(5)
const IDLE_NIGHT = Duration.minutes(1)

// ============================================
// Init
// ============================================

const emptyFeed = { data: Option.none(), failed: false }

export const init = (flags: Flags): readonly [Model, Commands] => [
  {
    now: flags.now,
    lastInteraction: flags.now,
    isAmbient: false,
    screen: 'today',
    calendarMode: 'week',
    anchor: Option.none(),
    timezone: Option.none(),
    upcoming: emptyFeed,
    week: emptyFeed,
    weather: emptyFeed,
    shopping: emptyFeed,
  },
  [FetchSettings(), FetchWeather(), FetchShopping()],
]

// ============================================
// Update
// ============================================

const succeeded = <A>(data: A) => ({ data: Option.some(data), failed: false })
const failed = <A>(current: { readonly data: Option.Option<A> }) => ({ data: current.data, failed: true })

/** The first day the calendar screen shows for its current mode. */
export const calendarFrom = (mode: CalendarMode, anchor: CalendarDate): CalendarDate =>
  mode === 'week' ? weekStart(anchor) : anchor

const calendarCommands = (model: Model): Commands =>
  Arr.flatMap(
    Arr.fromOption(Option.all({ timezone: model.timezone, anchor: model.anchor })),
    ({ timezone, anchor }) => [
      FetchUpcoming({ from: today(model.now, timezone) }),
      FetchWeek({ from: weekStart(anchor) }),
    ]
  )

const shouldBeAmbient = (model: Model, now: DateTime.Utc): boolean => {
  const idle = DateTime.distance(model.lastInteraction, now)
  const isNight = Option.exists(model.timezone, (timezone) => {
    const hour = localHour(now, timezone)
    return hour >= 22 || hour < 6
  })
  return Duration.isGreaterThanOrEqualTo(idle, isNight ? IDLE_NIGHT : IDLE_DAY)
}

const shiftAnchor = (model: Model, direction: -1 | 1): Model =>
  evo(model, {
    anchor: (anchor) =>
      Option.map(anchor, (date) => addCalendarDays(date, direction * (model.calendarMode === 'week' ? 7 : 1))),
  })

type UpdateReturn = readonly [Model, Commands]

const onShift = (model: Model, direction: -1 | 1): UpdateReturn => {
  const next = shiftAnchor(model, direction)
  const previousWeek = Option.map(model.anchor, weekStart)
  return Option.match(Option.map(next.anchor, weekStart), {
    onNone: (): UpdateReturn => [next, []],
    onSome: (from): UpdateReturn =>
      Option.contains(previousWeek, from) ? [next, []] : [evo(next, { week: () => emptyFeed }), [FetchWeek({ from })]],
  })
}

const onTick = (model: Model, now: DateTime.Utc): UpdateReturn => {
  const next = evo(model, { now: () => now, isAmbient: () => shouldBeAmbient(model, now) })
  // At local midnight the upcoming window moves forward a day.
  const newDay = Option.filter(
    Option.map(model.timezone, (timezone) => today(now, timezone)),
    (date) => Option.exists(model.timezone, (timezone) => today(model.now, timezone) !== date)
  )
  return [next, Arr.map(Arr.fromOption(newDay), (from) => FetchUpcoming({ from }))]
}

const onSettings = (model: Model, timezone: IanaTimezone): UpdateReturn => {
  const next = evo(model, {
    timezone: () => Option.some(timezone),
    anchor: (anchor) => Option.orElse(anchor, () => Option.some(today(model.now, timezone))),
  })
  return [next, calendarCommands(next)]
}

const onShoppingItem = (model: Model, uid: string, status: ShoppingItemStatus): UpdateReturn => {
  const items = Option.map(model.shopping.data, (current) =>
    Arr.map(current, (item) => (item.uid === uid ? { ...item, status } : item))
  )
  return [
    evo(model, { shopping: (shopping) => ({ data: items, failed: shopping.failed }) }),
    [UpdateShoppingItem({ uid, status })],
  ]
}

const REFRESH = {
  calendar: calendarCommands,
  weather: (): Commands => [FetchWeather()],
  shopping: (): Commands => [FetchShopping()],
}

export const update = (model: Model, message: Message): UpdateReturn =>
  Match.valueTags(message, {
    TickedClock: ({ now }) => onTick(model, now),
    Interacted: (): UpdateReturn => [evo(model, { lastInteraction: () => model.now, isAmbient: () => false }), []],
    ClickedScreen: ({ screen }): UpdateReturn => [
      evo(model, { screen: () => screen }),
      screen === 'shopping' ? [FetchShopping()] : [],
    ],
    ClickedCalendarMode: ({ mode }): UpdateReturn => [evo(model, { calendarMode: () => mode }), []],
    ClickedShift: ({ direction }) => onShift(model, direction),
    ClickedToday: (): UpdateReturn => {
      const next = evo(model, { anchor: () => Option.map(model.timezone, (timezone) => today(model.now, timezone)) })
      return [next, calendarCommands(next)]
    },
    ClickedShoppingItem: ({ uid, status }) => onShoppingItem(model, uid, status),
    RefreshDue: ({ source }): UpdateReturn => [model, REFRESH[source](model)],
    SucceededFetchSettings: ({ settings }) => onSettings(model, settings.timezone),
    FailedFetchSettings: (): UpdateReturn => [model, [FetchSettings()]],
    SucceededFetchUpcoming: ({ events }): UpdateReturn => [evo(model, { upcoming: () => succeeded(events) }), []],
    FailedFetchUpcoming: (): UpdateReturn => [evo(model, { upcoming: failed }), []],
    // Ignore a week that arrives after the user has paged elsewhere.
    SucceededFetchWeek: ({ from, events }): UpdateReturn =>
      Option.contains(Option.map(model.anchor, weekStart), from)
        ? [evo(model, { week: () => succeeded(events) }), []]
        : [model, []],
    FailedFetchWeek: (): UpdateReturn => [evo(model, { week: failed }), []],
    SucceededFetchWeather: ({ weather }): UpdateReturn => [evo(model, { weather: () => succeeded(weather) }), []],
    FailedFetchWeather: (): UpdateReturn => [evo(model, { weather: failed }), []],
    SucceededFetchShopping: ({ items }): UpdateReturn => [evo(model, { shopping: () => succeeded(items) }), []],
    FailedFetchShopping: (): UpdateReturn => [evo(model, { shopping: failed }), []],
  })

// ============================================
// Subscriptions
// ============================================

const every = (interval: Duration.Input) => Stream.fromSchedule(Schedule.spaced(interval))

export const subscriptions = Subscription.make<Model, Message>()((entry) => ({
  clock: entry(
    {},
    {
      modelToDependencies: () => ({}),
      dependenciesToStream: () =>
        every('15 seconds').pipe(Stream.mapEffect(() => DateTime.now.pipe(Effect.map((now) => TickedClock({ now }))))),
    }
  ),
  touches: entry(
    {},
    {
      modelToDependencies: () => ({}),
      dependenciesToStream: () =>
        Subscription.fromEvent({ target: () => document, type: 'pointerdown', toMessage: () => Interacted() }),
    }
  ),
  calendarRefresh: entry(
    {},
    {
      modelToDependencies: () => ({}),
      dependenciesToStream: () => every('5 minutes').pipe(Stream.map(() => RefreshDue({ source: 'calendar' }))),
    }
  ),
  weatherRefresh: entry(
    {},
    {
      modelToDependencies: () => ({}),
      dependenciesToStream: () => every('15 minutes').pipe(Stream.map(() => RefreshDue({ source: 'weather' }))),
    }
  ),
  shoppingRefresh: entry(
    {},
    {
      modelToDependencies: () => ({}),
      dependenciesToStream: () => every('1 minute').pipe(Stream.map(() => RefreshDue({ source: 'shopping' }))),
    }
  ),
}))

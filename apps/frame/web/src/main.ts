import * as Arr from 'effect/Array'
import * as DateTime from 'effect/DateTime'
import * as Duration from 'effect/Duration'
import * as Effect from 'effect/Effect'
import * as Function from 'effect/Function'
import * as Match from 'effect/Match'
import * as Option from 'effect/Option'
import * as Schedule from 'effect/Schedule'
import * as Schema from 'effect/Schema'
import * as Stream from 'effect/Stream'
import * as Str from 'effect/String'
import { Dom, Subscription } from 'foldkit'
import type { Update } from 'foldkit'
import { modifyFields } from 'foldkit/struct'

import {
  CalendarDate,
  CalendarEvent,
  IanaTimezone,
  MediaSnapshot,
  ShoppingItem,
  Weather,
  addCalendarDays,
} from '#shared'
import type { MediaAction, MediaCard, MediaPlayer, ShoppingItemStatus } from '#shared'

import {
  CheckVersion,
  FetchSettings,
  AddShoppingItem,
  FetchMedia,
  FetchShopping,
  FetchUpcoming,
  FetchWeather,
  FetchWeek,
  ReloadPage,
  RetrySettings,
  RunMediaAction,
  UpdateShoppingItem,
} from './command.js'
import type { CommandServices, Commands } from './command.js'
import { CalendarMode, Message, Screen } from './message.js'
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

export const Flags = Schema.Struct({ now: Schema.DateTimeUtc, bootVersion: Schema.Option(Schema.String) })

export type Flags = typeof Flags.Type

export const Model = Schema.Struct({
  now: Schema.DateTimeUtc,
  bootVersion: Schema.Option(Schema.String),
  isOffline: Schema.Boolean,
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
  shoppingDraft: Schema.String,
  media: feed(MediaSnapshot),
})

export type Model = typeof Model.Type

// The frame dims to the ambient clock after this much idle time, sooner at night.
const IDLE_DAY = Duration.minutes(5)
const IDLE_NIGHT = Duration.minutes(1)

// ============================================
// Init
// ============================================

type UpdateReturn = Update.Return<Model, Message, CommandServices>

const emptyFeed = { data: Option.none(), failed: false }

export const init = (flags: Flags): UpdateReturn => ({
  model: {
    now: flags.now,
    bootVersion: flags.bootVersion,
    isOffline: false,
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
    shoppingDraft: '',
    media: emptyFeed,
  },
  commands: [FetchSettings(), FetchWeather(), FetchShopping()],
})

// ============================================
// Update
// ============================================

const succeeded = <A>(data: A) => ({ data: Option.some(data), failed: false })
const online = (model: Model): Model => modifyFields(model, { isOffline: () => false })

const reachability = (model: Model, isServerReachable: boolean): Model =>
  modifyFields(model, { isOffline: () => !isServerReachable })

const failed = <A>(current: { readonly data: Option.Option<A> }) => ({ data: current.data, failed: true })

/** The first day the calendar screen shows for its current mode. */
export const calendarFrom: {
  (anchor: CalendarDate): (mode: CalendarMode) => CalendarDate
  (mode: CalendarMode, anchor: CalendarDate): CalendarDate
} = Function.dual(2, (mode: CalendarMode, anchor: CalendarDate): CalendarDate =>
  mode === 'week' ? weekStart(anchor) : anchor
)

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
  modifyFields(model, {
    anchor: (anchor) =>
      Option.map(anchor, (date) => addCalendarDays(date, direction * (model.calendarMode === 'week' ? 7 : 1))),
  })

const onShift = (model: Model, direction: -1 | 1): UpdateReturn => {
  const next = shiftAnchor(model, direction)
  const previousWeek = Option.map(model.anchor, weekStart)

  return Option.match(Option.map(next.anchor, weekStart), {
    onNone: (): UpdateReturn => ({ model: next }),
    onSome: (from): UpdateReturn =>
      Option.contains(previousWeek, from)
        ? { model: next }
        : { model: modifyFields(next, { week: () => emptyFeed }), commands: [FetchWeek({ from })] },
  })
}

const onTick = (model: Model, now: DateTime.Utc): UpdateReturn => {
  const next = modifyFields(model, { now: () => now, isAmbient: () => shouldBeAmbient(model, now) })

  // At local midnight the upcoming window moves forward a day.
  const newDay = Option.filter(
    Option.map(model.timezone, (timezone) => today(now, timezone)),
    (date) => Option.exists(model.timezone, (timezone) => today(model.now, timezone) !== date)
  )

  return { model: next, commands: Arr.map(Arr.fromOption(newDay), (from) => FetchUpcoming({ from })) }
}

const onSettings = (model: Model, timezone: IanaTimezone): UpdateReturn => {
  const next = modifyFields(model, {
    timezone: () => Option.some(timezone),
    anchor: (anchor) => Option.orElse(anchor, () => Option.some(today(model.now, timezone))),
  })

  return { model: next, commands: calendarCommands(next) }
}

const onShoppingItem = (model: Model, uid: string, status: ShoppingItemStatus): UpdateReturn => {
  const items = Option.map(model.shopping.data, (current) =>
    Arr.map(current, (item) => (item.uid === uid ? { ...item, status } : item))
  )

  return {
    model: modifyFields(model, { shopping: (shopping) => ({ data: items, failed: shopping.failed }) }),
    commands: [UpdateShoppingItem({ uid, status })],
  }
}

// Blank drafts are ignored; the server trims and length-checks the summary again.
const onSubmitShoppingItem = (model: Model): UpdateReturn => {
  const summary = Str.trim(model.shoppingDraft)

  return summary === ''
    ? { model }
    : {
        model: modifyFields(model, { shoppingDraft: () => '' }),
        commands: [AddShoppingItem({ summary: Str.slice(0, 200)(summary) })],
      }
}

// Applies the change the frame expects so taps feel immediate; the action's response replaces it.
const optimisticPlayer = (player: MediaPlayer, action: MediaAction): MediaPlayer =>
  Match.value(action).pipe(
    Match.tag('PlayPause', ({ entityId }): MediaPlayer =>
      entityId === player.entityId ? { ...player, status: player.status === 'playing' ? 'paused' : 'playing' } : player
    ),
    Match.tag('SetMute', ({ entityId, muted }): MediaPlayer =>
      entityId === player.entityId ? { ...player, isMuted: muted } : player
    ),
    Match.orElse(() => player)
  )

const optimisticZone = (action: MediaAction, entityId: string, current: boolean): boolean =>
  Match.value(action).pipe(
    Match.tag('AllZonesOn', () => true),
    Match.tag('AllZonesOff', () => false),
    Match.tag('ZoneOn', (zone) => zone.entityId === entityId || current),
    Match.tag('ZoneOff', (zone) => zone.entityId !== entityId && current),
    Match.orElse(() => current)
  )

const optimisticCard = (card: MediaCard, action: MediaAction): MediaCard =>
  Match.valueTags(card, {
    PlayerCard: (playerCard): MediaCard => ({ ...playerCard, player: optimisticPlayer(playerCard.player, action) }),
    ZonesCard: (zonesCard): MediaCard => ({
      ...zonesCard,
      speakers: {
        ...zonesCard.speakers,
        zones: Arr.map(zonesCard.speakers.zones, (zone) => ({
          ...zone,
          isOn: optimisticZone(action, zone.entityId, zone.isOn),
        })),
      },
    }),
  })

const onMediaAction = (model: Model, action: MediaAction): UpdateReturn => ({
  model: modifyFields(model, {
    media: (media) => ({
      data: Option.map(media.data, (snapshot) =>
        MediaSnapshot.make({
          spotify: snapshot.spotify === null ? null : optimisticPlayer(snapshot.spotify, action),
          cards: Arr.map(snapshot.cards, (card) => optimisticCard(card, action)),
        })
      ),
      failed: media.failed,
    }),
  }),
  commands: [RunMediaAction({ action })],
})

const REFRESH = {
  calendar: calendarCommands,
  weather: (): Commands => [FetchWeather()],
  shopping: (): Commands => [FetchShopping()],
  media: (): Commands => [FetchMedia()],
  version: (): Commands => [CheckVersion()],
}

// A new deploy serves a different version than this page booted with; reload to pick it up.
const onVersion = (model: Model, version: string): UpdateReturn => ({
  model: online(model),
  commands: Option.exists(model.bootVersion, (booted) => booted !== version) ? [ReloadPage()] : [],
})

export const update: {
  (message: Message): (model: Model) => UpdateReturn
  (model: Model, message: Message): UpdateReturn
} = Function.dual(2, (model: Model, message: Message): UpdateReturn =>
  Message.match<UpdateReturn>(message, {
    TickedClock: ({ now }) => onTick(model, now),
    Interacted: () => ({ model: modifyFields(model, { lastInteraction: () => model.now, isAmbient: () => false }) }),
    ClickedScreen: ({ screen }) => ({
      model: modifyFields(model, { screen: () => screen }),
      commands: Match.value(screen).pipe(
        Match.when('shopping', (): Commands => [FetchShopping()]),
        Match.when('media', (): Commands => [FetchMedia()]),
        Match.orElse((): Commands => [])
      ),
    }),
    ClickedCalendarMode: ({ mode }) => ({ model: modifyFields(model, { calendarMode: () => mode }) }),
    ClickedShift: ({ direction }) => onShift(model, direction),
    ClickedToday: () => {
      const next = modifyFields(model, {
        anchor: () => Option.map(model.timezone, (timezone) => today(model.now, timezone)),
      })

      return { model: next, commands: calendarCommands(next) }
    },
    ClickedShoppingItem: ({ uid, status }) => onShoppingItem(model, uid, status),
    ChangedShoppingDraft: ({ value }) => ({ model: modifyFields(model, { shoppingDraft: () => value }) }),
    SubmittedShoppingItem: () => onSubmitShoppingItem(model),
    RefreshDue: ({ source }) => ({ model, commands: REFRESH[source](model) }),
    SucceededFetchSettings: ({ settings }) => onSettings(online(model), settings.timezone),
    FailedFetchSettings: ({ isServerReachable }) => ({
      model: reachability(model, isServerReachable),
      commands: [RetrySettings()],
    }),
    SucceededFetchUpcoming: ({ events }) => ({
      model: modifyFields(online(model), { upcoming: () => succeeded(events) }),
    }),
    FailedFetchUpcoming: ({ isServerReachable }) => ({
      model: modifyFields(reachability(model, isServerReachable), { upcoming: failed }),
    }),
    // Ignore a week that arrives after the user has paged elsewhere.
    SucceededFetchWeek: ({ from, events }) => ({
      model: Option.contains(Option.map(model.anchor, weekStart), from)
        ? modifyFields(online(model), { week: () => succeeded(events) })
        : online(model),
    }),
    FailedFetchWeek: ({ isServerReachable }) => ({
      model: modifyFields(reachability(model, isServerReachable), { week: failed }),
    }),
    SucceededFetchWeather: ({ weather }) => ({
      model: modifyFields(online(model), { weather: () => succeeded(weather) }),
    }),
    FailedFetchWeather: ({ isServerReachable }) => ({
      model: modifyFields(reachability(model, isServerReachable), { weather: failed }),
    }),
    SucceededFetchShopping: ({ items }) => ({
      model: modifyFields(online(model), { shopping: () => succeeded(items) }),
    }),
    FailedFetchShopping: ({ isServerReachable }) => ({
      model: modifyFields(reachability(model, isServerReachable), { shopping: failed }),
    }),
    ClickedMediaAction: ({ action }) => onMediaAction(model, action),
    SucceededFetchMedia: ({ media }) => ({
      model: modifyFields(online(model), { media: () => succeeded(media) }),
    }),
    FailedFetchMedia: ({ isServerReachable }) => ({
      model: modifyFields(reachability(model, isServerReachable), { media: failed }),
    }),
    FailedMediaAction: () => ({ model, commands: [FetchMedia()] }),
    CheckedVersion: ({ version }) => onVersion(model, version),
    FailedCheckVersion: () => ({ model: reachability(model, false) }),
    StartedReload: () => ({ model }),
  })
)

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
        every('15 seconds').pipe(
          Stream.mapEffect(() => DateTime.now.pipe(Effect.map((now) => Message.TickedClock({ now }))))
        ),
    }
  ),
  touches: entry(
    {},
    {
      modelToDependencies: () => ({}),
      dependenciesToStream: () =>
        Dom.streamFromEvent({ target: () => document, type: 'pointerdown', mapEvent: () => Message.Interacted() }),
    }
  ),
  calendarRefresh: entry(
    {},
    {
      modelToDependencies: () => ({}),
      dependenciesToStream: () => every('5 minutes').pipe(Stream.map(() => Message.RefreshDue({ source: 'calendar' }))),
    }
  ),
  weatherRefresh: entry(
    {},
    {
      modelToDependencies: () => ({}),
      dependenciesToStream: () => every('15 minutes').pipe(Stream.map(() => Message.RefreshDue({ source: 'weather' }))),
    }
  ),
  versionCheck: entry(
    {},
    {
      modelToDependencies: () => ({}),
      dependenciesToStream: () => every('5 minutes').pipe(Stream.map(() => Message.RefreshDue({ source: 'version' }))),
    }
  ),
  // Media state changes from remotes and other apps, so poll it only while the Media screen is open.
  mediaRefresh: entry(
    { isVisible: Schema.Boolean },
    {
      modelToDependencies: (model) => ({ isVisible: model.screen === 'media' }),
      dependenciesToStream: ({ isVisible }) =>
        isVisible ? every('5 seconds').pipe(Stream.map(() => Message.RefreshDue({ source: 'media' }))) : Stream.empty,
    }
  ),
  shoppingRefresh: entry(
    {},
    {
      modelToDependencies: () => ({}),
      dependenciesToStream: () => every('1 minute').pipe(Stream.map(() => Message.RefreshDue({ source: 'shopping' }))),
    }
  ),
}))

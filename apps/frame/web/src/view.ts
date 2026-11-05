import * as Arr from 'effect/Array'
import * as Function from 'effect/Function'
import * as Match from 'effect/Match'
import * as Option from 'effect/Option'
import type { Html } from 'foldkit/html'

import { addCalendarDays } from '#shared'
import type { IanaTimezone } from '#shared'

import { icon } from './icons.js'
import type { IconName } from './icons.js'
import type { Model } from './main.js'
import { Message } from './message.js'
import type { Screen } from './message.js'
import { clockParts, isDarkHour, isHappening, monthDay, occursOn, today, weekdayName } from './time.js'
import { viewCalendar, viewToday } from './view/agenda.js'
import { viewMedia } from './view/media.js'
import type { H } from './view/shared.js'
import { classes, colorAttributes, colorClass, eventTime, nextTimed, viewClockDigits } from './view/shared.js'
import { viewShopping } from './view/shopping.js'
import { conditionIcon, conditionLabel, degrees } from './view/weather.js'

// ============================================
// Rail
// ============================================

const RAIL: ReadonlyArray<readonly [Screen, string, IconName]> = [
  ['today', 'Today', 'today'],
  ['calendar', 'Calendar', 'calendar'],
  ['shopping', 'Shopping', 'shopping'],
  ['media', 'Media', 'media'],
]

// The rail's Shopping item carries the count of items still to buy, so Today needs no shopping card.
const railBadge = (h: H, model: Model, screen: Screen): ReadonlyArray<Html> => {
  const open = Option.match(model.shopping.data, {
    onNone: () => 0,
    onSome: (items) => Arr.filter(items, (item) => item.status === 'needs_action').length,
  })

  return screen === 'shopping' && open > 0 ? [h.span([h.Class('rail-badge num')], [String(open)])] : []
}

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
          [icon(h, name, 'rail-icon'), h.span([h.Class('rail-label')], [label]), ...railBadge(h, model, screen)]
        )
      ),
      h.div([h.Class('rail-fill')], []),
      ...(model.isOffline
        ? [h.div([h.Class('rail-offline'), h.Role('status')], [icon(h, 'offline', 'rail-icon'), 'Offline'])]
        : []),
      // Today shows the large clock, so the rail clock appears only on the other screens.
      ...(model.screen === 'today'
        ? []
        : [
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
          ]),
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
          [h.Class(classes('amb-next', colorClass(event))), ...colorAttributes(h, event)],
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

export const view: {
  (h: H): (model: Model) => Html
  (model: Model, h: H): Html
} = Function.dual(2, (model: Model, h: H): Html =>
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
)

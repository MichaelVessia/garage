import * as Arr from 'effect/Array'
import * as DateTime from 'effect/DateTime'
import * as Function from 'effect/Function'
import * as Option from 'effect/Option'
import * as P from 'effect/Predicate'
import * as Str from 'effect/String'
import type { Html } from 'foldkit/html'

import type { ForecastDay, ForecastHour, IanaTimezone, Weather, Wind } from '#shared'

import { icon } from '../icons.js'
import type { IconName } from '../icons.js'
import type { Model } from '../main.js'
import { Message } from '../message.js'
import { clockParts, today, weekdayName, weekdayShort } from '../time.js'
import type { H } from './shared.js'
import { viewNotice, viewSheet } from './shared.js'

// A weather tone colours a condition's icon and its forecast tile: `base` draws the icon,
// `accent` its sun, rain, snow, or lightning strokes, and `tint` the tile behind it.
type WeatherTone = 'sun' | 'partly' | 'cloud' | 'rain' | 'snow' | 'storm' | 'fog' | 'night' | 'wind'

interface Condition {
  readonly label: string
  readonly icon: IconName
  readonly tone: WeatherTone
}

// Home Assistant weather condition values, their display labels, icons, and tones.
const CONDITIONS: ReadonlyArray<readonly [string, Condition]> = [
  ['clear-night', { label: 'Clear', icon: 'moon', tone: 'night' }],
  ['cloudy', { label: 'Cloudy', icon: 'cloud', tone: 'cloud' }],
  ['exceptional', { label: 'Unusual', icon: 'cloud', tone: 'cloud' }],
  ['fog', { label: 'Fog', icon: 'fog', tone: 'fog' }],
  ['hail', { label: 'Hail', icon: 'snow', tone: 'snow' }],
  ['lightning', { label: 'Storms', icon: 'storm', tone: 'storm' }],
  ['lightning-rainy', { label: 'Storms', icon: 'storm', tone: 'storm' }],
  ['partlycloudy', { label: 'Partly cloudy', icon: 'partlyCloudy', tone: 'partly' }],
  ['pouring', { label: 'Heavy rain', icon: 'rain', tone: 'rain' }],
  ['rainy', { label: 'Rain', icon: 'rain', tone: 'rain' }],
  ['snowy', { label: 'Snow', icon: 'snow', tone: 'snow' }],
  ['snowy-rainy', { label: 'Sleet', icon: 'drizzle', tone: 'snow' }],
  ['sunny', { label: 'Sunny', icon: 'sun', tone: 'sun' }],
  ['windy', { label: 'Windy', icon: 'wind', tone: 'wind' }],
  ['windy-variant', { label: 'Windy', icon: 'wind', tone: 'wind' }],
]

const condition = (value: string): Condition =>
  Option.getOrElse(
    Option.map(
      Arr.findFirst(CONDITIONS, ([key]) => key === value),
      ([, entry]) => entry
    ),
    (): Condition => ({ label: value, icon: 'cloud', tone: 'cloud' })
  )

export const conditionLabel = (value: string): string => condition(value).label

export const conditionIcon = (value: string): IconName => condition(value).icon

// The class that applies a condition's weather tone to an element and the icons inside it.
const toneClass = (value: string): string => `wx-${condition(value).tone}`

export const degrees = (value: Option.Option<number>): string =>
  Option.match(value, { onNone: () => '–', onSome: (degree) => `${Math.round(degree)}°` })

// Rain chances below this stay off the screen, so a dry day reads as dry.
const RAIN_CHANCE_SHOWN = 30

const rainChance = (day: ForecastDay): ReadonlyArray<string> =>
  P.isNotNull(day.precipitationProbability) && day.precipitationProbability >= RAIN_CHANCE_SHOWN
    ? [`${Math.round(day.precipitationProbability)}%`]
    : []

const viewForecastDay = (h: H, day: ForecastDay) =>
  h.li(
    [h.Key(day.date), h.Class(`fc-day ${toneClass(day.condition)}`)],
    [
      h.span(
        [h.Class('fc-head')],
        [
          h.span([h.Class('fc-name')], [weekdayShort(day.date)]),
          ...Arr.map(rainChance(day), (chance) => h.span([h.Class('fc-rain num')], [chance])),
        ]
      ),
      h.span(
        [h.Class('fc-body')],
        [
          icon(h, conditionIcon(day.condition), 'fc-icon wx-glyph'),
          h.span(
            [h.Class('fc-temp num')],
            [
              h.b([], [degrees(Option.fromNullishOr(day.high))]),
              h.span([h.Class('fc-low')], [degrees(Option.fromNullishOr(day.low))]),
            ]
          ),
        ]
      ),
    ]
  )

export const viewWeather: {
  (model: Model): (h: H) => Html
  (h: H, model: Model): Html
} = Function.dual(2, (h: H, model: Model): Html =>
  h.section(
    [
      h.Class('card t-weather tap'),
      h.Role('button'),
      h.AriaLabel('Weather details'),
      h.OnClick(Message.ClickedWeather()),
    ],
    Option.match(model.weather.data, {
      onNone: () => [viewNotice(h, model.weather.failed ? 'Weather unavailable' : 'Loading weather…')],
      onSome: (weather: Weather) => {
        const first = Arr.head(weather.forecast)

        return [
          h.div(
            [h.Class(`wx-now ${toneClass(weather.condition)}`)],
            [
              h.span([h.Class('wx-well')], [icon(h, conditionIcon(weather.condition), 'wx-icon wx-glyph')]),
              h.span([h.Class('wx-temp num')], [degrees(Option.fromNullishOr(weather.temperature))]),
              h.span(
                [h.Class('wx-cond')],
                [
                  h.span([h.Class('wx-label')], [conditionLabel(weather.condition)]),
                  ...Arr.map(Arr.fromOption(first), (day) =>
                    h.span(
                      [h.Class('wx-range num')],
                      [
                        h.b([], [degrees(Option.fromNullishOr(day.high))]),
                        h.span([h.Class('fc-low')], [degrees(Option.fromNullishOr(day.low))]),
                        ...Arr.map(rainChance(day), (chance) => h.span([h.Class('fc-rain')], [chance])),
                      ]
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
)

// ============================================
// Weather detail
// ============================================

const COMPASS = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW']

const windLabel = (wind: Wind): string => {
  const from = P.isNotNull(wind.bearing) ? `${COMPASS[Math.round(wind.bearing / 45) % 8] ?? ''} ` : ''

  return Str.trim(`${from}${Math.round(wind.speed)} ${wind.unit}`)
}

const viewFact = (h: H, label: string, value: string) =>
  h.div(
    [h.Class('wx-fact')],
    [h.span([h.Class('wx-fact-label')], [label]), h.span([h.Class('wx-fact-value num')], [value])]
  )

const viewFacts = (h: H, weather: Weather) =>
  h.div(
    [h.Class('wx-facts')],
    [
      ...Arr.map(Arr.fromNullishOr(weather.feelsLike), (value) =>
        viewFact(h, 'Feels like', degrees(Option.some(value)))
      ),
      ...Arr.map(Arr.fromNullishOr(weather.humidity), (value) => viewFact(h, 'Humidity', `${Math.round(value)}%`)),
      ...Arr.map(Arr.fromNullishOr(weather.wind), (wind) => viewFact(h, 'Wind', windLabel(wind))),
      ...Arr.map(Arr.fromNullishOr(weather.uvIndex), (value) => viewFact(h, 'UV index', String(Math.round(value)))),
    ]
  )

// The hours still ahead, starting with the one in progress.
const HOURS_SHOWN = 12

const viewHour = (h: H, hour: ForecastHour, timezone: IanaTimezone) => {
  const { time, meridiem } = clockParts(hour.time, timezone)

  return h.li(
    [h.Key(DateTime.formatIso(hour.time)), h.Class(`wx-hour ${toneClass(hour.condition)}`)],
    [
      h.span([h.Class('wx-hour-time num')], [`${Str.split(':')(time)[0] ?? time} ${meridiem}`]),
      icon(h, conditionIcon(hour.condition), 'wx-hour-icon wx-glyph'),
      h.span([h.Class('wx-hour-temp num')], [degrees(Option.fromNullishOr(hour.temperature))]),
      h.span(
        [h.Class('wx-hour-rain num')],
        P.isNotNull(hour.precipitationProbability) && hour.precipitationProbability > 0
          ? [icon(h, 'droplet', 'wx-drop'), `${Math.round(hour.precipitationProbability)}%`]
          : []
      ),
    ]
  )
}

const viewDayRow = (h: H, day: ForecastDay, isToday: boolean) =>
  h.li(
    [h.Key(day.date), h.Class(`wx-day ${toneClass(day.condition)}`)],
    [
      h.span([h.Class('wx-day-name')], [isToday ? 'Today' : weekdayName(day.date)]),
      h.span([h.Class('wx-day-well')], [icon(h, conditionIcon(day.condition), 'wx-day-icon wx-glyph')]),
      h.span([h.Class('wx-day-cond')], [conditionLabel(day.condition)]),
      h.span(
        [h.Class('wx-day-rain num')],
        P.isNotNull(day.precipitationProbability) && day.precipitationProbability > 0
          ? [icon(h, 'droplet', 'wx-drop'), `${Math.round(day.precipitationProbability)}%`]
          : []
      ),
      h.span(
        [h.Class('wx-day-temp num')],
        [
          h.b([], [degrees(Option.fromNullishOr(day.high))]),
          h.span([h.Class('fc-low')], [degrees(Option.fromNullishOr(day.low))]),
        ]
      ),
    ]
  )

const viewWeatherSheet = (h: H, weather: Weather, now: DateTime.Utc, timezone: IanaTimezone) => {
  const date = today(now, timezone)
  const hourStart = DateTime.subtract(now, { hours: 1 })

  const hours = Arr.take(
    Arr.filter(weather.hourly, (hour) => DateTime.isGreaterThan(hour.time, hourStart)),
    HOURS_SHOWN
  )

  return [
    h.div(
      [h.Class(`wx-sheet-now ${toneClass(weather.condition)}`)],
      [
        h.span([h.Class('wx-well')], [icon(h, conditionIcon(weather.condition), 'wx-icon wx-glyph')]),
        h.span([h.Class('wx-temp num')], [degrees(Option.fromNullishOr(weather.temperature))]),
        h.span([h.Class('wx-sheet-cond')], [conditionLabel(weather.condition)]),
        viewFacts(h, weather),
      ]
    ),
    ...(Arr.isReadonlyArrayNonEmpty(hours)
      ? [
          h.h3([h.Class('sheet-section')], ['Next hours']),
          h.ul(
            [h.Class('wx-hours')],
            Arr.map(hours, (hour) => viewHour(h, hour, timezone))
          ),
        ]
      : []),
    h.h3([h.Class('sheet-section')], ['Coming days']),
    h.ul(
      [h.Class('wx-days')],
      Arr.map(
        Arr.filter(weather.forecast, (day) => day.date >= date),
        (day) => viewDayRow(h, day, day.date === date)
      )
    ),
  ]
}

export const viewWeatherDetail: {
  (model: Model, timezone: IanaTimezone): (h: H) => Html
  (h: H, model: Model, timezone: IanaTimezone): Html
} = Function.dual(3, (h: H, model: Model, timezone: IanaTimezone): Html =>
  viewSheet(h, {
    title: 'Weather',
    className: 'sheet-weather',
    body: Option.match(model.weather.data, {
      onNone: () => [viewNotice(h, model.weather.failed ? 'Weather unavailable' : 'Loading weather…')],
      onSome: (weather) => viewWeatherSheet(h, weather, model.now, timezone),
    }),
    actions: [],
  })
)

import * as Arr from 'effect/Array'
import * as Function from 'effect/Function'
import * as Option from 'effect/Option'
import * as P from 'effect/Predicate'
import type { Html } from 'foldkit/html'

import type { ForecastDay, Weather } from '#shared'

import { icon } from '../icons.js'
import type { IconName } from '../icons.js'
import type { Model } from '../main.js'
import { weekdayShort } from '../time.js'
import type { H } from './shared.js'
import { viewNotice } from './shared.js'

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
    [h.Class('card t-weather')],
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

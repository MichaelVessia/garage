import * as Arr from 'effect/Array'
import * as Function from 'effect/Function'
import * as Option from 'effect/Option'
import type { Html } from 'foldkit/html'

import type { ForecastDay, Weather } from '#shared'

import { icon } from '../icons.js'
import type { IconName } from '../icons.js'
import type { Model } from '../main.js'
import { weekdayShort } from '../time.js'
import type { H } from './shared.js'
import { viewNotice } from './shared.js'

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

export const conditionLabel = (value: string): string =>
  Option.getOrElse(
    Option.map(condition(value), ([, label]) => label),
    () => value
  )

export const conditionIcon = (value: string): IconName =>
  Option.getOrElse(
    Option.map(condition(value), (entry) => entry[2]),
    (): IconName => 'cloud'
  )

export const degrees = (value: Option.Option<number>): string =>
  Option.match(value, { onNone: () => '–', onSome: (degree) => `${Math.round(degree)}°` })

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
)

// @vitest-environment happy-dom
import { assert, describe, expect, it } from '@effect/vitest'
import * as Arr from 'effect/Array'
import * as DateTime from 'effect/DateTime'
import * as Option from 'effect/Option'
import * as Schema from 'effect/Schema'
import { Scene } from 'foldkit'

import { CalendarDate, IanaTimezone, Weather } from '#shared'

import { init, update } from '../src/main.js'
import type { Model } from '../src/main.js'
import { view } from '../src/view.js'

// Monday 2026-11-02, 10:00 in New York.
const initial = init({ now: DateTime.makeUnsafe('2026-11-02T15:00:00Z'), bootVersion: Option.none() }).model

const ready: Model = {
  ...initial,
  timezone: Option.some(IanaTimezone.make('America/New_York')),
  anchor: Option.some(CalendarDate.make('2026-11-02')),
}

const shopping = [
  { uid: 'a1', summary: 'Milk', status: 'needs_action' as const },
  { uid: 'b2', summary: 'Eggs', status: 'completed' as const },
]

const rendered = (model: Model) => {
  let html = ''
  Scene.scene(
    { update, view },
    Scene.given(model),
    Scene.tap((simulation) => {
      html = Option.getOrElse(Schema.encodeOption(Schema.fromJsonString(Schema.Unknown))(simulation.html), () =>
        assert.fail('rendered HTML is not JSON')
      )
    })
  )

  return html
}

describe('today screen', () => {
  it('colours each weather condition by its tone and shows likely rain', () => {
    const day = (date: string, condition: string, precipitationProbability: number | null) => ({
      date: CalendarDate.make(date),
      condition,
      high: 60,
      low: 45,
      precipitationProbability,
    })

    const html = rendered({
      ...ready,
      weather: {
        data: Option.some(
          Weather.make({
            condition: 'sunny',
            temperature: 58,
            temperatureUnit: '°F',
            forecast: [
              day('2026-11-02', 'sunny', 0),
              day('2026-11-03', 'pouring', 90),
              day('2026-11-04', 'lightning-rainy', 20),
              day('2026-11-05', 'snowy', null),
              day('2026-11-06', 'unheard-of', null),
            ],
          })
        ),
        failed: false,
      },
    })

    expect(html).toContain('"wx-now":true,"wx-sun":true')
    expect(html).toContain('"fc-day":true,"wx-rain":true')
    expect(html).toContain('"fc-day":true,"wx-storm":true')
    expect(html).toContain('"fc-day":true,"wx-snow":true')
    // An unknown condition falls back to the neutral cloud tone.
    expect(html).toContain('"fc-day":true,"wx-cloud":true')
    expect(html).toContain('ic-accent')
    // Only rain chances of 30% or more are shown.
    expect(html).toContain('90%')
    expect(html).not.toContain('20%')
  })

  it('puts the shopping count on the rail instead of a Today card', () => {
    const html = rendered({ ...ready, shopping: { data: Option.some(shopping), failed: false } })

    expect(html).not.toContain('Milk')
    expect(html).toContain('rail-badge')
    expect(html).toContain('"1"')

    const allDone = Arr.map(shopping, (item) => ({ ...item, status: 'completed' as const }))
    expect(rendered({ ...ready, shopping: { data: Option.some(allDone), failed: false } })).not.toContain('rail-badge')
  })
})

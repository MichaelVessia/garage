// @vitest-environment happy-dom
import { describe, expect, it } from '@effect/vitest'
import * as DateTime from 'effect/DateTime'
import * as Option from 'effect/Option'
import * as Scene from 'foldkit/scene'
import * as Story from 'foldkit/story'

import { CalendarDate, FrameSettings, IanaTimezone, Weather } from '#shared'
import type { CalendarEvent } from '#shared'

import {
  CheckVersion,
  FetchShopping,
  FetchUpcoming,
  FetchWeek,
  ReloadPage,
  RetrySettings,
  UpdateShoppingItem,
} from '../src/command.js'
import { init, update } from '../src/main.js'
import type { Model } from '../src/main.js'
import {
  CheckedVersion,
  ClickedScreen,
  FailedCheckVersion,
  FailedFetchSettings,
  FailedFetchWeather,
  RefreshDue,
  StartedReload,
  ClickedShift,
  ClickedShoppingItem,
  Interacted,
  SucceededFetchSettings,
  SucceededFetchShopping,
  SucceededFetchUpcoming,
  SucceededFetchWeek,
  TickedClock,
} from '../src/message.js'
import { view } from '../src/view.js'

const timezone = IanaTimezone.make('America/New_York')
// Monday 2026-11-02, 10:00 in New York.
const now = DateTime.makeUnsafe('2026-11-02T15:00:00Z')
const at = (iso: string) => DateTime.makeUnsafe(iso)

const [initial] = init({ now, bootVersion: Option.some('build-1') })

const ready: Model = {
  ...initial,
  timezone: Option.some(timezone),
  anchor: Option.some(CalendarDate.make('2026-11-02')),
}

const events: ReadonlyArray<CalendarEvent> = [
  {
    _tag: 'TimedEvent',
    id: 'swim/1',
    title: 'Swim lesson',
    location: 'Community pool',
    color: null,
    start: at('2026-11-02T22:00:00Z'),
    end: at('2026-11-02T23:00:00Z'),
  },
  {
    _tag: 'AllDayEvent',
    id: 'visit',
    title: 'Grandparents visiting',
    location: null,
    color: null,
    startDate: CalendarDate.make('2026-11-03'),
    endDate: CalendarDate.make('2026-11-05'),
  },
]

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
      html = JSON.stringify(simulation.html)
    })
  )
  return html
}

describe('frame app', () => {
  it('loads both calendar windows once the server timezone arrives', () => {
    Story.story(
      update,
      Story.given(initial),
      Story.message(SucceededFetchSettings({ settings: new FrameSettings({ timezone }) })),
      Story.model((model) => {
        expect(model.anchor).toEqual(Option.some('2026-11-02'))
      }),
      Story.Command.expectExact(FetchUpcoming, FetchWeek),
      Story.Command.resolve(FetchUpcoming, SucceededFetchUpcoming({ events })),
      Story.Command.resolve(FetchWeek, SucceededFetchWeek({ from: CalendarDate.make('2026-11-01'), events })),
      Story.model((model) => {
        expect(Option.getOrThrow(model.upcoming.data)).toHaveLength(2)
        expect(Option.getOrThrow(model.week.data)).toHaveLength(2)
      })
    )
  })

  it('pages the week view and ignores a response for a week no longer shown', () => {
    Story.story(
      update,
      Story.given(ready),
      Story.message(ClickedShift({ direction: 1 })),
      Story.model((model) => {
        expect(model.anchor).toEqual(Option.some('2026-11-09'))
        expect(model.week.data).toEqual(Option.none())
      }),
      Story.Command.expectExact(FetchWeek),
      Story.Command.resolve(FetchWeek, SucceededFetchWeek({ from: CalendarDate.make('2026-11-01'), events })),
      Story.model((model) => {
        expect(model.week.data).toEqual(Option.none())
      })
    )
  })

  it('checks off a shopping item optimistically and saves it', () => {
    Story.story(
      update,
      Story.given({ ...ready, shopping: { data: Option.some(shopping), failed: false } }),
      Story.message(ClickedShoppingItem({ uid: 'a1', status: 'completed' })),
      Story.model((model) => {
        expect(Option.getOrThrow(model.shopping.data)[0]?.status).toBe('completed')
      }),
      Story.Command.expectExact(UpdateShoppingItem),
      Story.Command.resolve(
        UpdateShoppingItem,
        SucceededFetchShopping({ items: [{ uid: 'a1', summary: 'Milk', status: 'completed' }] })
      )
    )
  })

  it('refreshes the shopping list when that screen opens', () => {
    Story.story(
      update,
      Story.given(ready),
      Story.message(ClickedScreen({ screen: 'shopping' })),
      Story.model((model) => {
        expect(model.screen).toBe('shopping')
      }),
      Story.Command.expectExact(FetchShopping),
      Story.Command.resolve(FetchShopping, SucceededFetchShopping({ items: shopping }))
    )
  })

  it('dims to the ambient clock when idle, sooner at night, and wakes on touch', () => {
    Story.story(
      update,
      Story.given(ready),
      Story.message(TickedClock({ now: at('2026-11-02T15:04:00Z') })),
      Story.model((model) => {
        expect(model.isAmbient).toBe(false)
      }),
      Story.message(TickedClock({ now: at('2026-11-02T15:06:00Z') })),
      Story.model((model) => {
        expect(model.isAmbient).toBe(true)
      }),
      Story.message(Interacted()),
      Story.model((model) => {
        expect(model.isAmbient).toBe(false)
      })
    )

    // 23:00 in New York: one idle minute is enough.
    const late = { ...ready, now: at('2026-11-03T04:00:00Z'), lastInteraction: at('2026-11-03T04:00:00Z') }
    Story.story(
      update,
      Story.given(late),
      Story.message(TickedClock({ now: at('2026-11-03T04:01:30Z') })),
      Story.model((model) => {
        expect(model.isAmbient).toBe(true)
      })
    )
  })

  it('renders today, calendar, shopping, and ambient screens', () => {
    const loaded: Model = {
      ...ready,
      upcoming: { data: Option.some(events), failed: false },
      week: { data: Option.some(events), failed: false },
      weather: {
        data: Option.some(
          new Weather({
            condition: 'partlycloudy',
            temperature: 48,
            temperatureUnit: '°F',
            forecast: [
              {
                date: CalendarDate.make('2026-11-02'),
                condition: 'rainy',
                high: 52,
                low: 40,
                precipitationProbability: 80,
              },
            ],
          })
        ),
        failed: false,
      },
      shopping: { data: Option.some(shopping), failed: false },
    }

    const todayHtml = rendered(loaded)
    expect(todayHtml).toContain('10:00')
    expect(todayHtml).toContain('Swim lesson')
    expect(todayHtml).toContain('Grandparents visiting')
    expect(todayHtml).toContain('Partly cloudy')

    const weekHtml = rendered({ ...loaded, screen: 'calendar' })
    expect(weekHtml).toContain('November 1 – November 7')
    expect(weekHtml).toContain('5:00 PM')

    const shoppingHtml = rendered({ ...loaded, screen: 'shopping' })
    expect(shoppingHtml).toContain('Milk')
    expect(shoppingHtml).toContain('is-done')

    const ambientHtml = rendered({ ...loaded, isAmbient: true })
    expect(ambientHtml).toContain('amb-time')
    expect(ambientHtml).toContain('Swim lesson')
  })

  it('reloads when the server reports a different version than the page booted with', () => {
    Story.story(
      update,
      Story.given(ready),
      Story.message(RefreshDue({ source: 'version' })),
      Story.Command.resolve(CheckVersion, CheckedVersion({ version: 'build-1' })),
      Story.Command.expectNone(),
      Story.message(RefreshDue({ source: 'version' })),
      Story.Command.resolve(CheckVersion, CheckedVersion({ version: 'build-2' })),
      Story.Command.expectExact(ReloadPage),
      Story.Command.resolve(ReloadPage, StartedReload())
    )
  })

  it('never reloads a page served without a version', () => {
    Story.story(
      update,
      Story.given({ ...ready, bootVersion: Option.none() }),
      Story.message(CheckedVersion({ version: 'build-2' })),
      Story.Command.expectNone()
    )
  })

  it('keeps the last data and shows offline while the server is unreachable', () => {
    const withEvents: Model = { ...ready, upcoming: { data: Option.some(events), failed: false } }
    Story.story(
      update,
      Story.given(withEvents),
      Story.message(FailedCheckVersion()),
      Story.model((model) => {
        expect(model.isOffline).toBe(true)
        expect(Option.getOrThrow(model.upcoming.data)).toHaveLength(2)
      }),
      Story.message(SucceededFetchUpcoming({ events })),
      Story.model((model) => {
        expect(model.isOffline).toBe(false)
      }),
      // An upstream failure means the frame server answered.
      Story.message(FailedFetchWeather({ isServerReachable: true })),
      Story.model((model) => {
        expect(model.isOffline).toBe(false)
        expect(model.weather.failed).toBe(true)
      })
    )

    expect(rendered({ ...withEvents, isOffline: true })).toContain('Offline')
  })

  it('retries settings with a delay instead of a tight loop', () => {
    Story.story(
      update,
      Story.given(initial),
      Story.message(FailedFetchSettings({ isServerReachable: false })),
      Story.model((model) => {
        expect(model.isOffline).toBe(true)
      }),
      Story.Command.expectExact(RetrySettings),
      Story.Command.resolve(RetrySettings, SucceededFetchSettings({ settings: new FrameSettings({ timezone }) })),
      Story.Command.resolve(FetchUpcoming, SucceededFetchUpcoming({ events })),
      Story.Command.resolve(FetchWeek, SucceededFetchWeek({ from: CalendarDate.make('2026-11-01'), events }))
    )
  })
})

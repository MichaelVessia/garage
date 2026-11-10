// @vitest-environment happy-dom
import { assert, describe, expect, it } from '@effect/vitest'
import * as Arr from 'effect/Array'
import * as DateTime from 'effect/DateTime'
import * as Option from 'effect/Option'
import * as Schema from 'effect/Schema'
import { Scene, Story } from 'foldkit'

import { CalendarDate, IanaTimezone, Weather } from '#shared'
import type { CalendarEvent, ShoppingItem } from '#shared'

import { AddShoppingItem, FetchWeather, FetchWeek, UpdateShoppingItem } from '../src/command.js'
import { init, update } from '../src/main.js'
import type { Model } from '../src/main.js'
import { Message } from '../src/message.js'
import { pastItemsMatching } from '../src/shopping.js'
import { view } from '../src/view.js'

const at = (iso: string) => DateTime.makeUnsafe(iso)

// Monday 2026-11-02, 10:00 in New York.
const initial = init({ now: at('2026-11-02T15:00:00Z'), bootVersion: Option.none() }).model

const ready: Model = {
  ...initial,
  timezone: Option.some(IanaTimezone.make('America/New_York')),
  anchor: Option.some(CalendarDate.make('2026-11-02')),
}

const swim: CalendarEvent = {
  _tag: 'TimedEvent',
  id: 'swim/1',
  title: 'Swim lesson',
  location: 'Community pool',
  description: 'Bring goggles',
  color: '#8e24aa',
  start: at('2026-11-02T22:00:00Z'),
  end: at('2026-11-02T23:30:00Z'),
}

const visit: CalendarEvent = {
  _tag: 'AllDayEvent',
  id: 'visit',
  title: 'Grandparents visiting',
  location: null,
  description: null,
  color: null,
  startDate: CalendarDate.make('2026-11-05'),
  endDate: CalendarDate.make('2026-11-08'),
}

const weather = Weather.make({
  condition: 'partlycloudy',
  temperature: 48,
  temperatureUnit: '°F',
  feelsLike: 44,
  humidity: 71,
  wind: { speed: 9.4, unit: 'mph', bearing: 315 },
  uvIndex: 2,
  hourly: [
    { time: at('2026-11-02T14:00:00Z'), condition: 'sunny', temperature: 46, precipitationProbability: 0 },
    { time: at('2026-11-02T16:00:00Z'), condition: 'rainy', temperature: 50, precipitationProbability: 60 },
  ],
  forecast: [
    {
      date: CalendarDate.make('2026-11-02'),
      condition: 'partlycloudy',
      high: 52,
      low: 40,
      precipitationProbability: 10,
    },
    { date: CalendarDate.make('2026-11-03'), condition: 'rainy', high: 55, low: 44, precipitationProbability: 80 },
  ],
})

const loaded: Model = {
  ...ready,
  upcoming: { data: Option.some([swim]), failed: false },
  week: { data: Option.some([swim, visit]), failed: false },
  weather: { data: Option.some(weather), failed: false },
}

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

const item = (uid: string, summary: string, status: ShoppingItem['status']): ShoppingItem => ({ uid, summary, status })

describe('detail sheets', () => {
  it('opens an event with its full time, location, and notes, and closes it again', () => {
    Story.story(
      update,
      Story.given(loaded),
      Story.message(Message.ClickedEvent({ event: swim })),
      Story.model((model) => {
        const html = rendered(model)
        expect(html).toContain('Monday, November 2')
        expect(html).toContain('5:00 PM – 6:30 PM · 1 h 30 min')
        expect(html).toContain('Community pool')
        expect(html).toContain('Bring goggles')
        expect(html).toContain('in 7 h')
        expect(html).toContain('Open day')
      }),
      Story.message(Message.ClosedDetail()),
      Story.model((model) => {
        expect(model.detail).toEqual(Option.none())
        expect(rendered(model)).not.toContain('sheet-layer')
      })
    )
  })

  it('shows a multi-day all-day event by its first and last day', () => {
    const html = rendered({ ...loaded, detail: Option.some({ _tag: 'EventDetail', event: visit }) })

    expect(html).toContain('Thursday, November 5 – Saturday, November 7')
    expect(html).toContain('All day')
  })

  it('opens the weather with its details, the hours ahead, and the coming days, refreshing it', () => {
    Story.story(
      update,
      Story.given(loaded),
      Story.message(Message.ClickedWeather()),
      Story.Command.expectExact(FetchWeather),
      Story.Command.resolve(FetchWeather, Message.SucceededFetchWeather({ weather })),
      Story.model((model) => {
        const html = rendered(model)
        expect(html).toContain('Feels like')
        expect(html).toContain('71%')
        expect(html).toContain('NW 9 mph')
        expect(html).toContain('Next hours')
        // The hour already over is left out; the one in progress and later ones stay.
        expect(html).not.toContain('"9 AM"')
        expect(html).toContain('11 AM')
        expect(html).toContain('60%')
        expect(html).toContain('Today')
        expect(html).toContain('Tuesday')
      })
    )
  })

  it('closes an open sheet when the frame dims', () => {
    Story.story(
      update,
      Story.given({ ...loaded, detail: Option.some({ _tag: 'WeatherDetail' }) }),
      Story.message(Message.TickedClock({ now: at('2026-11-02T15:06:00Z') })),
      Story.model((model) => {
        expect(model.isAmbient).toBe(true)
        expect(model.detail).toEqual(Option.none())
      })
    )
  })
})

describe('calendar shortcuts', () => {
  it('opens one day of the shown week without reloading it', () => {
    Story.story(
      update,
      Story.given({ ...loaded, detail: Option.some({ _tag: 'EventDetail', event: swim }) }),
      Story.message(Message.ClickedDate({ date: CalendarDate.make('2026-11-03'), mode: 'day' })),
      Story.model((model) => {
        expect(model.screen).toBe('calendar')
        expect(model.calendarMode).toBe('day')
        expect(model.anchor).toEqual(Option.some('2026-11-03'))
        expect(model.detail).toEqual(Option.none())
        expect(Option.isSome(model.week.data)).toBe(true)
      }),
      Story.Command.expectNone()
    )
  })

  it('loads the week when the day opened is in another week', () => {
    Story.story(
      update,
      Story.given(loaded),
      Story.message(Message.ClickedDate({ date: CalendarDate.make('2026-11-09'), mode: 'day' })),
      Story.model((model) => {
        expect(model.week.data).toEqual(Option.none())
      }),
      Story.Command.expectExact(FetchWeek({ from: CalendarDate.make('2026-11-08') })),
      Story.Command.resolve(
        FetchWeek,
        Message.SucceededFetchWeek({ from: CalendarDate.make('2026-11-08'), events: [] })
      )
    )
  })

  it('makes every Today event, weather card, day heading, and title open more', () => {
    const today = rendered(loaded)
    expect(today).toContain('Weather details')
    expect(today).toContain('Open this week')
    expect(today).toContain('card-link')

    const week = rendered({ ...loaded, screen: 'calendar' })
    expect(week).toContain('Open Thursday, November 5')
  })
})

describe('shopping quick add', () => {
  const items = [
    item('o1', 'Milk', 'needs_action'),
    item('c1', 'milk ', 'completed'),
    item('c2', 'Bananas', 'completed'),
    item('c3', 'Bread', 'completed'),
    item('c4', 'bananas', 'completed'),
    item('c5', 'Bagels', 'completed'),
  ]

  it('offers past items not on the list, most often bought first, matching what is typed', () => {
    expect(Arr.map(pastItemsMatching(items, ''), (past) => past.item.summary)).toEqual(['Bananas', 'Bread', 'Bagels'])
    expect(Arr.map(pastItemsMatching(items, 'b'), (past) => past.item.summary)).toEqual(['Bananas', 'Bread', 'Bagels'])
    expect(Arr.map(pastItemsMatching(items, 'ag'), (past) => past.item.summary)).toEqual(['Bagels'])
  })

  it('puts a past item back on the list with one tap', () => {
    const shopping: Model = { ...ready, screen: 'shopping', shopping: { data: Option.some(items), failed: false } }

    expect(rendered(shopping)).toContain('Add Bananas again')

    Story.story(
      update,
      Story.given(shopping),
      Story.message(Message.ClickedShoppingItem({ uid: 'c2', status: 'needs_action' })),
      Story.Command.expectExact(UpdateShoppingItem({ uid: 'c2', status: 'needs_action' })),
      Story.Command.resolve(UpdateShoppingItem, Message.SucceededFetchShopping({ items }))
    )
  })

  it('reopens a typed item bought before instead of adding it twice', () => {
    Story.story(
      update,
      Story.given({ ...ready, shopping: { data: Option.some(items), failed: false } }),
      Story.message(Message.ChangedShoppingDraft({ value: ' bread' })),
      Story.message(Message.SubmittedShoppingItem()),
      Story.model((model) => {
        expect(model.shoppingDraft).toBe('')
      }),
      Story.Command.expectExact(UpdateShoppingItem({ uid: 'c3', status: 'needs_action' })),
      Story.Command.resolve(UpdateShoppingItem, Message.SucceededFetchShopping({ items }))
    )
  })

  it('ignores a typed item already on the list and adds a new one', () => {
    Story.story(
      update,
      Story.given({ ...ready, shopping: { data: Option.some(items), failed: false } }),
      Story.message(Message.ChangedShoppingDraft({ value: 'MILK' })),
      Story.message(Message.SubmittedShoppingItem()),
      Story.Command.expectNone(),
      Story.message(Message.ChangedShoppingDraft({ value: 'Coffee' })),
      Story.message(Message.SubmittedShoppingItem()),
      Story.Command.expectExact(AddShoppingItem({ summary: 'Coffee' })),
      Story.Command.resolve(AddShoppingItem, Message.SucceededFetchShopping({ items }))
    )
  })
})

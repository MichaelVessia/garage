// @vitest-environment happy-dom
import { describe, expect, it } from '@effect/vitest'
import * as Arr from 'effect/Array'
import * as DateTime from 'effect/DateTime'
import * as Option from 'effect/Option'
import * as Str from 'effect/String'
import { Scene, Story } from 'foldkit'

import { CalendarDate, FrameSettings, IanaTimezone, MediaSnapshot, Weather } from '#shared'
import type { CalendarEvent } from '#shared'

import {
  AddShoppingItem,
  CheckVersion,
  FetchMedia,
  FetchShopping,
  FetchUpcoming,
  FetchWeek,
  ReloadPage,
  RetrySettings,
  RunMediaAction,
  UpdateShoppingItem,
} from '../src/command.js'
import { init, update } from '../src/main.js'
import type { Model } from '../src/main.js'
import { Message } from '../src/message.js'
import { view } from '../src/view.js'

const timezone = IanaTimezone.make('America/New_York')

// Monday 2026-11-02, 10:00 in New York.
const now = DateTime.makeUnsafe('2026-11-02T15:00:00Z')
const at = (iso: string) => DateTime.makeUnsafe(iso)

const initial = init({ now, bootVersion: Option.some('build-1') }).model

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

const media = MediaSnapshot.make({
  spotify: null,
  cards: [
    {
      _tag: 'PlayerCard',
      player: {
        entityId: 'media_player.receiver',
        name: 'Receiver',
        status: 'on',
        controls: ['power', 'volume', 'mute'],
        canSkip: false,
        isMuted: false,
        volume: 0.4,
        source: null,
        sources: [],
        nowPlaying: null,
      },
    },
    {
      _tag: 'ZonesCard',
      speakers: {
        zones: [{ entityId: 'switch.zone_a', name: 'Zone A', isOn: false, isAvailable: true }],
        hasAllOn: false,
        hasAllOff: false,
      },
    },
  ],
})

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
      Story.message(Message.SucceededFetchSettings({ settings: FrameSettings.make({ timezone }) })),
      Story.model((model) => {
        expect(model.anchor).toEqual(Option.some('2026-11-02'))
      }),
      Story.Command.expectExact(FetchUpcoming, FetchWeek),
      Story.Command.resolve(FetchUpcoming, Message.SucceededFetchUpcoming({ events })),
      Story.Command.resolve(FetchWeek, Message.SucceededFetchWeek({ from: CalendarDate.make('2026-11-01'), events })),
      Story.model((model) => {
        expect(Option.getOrElse(model.upcoming.data, () => [])).toHaveLength(2)
        expect(Option.getOrElse(model.week.data, () => [])).toHaveLength(2)
      })
    )
  })

  it('pages the week view and ignores a response for a week no longer shown', () => {
    Story.story(
      update,
      Story.given(ready),
      Story.message(Message.ClickedShift({ direction: 1 })),
      Story.model((model) => {
        expect(model.anchor).toEqual(Option.some('2026-11-09'))
        expect(model.week.data).toEqual(Option.none())
      }),
      Story.Command.expectExact(FetchWeek),
      Story.Command.resolve(FetchWeek, Message.SucceededFetchWeek({ from: CalendarDate.make('2026-11-01'), events })),
      Story.model((model) => {
        expect(model.week.data).toEqual(Option.none())
      })
    )
  })

  it('checks off a shopping item optimistically and saves it', () => {
    Story.story(
      update,
      Story.given({ ...ready, shopping: { data: Option.some(shopping), failed: false } }),
      Story.message(Message.ClickedShoppingItem({ uid: 'a1', status: 'completed' })),
      Story.model((model) => {
        expect(Option.getOrElse(model.shopping.data, () => [])[0]?.status).toBe('completed')
      }),
      Story.Command.expectExact(UpdateShoppingItem),
      Story.Command.resolve(
        UpdateShoppingItem,
        Message.SucceededFetchShopping({ items: [{ uid: 'a1', summary: 'Milk', status: 'completed' }] })
      )
    )
  })

  it('adds a typed shopping item and clears the draft', () => {
    Story.story(
      update,
      Story.given({ ...ready, shopping: { data: Option.some(shopping), failed: false } }),
      Story.message(Message.ChangedShoppingDraft({ value: '  Bread  ' })),
      Story.message(Message.SubmittedShoppingItem()),
      Story.model((model) => {
        expect(model.shoppingDraft).toBe('')
      }),
      Story.Command.expectExact(AddShoppingItem({ summary: 'Bread' })),
      Story.Command.resolve(
        AddShoppingItem,
        Message.SucceededFetchShopping({
          items: [...shopping, { uid: 'c3', summary: 'Bread', status: 'needs_action' }],
        })
      ),
      Story.model((model) => {
        expect(Option.getOrElse(model.shopping.data, () => [])).toHaveLength(3)
      })
    )
  })

  it('ignores a blank shopping item', () => {
    Story.story(
      update,
      Story.given(ready),
      Story.message(Message.ChangedShoppingDraft({ value: '   ' })),
      Story.message(Message.SubmittedShoppingItem()),
      Story.Command.expectNone()
    )
  })

  it('loads media when the Media screen opens', () => {
    Story.story(
      update,
      Story.given(ready),
      Story.message(Message.ClickedScreen({ screen: 'media' })),
      Story.Command.expectExact(FetchMedia),
      Story.Command.resolve(FetchMedia, Message.SucceededFetchMedia({ media })),
      Story.model((model) => {
        expect(model.screen).toBe('media')
        expect(Option.getOrNull(model.media.data)?.cards ?? []).toHaveLength(2)
      })
    )
  })

  it('turns a speaker zone on optimistically and sends the action', () => {
    Story.story(
      update,
      Story.given({ ...ready, screen: 'media', media: { data: Option.some(media), failed: false } }),
      Story.message(Message.ClickedMediaAction({ action: { _tag: 'ZoneOn', entityId: 'switch.zone_a' } })),
      Story.model((model) => {
        const [, zones] = Option.getOrNull(model.media.data)?.cards ?? []
        expect(zones?._tag === 'ZonesCard' ? zones.speakers.zones[0]?.isOn : undefined).toBe(true)
      }),
      Story.Command.expectExact(RunMediaAction({ action: { _tag: 'ZoneOn', entityId: 'switch.zone_a' } })),
      Story.Command.resolve(RunMediaAction, Message.SucceededFetchMedia({ media }))
    )
  })

  it('reloads the real media state when an action fails', () => {
    Story.story(
      update,
      Story.given({ ...ready, screen: 'media', media: { data: Option.some(media), failed: false } }),
      Story.message(Message.FailedMediaAction()),
      Story.Command.expectExact(FetchMedia),
      Story.Command.resolve(FetchMedia, Message.SucceededFetchMedia({ media }))
    )
  })

  it('refreshes the shopping list when that screen opens', () => {
    Story.story(
      update,
      Story.given(ready),
      Story.message(Message.ClickedScreen({ screen: 'shopping' })),
      Story.model((model) => {
        expect(model.screen).toBe('shopping')
      }),
      Story.Command.expectExact(FetchShopping),
      Story.Command.resolve(FetchShopping, Message.SucceededFetchShopping({ items: shopping }))
    )
  })

  it('dims to the ambient clock when idle, sooner at night, and wakes on touch', () => {
    Story.story(
      update,
      Story.given(ready),
      Story.message(Message.TickedClock({ now: at('2026-11-02T15:04:00Z') })),
      Story.model((model) => {
        expect(model.isAmbient).toBe(false)
      }),
      Story.message(Message.TickedClock({ now: at('2026-11-02T15:06:00Z') })),
      Story.model((model) => {
        expect(model.isAmbient).toBe(true)
      }),
      Story.message(Message.Interacted()),
      Story.model((model) => {
        expect(model.isAmbient).toBe(false)
      })
    )

    // 23:00 in New York: one idle minute is enough.
    const late = { ...ready, now: at('2026-11-03T04:00:00Z'), lastInteraction: at('2026-11-03T04:00:00Z') }
    Story.story(
      update,
      Story.given(late),
      Story.message(Message.TickedClock({ now: at('2026-11-03T04:01:30Z') })),
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
          Weather.make({
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
    // 10:00 renders one fixed-width box per digit, on the Today clock and the rail clock.
    expect(Option.getOrNull(Str.match(/clock-digit/gu)(todayHtml))).toHaveLength(8)
    expect(todayHtml).toContain('Monday, November 2')
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

  it('always shows the next event on Today, even when it is on a later day', () => {
    const later: ReadonlyArray<CalendarEvent> = [
      {
        _tag: 'TimedEvent',
        id: 'breakfast',
        title: 'Breakfast',
        location: null,
        color: null,
        start: at('2026-11-02T12:00:00Z'),
        end: at('2026-11-02T13:00:00Z'),
      },
      {
        _tag: 'TimedEvent',
        id: 'dentist',
        title: 'Dentist',
        location: 'Main Street',
        color: null,
        start: at('2026-11-03T15:00:00Z'),
        end: at('2026-11-03T16:00:00Z'),
      },
    ]

    // Monday 21:00 in New York: today's only event is over.
    const html = rendered({
      ...ready,
      now: at('2026-11-03T02:00:00Z'),
      upcoming: { data: Option.some(later), failed: false },
    })

    expect(html).toContain('Nothing else today')
    // The finished day's rows give way to the next event; nothing points at past rows.
    expect(html).not.toContain('Breakfast')
    expect(html).not.toContain(' more')
    expect(html).toContain('is-next')
    expect(html).toContain('Dentist')
    expect(html).toContain('Tomorrow')
    expect(html).toContain('in 13 h')
  })

  it('paints each event in its Google Calendar colour with readable text, wherever it appears', () => {
    // A light extended-palette label for the timed event, a dark red for the all-day one.
    const coloured = Arr.map(events, (event): CalendarEvent => ({
      ...event,
      color: event._tag === 'AllDayEvent' ? '#d50000' : '#c0ca33',
    }))

    const loaded: Model = {
      ...ready,
      upcoming: { data: Option.some(coloured), failed: false },
      week: { data: Option.some(coloured), failed: false },
    }

    const todayHtml = rendered(loaded)
    expect(todayHtml).toContain('"is-coloured":true')
    expect(todayHtml).toContain('"--ev":"#c0ca33","--on-ev":"#14171c"')
    expect(todayHtml).toContain('"--ev":"#d50000","--on-ev":"#ffffff"')
    expect(rendered({ ...loaded, screen: 'calendar' })).toContain('"--ev":"#c0ca33"')
    expect(rendered({ ...loaded, isAmbient: true })).toContain('"--ev":"#c0ca33"')
    expect(rendered(ready)).not.toContain('is-coloured')
  })

  it('uses the light theme by day and the dark theme from 20:00 to 06:59', () => {
    expect(rendered(ready)).toContain('theme-light')
    // 20:00 and 06:30 in New York.
    expect(rendered({ ...ready, now: at('2026-11-03T01:00:00Z') })).toContain('theme-dark')
    expect(rendered({ ...ready, now: at('2026-11-02T11:30:00Z') })).toContain('theme-dark')
    expect(rendered({ ...ready, now: at('2026-11-02T12:00:00Z') })).toContain('theme-light')
  })

  it('reloads when the server reports a different version than the page booted with', () => {
    Story.story(
      update,
      Story.given(ready),
      Story.message(Message.RefreshDue({ source: 'version' })),
      Story.Command.resolve(CheckVersion, Message.CheckedVersion({ version: 'build-1' })),
      Story.Command.expectNone(),
      Story.message(Message.RefreshDue({ source: 'version' })),
      Story.Command.resolve(CheckVersion, Message.CheckedVersion({ version: 'build-2' })),
      Story.Command.expectExact(ReloadPage),
      Story.Command.resolve(ReloadPage, Message.StartedReload())
    )
  })

  it('never reloads a page served without a version', () => {
    Story.story(
      update,
      Story.given({ ...ready, bootVersion: Option.none() }),
      Story.message(Message.CheckedVersion({ version: 'build-2' })),
      Story.Command.expectNone()
    )
  })

  it('keeps the last data and shows offline while the server is unreachable', () => {
    const withEvents: Model = { ...ready, upcoming: { data: Option.some(events), failed: false } }
    Story.story(
      update,
      Story.given(withEvents),
      Story.message(Message.FailedCheckVersion()),
      Story.model((model) => {
        expect(model.isOffline).toBe(true)
        expect(Option.getOrElse(model.upcoming.data, () => [])).toHaveLength(2)
      }),
      Story.message(Message.SucceededFetchUpcoming({ events })),
      Story.model((model) => {
        expect(model.isOffline).toBe(false)
      }),
      // An upstream failure means the frame server answered.
      Story.message(Message.FailedFetchWeather({ isServerReachable: true })),
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
      Story.message(Message.FailedFetchSettings({ isServerReachable: false })),
      Story.model((model) => {
        expect(model.isOffline).toBe(true)
      }),
      Story.Command.expectExact(RetrySettings),
      Story.Command.resolve(
        RetrySettings,
        Message.SucceededFetchSettings({ settings: FrameSettings.make({ timezone }) })
      ),
      Story.Command.resolve(FetchUpcoming, Message.SucceededFetchUpcoming({ events })),
      Story.Command.resolve(FetchWeek, Message.SucceededFetchWeek({ from: CalendarDate.make('2026-11-01'), events }))
    )
  })
})

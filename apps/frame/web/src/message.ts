import * as Schema from 'effect/Schema'
import { m } from 'foldkit/message'

import { CalendarDate, CalendarEvent, FrameSettings, ShoppingItem, ShoppingItemStatus, Weather } from '#shared'

/** Screens reachable from the rail. */
export const Screen = Schema.Literals(['today', 'calendar', 'shopping'])
export type Screen = typeof Screen.Type

/** Calendar layouts. */
export const CalendarMode = Schema.Literals(['day', 'week'])
export type CalendarMode = typeof CalendarMode.Type

// ============================================
// Messages
// ============================================

export const TickedClock = m('TickedClock', { now: Schema.DateTimeUtc })
export const Interacted = m('Interacted')
export const ClickedScreen = m('ClickedScreen', { screen: Screen })
export const ClickedCalendarMode = m('ClickedCalendarMode', { mode: CalendarMode })
export const ClickedShift = m('ClickedShift', { direction: Schema.Literals([-1, 1]) })
export const ClickedToday = m('ClickedToday')
export const ClickedShoppingItem = m('ClickedShoppingItem', { uid: Schema.String, status: ShoppingItemStatus })
export const RefreshDue = m('RefreshDue', { source: Schema.Literals(['calendar', 'weather', 'shopping', 'version']) })

export const SucceededFetchSettings = m('SucceededFetchSettings', { settings: FrameSettings })
export const FailedFetchSettings = m('FailedFetchSettings', { isServerReachable: Schema.Boolean })
export const SucceededFetchUpcoming = m('SucceededFetchUpcoming', { events: Schema.Array(CalendarEvent) })
export const FailedFetchUpcoming = m('FailedFetchUpcoming', { isServerReachable: Schema.Boolean })
export const SucceededFetchWeek = m('SucceededFetchWeek', { from: CalendarDate, events: Schema.Array(CalendarEvent) })
export const FailedFetchWeek = m('FailedFetchWeek', { isServerReachable: Schema.Boolean })
export const SucceededFetchWeather = m('SucceededFetchWeather', { weather: Weather })
export const FailedFetchWeather = m('FailedFetchWeather', { isServerReachable: Schema.Boolean })
export const SucceededFetchShopping = m('SucceededFetchShopping', { items: Schema.Array(ShoppingItem) })
export const FailedFetchShopping = m('FailedFetchShopping', { isServerReachable: Schema.Boolean })

// A deploy is detected by comparing the server's version with the one this page booted with.
export const CheckedVersion = m('CheckedVersion', { version: Schema.String })
export const FailedCheckVersion = m('FailedCheckVersion')
export const StartedReload = m('StartedReload')

const Message = Schema.Union([
  TickedClock,
  Interacted,
  ClickedScreen,
  ClickedCalendarMode,
  ClickedShift,
  ClickedToday,
  ClickedShoppingItem,
  RefreshDue,
  SucceededFetchSettings,
  FailedFetchSettings,
  SucceededFetchUpcoming,
  FailedFetchUpcoming,
  SucceededFetchWeek,
  FailedFetchWeek,
  SucceededFetchWeather,
  FailedFetchWeather,
  SucceededFetchShopping,
  FailedFetchShopping,
  CheckedVersion,
  FailedCheckVersion,
  StartedReload,
])
export type Message = typeof Message.Type

import * as Schema from 'effect/Schema'
import { defineMessageUnion } from 'foldkit/message'

import {
  CalendarDate,
  CalendarEvent,
  FrameSettings,
  MediaAction,
  MediaSnapshot,
  ShoppingItem,
  ShoppingItemStatus,
  Weather,
} from '#shared'

/** Screens reachable from the rail. */
export const Screen = Schema.Literals(['today', 'calendar', 'shopping', 'media'])
export type Screen = typeof Screen.Type

/** Calendar layouts. */
export const CalendarMode = Schema.Literals(['day', 'week'])
export type CalendarMode = typeof CalendarMode.Type

// ============================================
// Messages
// ============================================

export const Message = defineMessageUnion({
  TickedClock: { now: Schema.DateTimeUtc },
  Interacted: {},
  ClickedScreen: { screen: Screen },
  ClickedCalendarMode: { mode: CalendarMode },
  ClickedShift: { direction: Schema.Literals([-1, 1]) },
  ClickedToday: {},
  ClickedShoppingItem: { uid: Schema.String, status: ShoppingItemStatus },
  ChangedShoppingDraft: { value: Schema.String },
  SubmittedShoppingItem: {},
  ClickedMediaAction: { action: MediaAction },
  RefreshDue: {
    source: Schema.Literals(['calendar', 'weather', 'shopping', 'media', 'version']),
  },

  SucceededFetchSettings: { settings: FrameSettings },
  FailedFetchSettings: { isServerReachable: Schema.Boolean },
  SucceededFetchUpcoming: { events: Schema.Array(CalendarEvent) },
  FailedFetchUpcoming: { isServerReachable: Schema.Boolean },
  SucceededFetchWeek: { from: CalendarDate, events: Schema.Array(CalendarEvent) },
  FailedFetchWeek: { isServerReachable: Schema.Boolean },
  SucceededFetchWeather: { weather: Weather },
  FailedFetchWeather: { isServerReachable: Schema.Boolean },
  SucceededFetchShopping: { items: Schema.Array(ShoppingItem) },
  FailedFetchShopping: { isServerReachable: Schema.Boolean },
  SucceededFetchMedia: { media: MediaSnapshot },
  FailedFetchMedia: { isServerReachable: Schema.Boolean },
  // A refused or failed media change; the screen reloads the real state.
  FailedMediaAction: {},

  // A deploy is detected by comparing the server's version with the one this page booted with.
  CheckedVersion: { version: Schema.String },
  FailedCheckVersion: {},
  StartedReload: {},
})
export type Message = typeof Message.Type

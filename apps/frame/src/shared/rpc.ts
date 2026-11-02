import * as Schema from 'effect/Schema'
import { Rpc, RpcGroup } from 'effect/unstable/rpc'

import { MediaActionRejected, UpstreamUnavailable } from './errors.js'
import { MediaAction, MediaSnapshot } from './media.js'
import {
  CalendarEvent,
  CalendarWindow,
  FrameSettings,
  ShoppingItem,
  ShoppingItemAddition,
  ShoppingItemUpdate,
  Weather,
} from './model.js'

/** The frame's server contract, shared by the Bun server and the browser. */
export const FrameRpcs = RpcGroup.make(
  Rpc.make('GetSettings', {
    success: FrameSettings,
  }),
  Rpc.make('GetCalendar', {
    payload: CalendarWindow,
    success: Schema.Array(CalendarEvent),
    error: UpstreamUnavailable,
  }),
  Rpc.make('GetWeather', {
    success: Weather,
    error: UpstreamUnavailable,
  }),
  Rpc.make('GetShopping', {
    success: Schema.Array(ShoppingItem),
    error: UpstreamUnavailable,
  }),
  Rpc.make('AddShoppingItem', {
    payload: ShoppingItemAddition,
    success: Schema.Array(ShoppingItem),
    error: UpstreamUnavailable,
  }),
  Rpc.make('UpdateShoppingItem', {
    payload: ShoppingItemUpdate,
    success: Schema.Array(ShoppingItem),
    error: UpstreamUnavailable,
  }),
  Rpc.make('GetMedia', {
    success: MediaSnapshot,
    error: UpstreamUnavailable,
  }),
  Rpc.make('RunMediaAction', {
    payload: MediaAction,
    success: MediaSnapshot,
    error: Schema.Union([UpstreamUnavailable, MediaActionRejected]),
  })
)

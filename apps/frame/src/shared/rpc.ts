import * as Schema from 'effect/Schema'
import { Rpc, RpcGroup } from 'effect/unstable/rpc'

import { UpstreamUnavailable } from './errors.js'
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
  })
)

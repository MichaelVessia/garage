import type * as Config from 'effect/Config'
import type * as HttpClient from 'effect/http/HttpClient'
import * as Layer from 'effect/Layer'

import { CalendarFeedLive } from './calendar/http.js'
import { CalendarConfigLive } from './calendar/services.js'
import type { CalendarFeed } from './calendar/services.js'
import type { CalendarError, HomeAssistantError } from './errors.js'
import { FrameHandlersLive } from './handlers.js'
import { HomeAssistantApiLive } from './home-assistant/http.js'
import { HomeAssistantConfigLive } from './home-assistant/services.js'
import type { HomeAssistantApi } from './home-assistant/services.js'
import { FrameTimezoneLive } from './settings.js'
import type { FrameTimezone } from './settings.js'

const CalendarLive = CalendarFeedLive.pipe(Layer.provide(CalendarConfigLive))

const HomeAssistantLive = HomeAssistantApiLive.pipe(Layer.provide(HomeAssistantConfigLive))

const FrameAdaptersLive = Layer.merge(CalendarLive, HomeAssistantLive).pipe(Layer.provideMerge(FrameTimezoneLive))

type FrameAppServices = Layer.Success<typeof FrameHandlersLive> | CalendarFeed | HomeAssistantApi | FrameTimezone

type FrameAppError = CalendarError | HomeAssistantError | Config.ConfigError

/** Composed frame RPC handlers and live upstream adapters; caller provides `HttpClient` and config. */
export const FrameAppLive: Layer.Layer<FrameAppServices, FrameAppError, HttpClient.HttpClient> = FrameHandlersLive.pipe(
  Layer.provideMerge(FrameAdaptersLive)
)

import type * as HttpClient from 'effect/http/HttpClient'
import * as Option from 'effect/Option'
import * as Schema from 'effect/Schema'
import type { Command, Update } from 'foldkit'
import { UrlRequest } from 'foldkit/navigation'
import { taggedStruct } from 'foldkit/schema'
import { Url } from 'foldkit/url'

import { IanaTimezone } from '#shared'

import type { Api } from './api.js'
import { AuthMessage, SessionUser } from './auth.js'
import { FailedFetchSettings, SettingsData, SucceededFetchSettings } from './data/settings.js'
import { InjectionsMessage, InjectionsModel } from './page/injections/model.js'
import { LoginMessage, LoginModel } from './page/login.js'
import { ScheduleViewMessage, ScheduleViewModel } from './page/schedule-view.js'
import { ScheduleMessage, ScheduleModel } from './page/schedule/model.js'
import { SettingsModel, SettingsPageMessage } from './page/settings/model.js'
import { StatsMessage, StatsModel } from './page/stats/model.js'
import type { StatsRange } from './page/stats/model.js'
import { WeightMessage, WeightModel } from './page/weight/model.js'
import { AppRoute } from './route.js'

// ============================================
// Model
// ============================================

export const Flags = Schema.Struct({
  timezone: IanaTimezone,
})

export type Flags = typeof Flags.Type

export const Model = Schema.Struct({
  route: AppRoute,
  detectedTimezone: IanaTimezone,
  user: Schema.NullOr(SessionUser),
  sessionLoaded: Schema.Boolean,
  login: LoginModel,
  settings: SettingsData,
  settingsPage: SettingsModel,
  settingsRequestGeneration: Schema.Int,
  weight: WeightModel,
  injections: InjectionsModel,
  schedule: ScheduleModel,
  scheduleView: ScheduleViewModel,
  stats: StatsModel,
})

export type Model = typeof Model.Type

// ============================================
// Messages
// ============================================

export const ClickedLink = taggedStruct('ClickedLink', { request: UrlRequest })
export const ChangedUrl = taggedStruct('ChangedUrl', { url: Url })
export const NavigationDone = taggedStruct('NavigationDone')
export const ClickedSignOut = taggedStruct('ClickedSignOut')
export const ClickedRetrySettings = taggedStruct('ClickedRetrySettings')

export const SettingsMessage = Schema.Union([SucceededFetchSettings, FailedFetchSettings, ClickedRetrySettings])

export type SettingsMessage = typeof SettingsMessage.Type

export const Message = Schema.Union([
  ClickedLink,
  ChangedUrl,
  NavigationDone,
  ClickedSignOut,
  AuthMessage,
  LoginMessage,
  SettingsMessage,
  SettingsPageMessage,
  WeightMessage,
  InjectionsMessage,
  ScheduleMessage,
  ScheduleViewMessage,
  StatsMessage,
])

export type Message = typeof Message.Type

export type AppResources = Api | HttpClient.HttpClient

export type Commands = ReadonlyArray<Command.Command<Message, never, AppResources>>

export type UpdateReturn = Update.Return<Model, Message, AppResources>

export const statsRangeOf = (model: Model): StatsRange =>
  model.route._tag === 'Stats'
    ? { end: model.route.end, start: model.route.start }
    : { end: Option.none(), start: Option.none() }

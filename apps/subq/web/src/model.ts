import { UiSchema } from '@effect/ui'
import { CalendarDate, IanaTimezone, projectInstantToCalendarDate } from '@garage/subq-domain/Calendar'
import type { JournalSnapshot } from '@garage/subq-domain/ExportFormat'
import { JournalProfile } from '@garage/subq-domain/Journal/JournalProfile.view'
import { Injections, Weights } from '@garage/subq-domain/Journal/JournalState'
import * as Arr from 'effect/Array'
import * as Option from 'effect/Option'
import * as P from 'effect/Predicate'
import * as Record from 'effect/Record'
import * as Schema from 'effect/Schema'

import { InjectionsMessage, InjectionsModel } from './page/injections/model.ts'
import { ScheduleMessage, ScheduleModel } from './page/schedule/model.ts'
import { SettingsModel, SettingsPageMessage } from './page/settings/model.ts'
import { StatsMessage, StatsModel } from './page/stats/model.ts'
import type { StatsRange } from './page/stats/model.ts'
import { WeightMessage, WeightModel } from './page/weight/model.ts'
import { AppRoute } from './route.ts'

export const Flags = Schema.Struct({
  route: AppRoute,
  session: Schema.String,
  today: CalendarDate,
  timezone: IanaTimezone,
})
export type Flags = typeof Flags.Type

const Profile = Schema.toType(JournalProfile.State)
const Read = Schema.Literals(['profile', 'weights', 'injectionHistory'])

export const Model = Schema.Struct({
  route: AppRoute,
  detectedTimezone: IanaTimezone,
  initialToday: CalendarDate,
  now: Schema.NullOr(Schema.DateTimeUtc),
  profile: Schema.NullOr(Profile),
  weights: Schema.NullOr(Weights),
  injectionHistory: Schema.NullOr(Injections),
  readErrors: Schema.Record(Read, Schema.Boolean),
  commandIds: Schema.Struct({ session: Schema.String, sent: Schema.Int }),
  timezoneBootstrapSent: Schema.Boolean,
  saving: Schema.Boolean,
  mutationError: Schema.NullOr(Schema.String),
  sessionExpired: Schema.Boolean,
  settingsPage: SettingsModel,
  weight: WeightModel,
  injections: InjectionsModel,
  schedule: ScheduleModel,
  stats: StatsModel,
})
export type Model = typeof Model.Type

const PageMessage = Schema.Union([SettingsPageMessage, WeightMessage, InjectionsMessage, ScheduleMessage, StatsMessage])
type PageMessage = typeof PageMessage.Type

export const Shell = UiSchema.TaggedEnum({
  ChangedRoute: { route: AppRoute },
  ClickedReload: {},
  ReceivedProfile: { profile: Schema.NullOr(Profile) },
  ReceivedWeights: { weights: Schema.NullOr(Weights) },
  ReceivedInjections: { injections: Schema.NullOr(Injections) },
  ReadFailed: { read: Read },
  SessionExpired: {},
  Tick: { now: Schema.DateTimeUtc },
  InitializedTimezone: {},
  FailedInitializeTimezone: { message: Schema.String },
  SucceededMutation: { message: PageMessage },
  FailedMutation: { message: PageMessage, error: Schema.String },
})

export type ReadName = typeof Read.Type
export const Message = Schema.Union([Shell, PageMessage])
export type Message = typeof Message.Type

const decodeRange = Schema.decodeOption(
  Schema.Struct({ start: Schema.OptionFromOptional(CalendarDate), end: Schema.OptionFromOptional(CalendarDate) })
)

const lastDateParameter = (value?: string | readonly [string, ...ReadonlyArray<string>]) =>
  P.isString(value) || P.isUndefined(value) ? value : Arr.lastNonEmpty(value)

export const statsRangeOf = (route: AppRoute): Option.Option<StatsRange> =>
  P.isTagged(route, 'Stats') || P.isTagged(route, 'Index')
    ? decodeRange({ start: lastDateParameter(route.search.start), end: lastDateParameter(route.search.end) })
    : Option.none()

export const timezoneOf = (model: Model): IanaTimezone => model.profile?.preferences.timezone ?? model.detectedTimezone
export const todayOf = (model: Model): CalendarDate =>
  model.now === null ? model.initialToday : projectInstantToCalendarDate(model.now, timezoneOf(model))

export const journalData = (model: Model): Option.Option<JournalSnapshot['data']> =>
  model.profile === null || model.weights === null || model.injectionHistory === null
    ? Option.none()
    : Option.some({
        preferences: model.profile.preferences,
        weights: Record.values(model.weights),
        injections: Record.values(model.injectionHistory),
        schedules: Record.values(model.profile.schedules),
        goals: Record.values(model.profile.goals),
      })

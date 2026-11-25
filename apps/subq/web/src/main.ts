import * as DomainFoldkit from '@alchemy.run/domain/Foldkit'
import { PERSONAL_JOURNAL_ID } from '@garage/subq-domain/Journal/Journal.id'
import { Unauthorized } from '@garage/subq-domain/Session.middleware'
import * as DateTime from 'effect/DateTime'
import * as Duration from 'effect/Duration'
import * as Effect from 'effect/Effect'
import * as Function from 'effect/Function'
import * as Match from 'effect/Match'
import * as Option from 'effect/Option'
import * as Record from 'effect/Record'
import * as Schema from 'effect/Schema'
import * as Stream from 'effect/Stream'
import { Command, Subscription } from 'foldkit'
import type { Runtime } from 'foldkit'
import { load, pushUrl } from 'foldkit/navigation'
import { toString as urlToString } from 'foldkit/url'
import type { Url } from 'foldkit/url'

import { client, mutate } from './client.ts'
import type { Client, PageUpdate } from './client.ts'
import { journalData, Shell, statsRangeOf, timezoneOf, todayOf } from './model.ts'
import type { Flags, Message, Model, ReadName, UpdateReturn } from './model.ts'
import { InjectionsMessage, initialInjectionsModel } from './page/injections/model.ts'
import { updateInjections } from './page/injections/update.ts'
import { ScheduleMessage, initialScheduleModel } from './page/schedule/model.ts'
import { updateSchedule } from './page/schedule/update.ts'
import { SettingsPageMessage, initialSettingsModel } from './page/settings/model.ts'
import { updateSettingsPage } from './page/settings/update.ts'
import { StatsMessage, initialStatsModel } from './page/stats/model.ts'
import { updateStats } from './page/stats/update.ts'
import { WeightMessage, initialWeightModel } from './page/weight/model.ts'
import { updateWeight } from './page/weight/update.ts'
import { urlToAppRoute } from './route.ts'

const Navigate = Command.define('Navigate', {
  args: { url: Schema.String },
  messages: [Shell.NavigationDone],
  execute: ({ url }) => pushUrl(url).pipe(Effect.as(Shell.NavigationDone())),
})
const LoadUrl = Command.define('LoadUrl', {
  args: { url: Schema.String },
  messages: [Shell.NavigationDone],
  execute: ({ url }) => load(url).pipe(Effect.as(Shell.NavigationDone())),
})
const Reload = Command.define('Reload', {
  messages: [Shell.Reloaded],
  execute: Effect.sync(() => location.reload()).pipe(Effect.as(Shell.Reloaded())),
})

const changeUrl = (model: Model, url: Url): Model => {
  const next = { ...model, route: urlToAppRoute(url) }
  const range = statsRangeOf(next)
  return {
    ...next,
    stats: {
      ...next.stats,
      customStart: Option.getOrElse(range.start, () => ''),
      customEnd: Option.getOrElse(range.end, () => ''),
    },
  }
}

type InitReturn = ReturnType<Runtime.RoutingApplicationInit<Model, Message, Flags, Client>>

export const init: {
  (url: Url): (flags: Flags) => InitReturn
  (flags: Flags, url: Url): InitReturn
} = Function.dual(2, (flags: Flags, url: Url): InitReturn => ({
  model: changeUrl(
    {
      route: urlToAppRoute(url),
      detectedTimezone: flags.timezone,
      initialToday: flags.today,
      now: null,
      profile: null,
      weights: null,
      injectionHistory: null,
      readErrors: { profile: false, weights: false, injectionHistory: false },
      commandIds: { session: flags.session, sent: 0 },
      timezoneBootstrapSent: false,
      saving: false,
      mutationError: null,
      sessionExpired: false,
      settingsPage: initialSettingsModel,
      injections: initialInjectionsModel,
      weight: initialWeightModel,
      schedule: initialScheduleModel,
      stats: initialStatsModel,
    },
    url
  ),
}))

const isWeightMessage = Schema.is(WeightMessage)
const isInjectionsMessage = Schema.is(InjectionsMessage)
const isScheduleMessage = Schema.is(ScheduleMessage)
const isStatsMessage = Schema.is(StatsMessage)
const isSettingsMessage = Schema.is(SettingsPageMessage)
const isShell = Schema.is(Shell)

const applyPage = <Key extends 'weight' | 'injections' | 'schedule' | 'settingsPage' | 'stats'>(
  model: Model,
  key: Key,
  page: PageUpdate<Model[Key], Exclude<Message, typeof Shell.Type>>
): UpdateReturn => {
  const next = { ...model, [key]: page.model }
  if (page.mutation === undefined) {
    return {
      model: next,
      commands: page.commands ?? [],
    }
  }
  const { commandIds, commandId } = DomainFoldkit.next(model.commandIds)
  return {
    model: { ...next, commandIds, saving: true, mutationError: null },
    commands: [
      Command.mapMessage(page.mutation(commandId), (result) => {
        switch (result.status) {
          case 'saved':
            return Shell.SucceededMutation({ message: result.message })
          case 'failed':
            return Shell.FailedMutation({ message: result.message, error: result.error })
          case 'expired':
            return Shell.SessionExpired()
        }
      }),
    ],
  }
}

const updatePage = (model: Model, message: Exclude<Message, typeof Shell.Type>): UpdateReturn => {
  const timezone = timezoneOf(model)
  const unit = model.profile?.preferences.weightUnit ?? 'lbs'
  if (isWeightMessage(message)) {
    return applyPage(model, 'weight', updateWeight(model.weight, message, timezone, unit))
  }
  if (isInjectionsMessage(message)) {
    const schedules = Record.values(model.profile?.schedules ?? {})
    return applyPage(model, 'injections', updateInjections(model.injections, message, timezone, schedules))
  }
  if (isScheduleMessage(message)) {
    return applyPage(model, 'schedule', updateSchedule(model.schedule, message, timezone))
  }
  if (isStatsMessage(message)) {
    return applyPage(model, 'stats', updateStats(model.stats, message, timezone, unit))
  }
  const data = journalData(model)
  if (isSettingsMessage(message) && Option.isSome(data)) {
    return applyPage(
      model,
      'settingsPage',
      updateSettingsPage(model.settingsPage, message, data.value, todayOf(model), timezone)
    )
  }
  return { model }
}

const receiveProfile = (model: Model, profile: Model['profile']): UpdateReturn => {
  const received: Model = {
    ...model,
    profile: profile ?? {
      preferences: {},
      schedules: {},
      goals: {},
      latestWeight: null,
      lastInjection: null,
      knownSites: [],
    },
    readErrors: { ...model.readErrors, profile: false },
  }
  const timezoneChanged = timezoneOf(received) !== timezoneOf(model)
  const unitChanged =
    (received.profile?.preferences.weightUnit ?? 'lbs') !== (model.profile?.preferences.weightUnit ?? 'lbs')
  const next: Model = {
    ...received,
    weight: timezoneChanged || unitChanged ? { ...received.weight, form: null } : received.weight,
    injections: timezoneChanged ? { ...received.injections, form: null } : received.injections,
    stats: unitChanged ? { ...received.stats, goalForm: null } : received.stats,
  }
  if (
    Option.isSome(Option.fromNullishOr(profile?.preferences.timezone)) ||
    model.timezoneBootstrapSent ||
    model.sessionExpired
  ) {
    return { model: next }
  }

  const { commandIds, commandId } = DomainFoldkit.next(model.commandIds)
  const command = mutate(
    (request) => client.UpdatePreferences({ ...request, input: { timezone: model.detectedTimezone } }),
    Shell.InitializedTimezone(),
    (message) => Shell.FailedInitializeTimezone({ message })
  )
  return {
    model: { ...next, timezoneBootstrapSent: true, commandIds, saving: true },
    commands: [
      Command.mapMessage(command(commandId), (result) =>
        result.status === 'expired' ? Shell.SessionExpired() : result.message
      ),
    ],
  }
}

// @effect-diagnostics-next-line missingPipeableSignature:off -- Foldkit calls update with the model and message.
export const update = (model: Model, message: Message): UpdateReturn => {
  if (!isShell(message)) {
    return model.saving ||
      model.sessionExpired ||
      model.profile === null ||
      model.weights === null ||
      model.injectionHistory === null
      ? { model }
      : updatePage(model, message)
  }

  return Shell.match(message, {
    ChangedUrl: ({ url }) => ({ model: changeUrl(model, url) }),
    ClickedLink: ({ request }): UpdateReturn =>
      Match.valueTags(request, {
        Internal: ({ url }) => ({ model, commands: [Navigate({ url: urlToString(url) })] }),
        External: ({ href }) => ({ model, commands: [LoadUrl({ url: href })] }),
      }),
    NavigationDone: () => ({ model }),
    ClickedReload: () => ({ model, commands: [Reload()] }),
    Reloaded: () => ({ model }),
    ReceivedProfile: ({ profile }) => receiveProfile(model, profile),
    ReceivedWeights: ({ weights }) => ({
      model: { ...model, weights: weights ?? {}, readErrors: { ...model.readErrors, weights: false } },
    }),
    ReceivedInjections: ({ injections }) => ({
      model: {
        ...model,
        injectionHistory: injections ?? {},
        readErrors: { ...model.readErrors, injectionHistory: false },
      },
    }),
    ReadFailed: ({ read }) => ({ model: { ...model, readErrors: { ...model.readErrors, [read]: true } } }),
    SessionExpired: () => ({ model: { ...model, sessionExpired: true, saving: false } }),
    Tick: ({ now }) => ({ model: { ...model, now } }),
    InitializedTimezone: () => ({ model: { ...model, saving: false } }),
    FailedInitializeTimezone: ({ message }) => ({
      model: { ...model, saving: false, mutationError: message },
    }),
    SucceededMutation: ({ message }) => updatePage({ ...model, saving: false }, message),
    FailedMutation: ({ message, error }) => updatePage({ ...model, saving: false, mutationError: error }, message),
  })
}

const readFailure =
  (read: ReadName) =>
  (error: unknown): Message =>
    Schema.is(Unauthorized)(error) ? Shell.SessionExpired() : Shell.ReadFailed({ read })

const isEnabled = (model: Model) => !model.sessionExpired
const key = () => PERSONAL_JOURNAL_ID

export const subscriptions = Subscription.make<Model, Message, Client>()((entry) => ({
  profile: client.JournalProfile.watch({
    key,
    isEnabled,
    toMessage: ({ state }) => Shell.ReceivedProfile({ profile: Option.getOrNull(state) }),
    onFailure: readFailure('profile'),
    onDefect: () => Shell.ReadFailed({ read: 'profile' }),
  }),
  weights: client.WeightHistory.watch({
    key,
    isEnabled,
    toMessage: ({ state }) => Shell.ReceivedWeights({ weights: Option.getOrNull(state) }),
    onFailure: readFailure('weights'),
    onDefect: () => Shell.ReadFailed({ read: 'weights' }),
  }),
  injections: client.InjectionHistory.watch({
    key,
    isEnabled,
    toMessage: ({ state }) => Shell.ReceivedInjections({ injections: Option.getOrNull(state) }),
    onFailure: readFailure('injectionHistory'),
    onDefect: () => Shell.ReadFailed({ read: 'injectionHistory' }),
  }),
  clock: entry(
    {},
    {
      modelToDependencies: () => ({}),
      dependenciesToStream: () =>
        Stream.tick(Duration.minutes(1)).pipe(
          Stream.mapEffect(() => Effect.map(DateTime.now, (now) => Shell.Tick({ now })))
        ),
    }
  ),
}))

import { Command, Head, Router, Subscription } from '@effect/ui'
import type { Component } from '@effect/ui'
import { Html } from '@effect/ui/html'
import { PERSONAL_JOURNAL_ID } from '@garage/subq-domain/Journal/Journal.id'
import { UpdatePreferences } from '@garage/subq-domain/Journal/UpdatePreferences.command'
import { Unauthorized } from '@garage/subq-domain/Session.middleware'
import { SubqApi } from '@garage/subq-domain/SubqApi.api'
import * as Cause from 'effect/Cause'
import * as DateTime from 'effect/DateTime'
import * as Duration from 'effect/Duration'
import * as Effect from 'effect/Effect'
import * as Option from 'effect/Option'
import * as Record from 'effect/Record'
import * as Schema from 'effect/Schema'
import * as Stream from 'effect/Stream'

import { mutate } from './client.ts'
import type { SubmitJournalCommand } from './client.ts'
import type { PageUpdate } from './client.ts'
import { Flags, journalData, Message, Model, Shell, statsRangeOf, timezoneOf, todayOf } from './model.ts'
import type { ReadName } from './model.ts'
import { InjectionsMessage, initialInjectionsModel } from './page/injections/model.ts'
import { updateInjections } from './page/injections/update.ts'
import { ScheduleMessage, initialScheduleModel } from './page/schedule/model.ts'
import { updateSchedule } from './page/schedule/update.ts'
import { SettingsPageMessage, initialSettingsModel } from './page/settings/model.ts'
import { updateSettingsPage } from './page/settings/update.ts'
import type { ApplyPreset } from './page/stats/command.ts'
import { StatsMessage, initialStatsModel } from './page/stats/model.ts'
import { updateStats } from './page/stats/update.ts'
import { WeightMessage, initialWeightModel } from './page/weight/model.ts'
import { updateWeight } from './page/weight/update.ts'
import { AppRoute } from './route.ts'
import { view } from './view.ts'

type CommandRequirements = ApplyPreset | Router.Push | SubmitJournalCommand
type UpdateReturn = {
  readonly model: Model
  readonly commands?: ReadonlyArray<Command.Command<Message | Component.Noop, CommandRequirements>>
}

const Reload = Command.make('Reload', { args: {} }, () => Effect.sync(() => location.reload()))

const changeRoute = (model: Model, route: AppRoute): Model => {
  const next = { ...model, route }
  const range = statsRangeOf(route)
  return {
    ...next,
    stats: {
      ...next.stats,
      customStart: range.pipe(
        Option.flatMap(({ start }) => start),
        Option.getOrElse(() => '')
      ),
      customEnd: range.pipe(
        Option.flatMap(({ end }) => end),
        Option.getOrElse(() => '')
      ),
    },
  }
}

const init = ({ route, session, today, timezone }: Flags): Model =>
  changeRoute(
    {
      route,
      detectedTimezone: timezone,
      initialToday: today,
      now: null,
      profile: null,
      weights: null,
      injectionHistory: null,
      readErrors: { profile: false, weights: false, injectionHistory: false },
      commandIds: { session, sent: 0 },
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
    route
  )

const nextCommand = ({ session, sent }: Model['commandIds']) => ({
  commandId: `${session}:${sent}`,
  commandIds: { session, sent: sent + 1 },
})

const isWeightMessage = Schema.is(WeightMessage)
const isInjectionsMessage = Schema.is(InjectionsMessage)
const isScheduleMessage = Schema.is(ScheduleMessage)
const isStatsMessage = Schema.is(StatsMessage)
const isSettingsMessage = Schema.is(SettingsPageMessage)
const isShell = Schema.is(Shell)

const applyPage = <Key extends 'weight' | 'injections' | 'schedule' | 'settingsPage' | 'stats'>(
  model: Model,
  key: Key,
  page: PageUpdate<Model[Key], Exclude<Message, typeof Shell.Type>, CommandRequirements>
): UpdateReturn => {
  const next = { ...model, [key]: page.model }
  if (page.mutation === undefined) {
    return {
      model: next,
      commands: page.commands ?? [],
    }
  }
  const { commandIds, commandId } = nextCommand(model.commandIds)
  return {
    model: { ...next, commandIds, saving: true, mutationError: null },
    commands: [
      Command.map(page.mutation(commandId), (result) => {
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

  const { commandIds, commandId } = nextCommand(model.commandIds)
  const command = mutate(
    () => UpdatePreferences.make({ timezone: model.detectedTimezone }),
    Shell.InitializedTimezone(),
    (message) => Shell.FailedInitializeTimezone({ message })
  )
  return {
    model: { ...next, timezoneBootstrapSent: true, commandIds, saving: true },
    commands: [
      Command.map(command(commandId), (result) =>
        result.status === 'expired' ? Shell.SessionExpired() : result.message
      ),
    ],
  }
}

const update = (model: Model, message: Message): UpdateReturn => {
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
    ChangedRoute: ({ route }) => ({ model: changeRoute(model, route) }),
    ClickedReload: () => ({ model, commands: [Reload.make().pipe(Command.asNoop)] }),
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

const watch = <A, E>(
  read: ReadName,
  stream: Stream.Stream<A, E, typeof SubqApi.Client.Identifier>,
  toMessage: (value: A) => Message
) =>
  Subscription.make(
    read,
    stream.pipe(
      Stream.map(toMessage),
      Stream.catchCause((cause) => {
        if (Cause.hasDies(cause)) {
          return Stream.succeed(Shell.ReadFailed({ read }))
        }
        const error = Cause.findErrorOption(cause)
        if (Option.isNone(error)) {
          return Stream.fromEffect(Effect.interrupt)
        }
        return Stream.succeed(
          Schema.is(Unauthorized)(error.value) ? Shell.SessionExpired() : Shell.ReadFailed({ read })
        )
      })
    )
  )

const subscriptions = ({ model }: { readonly model: Model }) => [
  Router.subscription(AppRoute, model.route, (route) => Shell.ChangedRoute({ route })),
  !model.sessionExpired &&
    watch(
      'profile',
      SubqApi.Client.pipe(
        Effect.map((client) => client.JournalProfile.watch(PERSONAL_JOURNAL_ID)),
        Stream.unwrap
      ),
      ({ state }) => Shell.ReceivedProfile({ profile: state ?? null })
    ),
  !model.sessionExpired &&
    watch(
      'weights',
      SubqApi.Client.pipe(
        Effect.map((client) => client.WeightHistory.watch(PERSONAL_JOURNAL_ID)),
        Stream.unwrap
      ),
      ({ state }) => Shell.ReceivedWeights({ weights: state ?? null })
    ),
  !model.sessionExpired &&
    watch(
      'injectionHistory',
      SubqApi.Client.pipe(
        Effect.map((client) => client.InjectionHistory.watch(PERSONAL_JOURNAL_ID)),
        Stream.unwrap
      ),
      ({ state }) => Shell.ReceivedInjections({ injections: state ?? null })
    ),
  Subscription.make(
    'clock',
    Stream.tick(Duration.minutes(1)).pipe(
      Stream.mapEffect(() => Effect.map(DateTime.now, (now) => Shell.Tick({ now })))
    )
  ),
]

// @effect-diagnostics-next-line missingPipeableSignature:off -- Effect UI defines the component signature.
export const Subq = Html.component({ name: 'Subq', props: Flags, model: Model, message: Message }).make({
  init: ({ props }) => init(props),
  update: ($, message) => {
    const next = update($.model, message)
    return $.set(next.model).run(...(next.commands ?? []))
  },
  subscriptions,
  head: () => [Head.title('SubQ')],
  view,
})

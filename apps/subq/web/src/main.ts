import * as Arr from 'effect/Array'
import * as Effect from 'effect/Effect'
import * as Match from 'effect/Match'
import * as Option from 'effect/Option'
import * as Schema from 'effect/Schema'
import type { HttpClient } from 'effect/unstable/http'
import { Command } from 'foldkit'
import type { Runtime } from 'foldkit'
import * as AsyncData from 'foldkit/asyncData'
import { html } from 'foldkit/html'
import { m } from 'foldkit/message'
import { UrlRequest, load, pushUrl } from 'foldkit/navigation'
import { evo } from 'foldkit/struct'
import { Url, toString as urlToString } from 'foldkit/url'

import type { Api } from './api.js'
import { AuthMessage, FetchSession, SessionUser, SignOut } from './auth.js'
import {
  FailedFetchSettings,
  FetchSettings,
  SettingsData,
  SucceededFetchSettings,
  weightUnitOf,
} from './data/settings.js'
import {
  InjectionsMessage,
  InjectionsModel,
  fetchInjectionsIfIdle,
  initialInjectionsModel,
  updateInjections,
  viewInjections,
} from './page/injections.js'
import {
  LoginMessage,
  LoginModel,
  initialLoginModel,
  loginFailed,
  loginSucceeded,
  updateLogin,
  viewLogin,
} from './page/login.js'
import {
  ScheduleViewMessage,
  ScheduleViewModel,
  fetchScheduleView,
  initialScheduleViewModel,
  updateScheduleView,
  viewScheduleView,
} from './page/schedule-view.js'
import {
  ScheduleMessage,
  ScheduleModel,
  fetchScheduleIfIdle,
  initialScheduleModel,
  updateSchedule,
  viewSchedule,
} from './page/schedule.js'
import {
  SettingsModel,
  SettingsPageMessage,
  initialSettingsModel,
  settingsPasswordFailed,
  settingsPasswordSucceeded,
  updateSettingsPage,
  viewSettings,
} from './page/settings.js'
import type { StatsRange } from './page/stats.js'
import { StatsMessage, StatsModel, initialStatsModel, syncStatsFetch, updateStats, viewStats } from './page/stats.js'
import {
  WeightMessage,
  WeightModel,
  fetchWeightLogsIfIdle,
  initialWeightModel,
  updateWeight,
  viewWeight,
} from './page/weight.js'
import {
  AppRoute,
  injectionRouter,
  loginRouter,
  scheduleRouter,
  settingsRouter,
  statsRouter,
  urlToAppRoute,
  weightRouter,
} from './route.js'
import { button, navLink } from './ui.js'

// ============================================
// Model
// ============================================

export const Model = Schema.Struct({
  route: AppRoute,
  user: Schema.NullOr(SessionUser),
  sessionLoaded: Schema.Boolean,
  login: LoginModel,
  settings: SettingsData,
  settingsPage: SettingsModel,
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

export const ClickedLink = m('ClickedLink', { request: UrlRequest })
export const ChangedUrl = m('ChangedUrl', { url: Url })
export const NavigationDone = m('NavigationDone')
export const ClickedSignOut = m('ClickedSignOut')

export const SettingsMessage = Schema.Union([SucceededFetchSettings, FailedFetchSettings])
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
type Commands = ReadonlyArray<Command.Command<Message, never, AppResources>>
type UpdateReturn = readonly [Model, Commands]

// ============================================
// Navigation commands
// ============================================

const Navigate = Command.define(
  'Navigate',
  { url: Schema.String },
  NavigationDone
)(({ url }) => pushUrl(url).pipe(Effect.as(NavigationDone())))

const LoadUrl = Command.define(
  'LoadUrl',
  { url: Schema.String },
  NavigationDone
)(({ url }) => load(url).pipe(Effect.as(NavigationDone())))

const statsHref = statsRouter({ end: Option.none(), start: Option.none() })
const loginHref = loginRouter({})

// Redirects driven by session state: unauthenticated users land on /login,
// authenticated users never see /login.
const sessionRedirect = (model: Model): Commands => {
  if (!model.sessionLoaded) {
    return []
  }
  if (model.user === null && model.route._tag !== 'Login') {
    return [Navigate({ url: loginHref })]
  }
  if (model.user !== null && model.route._tag === 'Login') {
    return [Navigate({ url: statsHref })]
  }
  return []
}

const statsRangeOf = (model: Model): StatsRange =>
  model.route._tag === 'Stats'
    ? { end: model.route.end, start: model.route.start }
    : { end: Option.none(), start: Option.none() }

// Applies session redirects and kicks off the data fetches the current
// route needs (only when idle, so navigation is cheap).
const enterRoute = (model: Model): UpdateReturn => {
  const redirects = sessionRedirect(model)
  if (Arr.isReadonlyArrayNonEmpty(redirects) || model.user === null) {
    return [model, redirects]
  }
  const commands: Array<Commands[number]> = []
  let next = model
  if (AsyncData.isIdle(next.settings)) {
    next = evo(next, { settings: () => AsyncData.Loading() })
    commands.push(FetchSettings())
  }
  if (next.route._tag === 'Weight') {
    const [weight, weightCommands] = fetchWeightLogsIfIdle(next.weight)
    next = evo(next, { weight: () => weight })
    commands.push(...weightCommands)
  }
  if (next.route._tag === 'Injection') {
    const [injections, injectionCommands] = fetchInjectionsIfIdle(next.injections)
    next = evo(next, { injections: () => injections })
    commands.push(...injectionCommands)
  }
  if (next.route._tag === 'Schedule') {
    const [schedule, scheduleCommands] = fetchScheduleIfIdle(next.schedule)
    next = evo(next, { schedule: () => schedule })
    commands.push(...scheduleCommands)
  }
  if (next.route._tag === 'ScheduleView') {
    const [scheduleView, scheduleViewCommands] = fetchScheduleView(next.scheduleView, next.route.scheduleId)
    next = evo(next, { scheduleView: () => scheduleView })
    commands.push(...scheduleViewCommands)
  }
  if (next.route._tag === 'Stats') {
    const [stats, statsCommands] = syncStatsFetch(next.stats, statsRangeOf(next))
    next = evo(next, { stats: () => stats })
    commands.push(...statsCommands)
  }
  return [next, commands]
}

// ============================================
// Init
// ============================================

export const init: Runtime.RoutingApplicationInit<Model, Message, void, AppResources> = (url) => [
  {
    login: initialLoginModel,
    injections: initialInjectionsModel,
    route: urlToAppRoute(url),
    schedule: initialScheduleModel,
    scheduleView: initialScheduleViewModel,
    sessionLoaded: false,
    settings: AsyncData.Idle(),
    settingsPage: initialSettingsModel,
    stats: initialStatsModel,
    user: null,
    weight: initialWeightModel,
  },
  [FetchSession()],
]

// ============================================
// Update
// ============================================

const isLoginMessage = Schema.is(LoginMessage)
const isAuthMessage = Schema.is(AuthMessage)
const isWeightMessage = Schema.is(WeightMessage)
const isSettingsMessage = Schema.is(SettingsMessage)
const isSettingsPageMessage = Schema.is(SettingsPageMessage)
const isInjectionsMessage = Schema.is(InjectionsMessage)
const isScheduleMessage = Schema.is(ScheduleMessage)
const isScheduleViewMessage = Schema.is(ScheduleViewMessage)
const isStatsMessage = Schema.is(StatsMessage)

const updateAuth = (model: Model, message: AuthMessage): UpdateReturn =>
  Match.value(message).pipe(
    Match.withReturnType<UpdateReturn>(),
    Match.tagsExhaustive({
      FailedChangePassword: ({ message: error }) => [
        evo(model, { settingsPage: (settingsPage) => settingsPasswordFailed(settingsPage, error) }),
        [],
      ],
      FailedSignIn: ({ message: error }) => [evo(model, { login: (login) => loginFailed(login, error) }), []],
      FailedSignUp: ({ message: error }) => [evo(model, { login: (login) => loginFailed(login, error) }), []],
      SucceededChangePassword: () => [evo(model, { settingsPage: settingsPasswordSucceeded }), []],
      SucceededFetchSession: ({ user }) => {
        const next = evo(model, { sessionLoaded: () => true, user: () => user })
        return enterRoute(next)
      },
      SucceededSignIn: ({ user }) => {
        const next = evo(model, {
          login: loginSucceeded,
          sessionLoaded: () => true,
          user: () => user,
        })
        return [next, [Navigate({ url: statsHref })]]
      },
      SucceededSignOut: () => [
        evo(model, { login: () => initialLoginModel, user: () => null }),
        [Navigate({ url: loginHref })],
      ],
      SucceededSignUp: ({ user }) => {
        const next = evo(model, {
          login: loginSucceeded,
          sessionLoaded: () => true,
          user: () => user,
        })
        return [next, [Navigate({ url: statsHref })]]
      },
    })
  )

export const update = (model: Model, message: Message): UpdateReturn => {
  if (isAuthMessage(message)) {
    return updateAuth(model, message)
  }
  if (isLoginMessage(message)) {
    const [login, commands] = updateLogin(model.login, message)
    return [evo(model, { login: () => login }), commands]
  }
  if (isWeightMessage(message)) {
    const [weight, commands] = updateWeight(model.weight, message)
    return [evo(model, { weight: () => weight }), commands]
  }
  if (isSettingsPageMessage(message)) {
    const [settingsPage, commands] = updateSettingsPage(model.settingsPage, message)
    const next = evo(model, { settingsPage: () => settingsPage })
    return Match.value(message).pipe(
      Match.withReturnType<UpdateReturn>(),
      Match.tag('SucceededImportData', () => [
        evo(next, {
          injections: () => initialInjectionsModel,
          schedule: () => initialScheduleModel,
          scheduleView: () => initialScheduleViewModel,
          weight: () => initialWeightModel,
        }),
        commands,
      ]),
      Match.orElse(() => [next, commands])
    )
  }
  if (isInjectionsMessage(message)) {
    const [injections, commands] = updateInjections(model.injections, message)
    return [evo(model, { injections: () => injections }), commands]
  }
  if (isScheduleMessage(message)) {
    const [schedule, commands] = updateSchedule(model.schedule, message)
    return [evo(model, { schedule: () => schedule }), commands]
  }
  if (isScheduleViewMessage(message)) {
    const [scheduleView, commands] = updateScheduleView(model.scheduleView, message)
    return [evo(model, { scheduleView: () => scheduleView }), commands]
  }
  if (isStatsMessage(message)) {
    const [stats, commands] = updateStats(model.stats, message)
    return [evo(model, { stats: () => stats }), commands]
  }
  if (isSettingsMessage(message)) {
    return Match.value(message).pipe(
      Match.withReturnType<UpdateReturn>(),
      Match.tagsExhaustive({
        FailedFetchSettings: ({ message: error }) => [evo(model, { settings: () => AsyncData.Failure({ error }) }), []],
        SucceededFetchSettings: ({ settings }) => [evo(model, { settings: () => AsyncData.succeed(settings) }), []],
      })
    )
  }
  return Match.value(message).pipe(
    Match.withReturnType<UpdateReturn>(),
    Match.tagsExhaustive({
      ChangedUrl: ({ url }) => {
        const next = evo(model, { route: () => urlToAppRoute(url) })
        return enterRoute(next)
      },
      ClickedLink: ({ request }) =>
        Match.value(request).pipe(
          Match.withReturnType<UpdateReturn>(),
          Match.tagsExhaustive({
            External: ({ href }) => [model, [LoadUrl({ url: href })]],
            Internal: ({ url }) => [model, [Navigate({ url: urlToString(url) })]],
          })
        ),
      ClickedSignOut: () => [model, [SignOut()]],
      NavigationDone: () => [model, []],
    })
  )
}

// ============================================
// View
// ============================================

const h = html<Message>()

const viewLoading = h.div(
  [h.Class('flex items-center justify-center h-screen')],
  [h.p([h.Class('text-muted-foreground')], ['Loading...'])]
)

const navItems: ReadonlyArray<readonly [label: string, href: string, tag: string]> = [
  ['Stats', statsHref, 'Stats'],
  ['Weight', weightRouter({}), 'Weight'],
  ['Injections', injectionRouter({}), 'Injection'],
  ['Schedule', scheduleRouter({}), 'Schedule'],
]

type Html = typeof viewLoading

const viewShell = (model: Model, email: string, content: Html) =>
  h.div(
    [h.Class('max-w-7xl mx-auto p-4 sm:p-6')],
    [
      h.header(
        [h.Class('flex flex-col gap-3 mb-6 pb-4 border-b sm:mb-8 sm:pb-5')],
        [
          h.div(
            [h.Class('flex items-center justify-between gap-3')],
            [
              h.h1(
                [h.Class('flex items-center gap-2 text-lg font-semibold tracking-tight')],
                [h.img([h.Src('/logo.svg'), h.Alt(''), h.Class('h-6 w-6')]), 'SubQ']
              ),
              h.div(
                [h.Class('flex items-center gap-3')],
                [
                  h.span([h.Class('hidden sm:inline text-xs text-muted-foreground')], [email]),
                  h.a(
                    [h.Href(settingsRouter({}))],
                    [h.button([h.Class(button({ size: 'icon', variant: 'ghost' })), h.Title('Settings')], ['⚙'])]
                  ),
                  h.button(
                    [h.Class(button({ size: 'sm', variant: 'outline' })), h.OnClick(ClickedSignOut())],
                    ['Sign Out']
                  ),
                ]
              ),
            ]
          ),
          h.nav(
            [h.Class('flex gap-4 sm:gap-6 overflow-x-auto scrollbar-hide')],
            navItems.map(([label, href, tag]) =>
              h.a([h.Href(href), h.Class(navLink(model.route._tag === tag))], [label])
            )
          ),
        ]
      ),
      h.main([], [content]),
    ]
  )

const viewPlaceholder = (title: string) => h.div([h.Class('text-muted-foreground')], [`${title} — coming soon`])

const viewPage = (model: Model) =>
  Match.value(model.route).pipe(
    Match.tagsExhaustive({
      Injection: () => viewInjections(model.injections),
      Login: () => viewPlaceholder('Login'),
      NotFound: () => h.div([h.Class('text-muted-foreground')], ['Page not found']),
      Schedule: () => viewSchedule(model.schedule),
      ScheduleView: () => viewScheduleView(model.scheduleView),
      Settings: () => viewSettings(model.settingsPage, model.settings),
      Stats: () => viewStats(model.stats, weightUnitOf(model.settings), statsRangeOf(model)),
      Weight: () => viewWeight(model.weight, weightUnitOf(model.settings)),
    })
  )

export const view = (model: Model) => {
  if (!model.sessionLoaded) {
    return { body: viewLoading, title: 'SubQ' }
  }
  if (model.user === null || model.route._tag === 'Login') {
    return { body: viewLogin(model.login), title: 'SubQ — Sign In' }
  }
  return { body: viewShell(model, model.user.email, viewPage(model)), title: 'SubQ' }
}

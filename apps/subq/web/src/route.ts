import { pipe } from 'effect/Function'
import * as Schema from 'effect/Schema'
import * as Route from 'foldkit/route'
import { literal, r, root, slash, string } from 'foldkit/route'

import { CalendarDate } from '#shared'

// ============================================
// Route definitions
// ============================================

export const LoginRoute = r('Login', {})
export const StatsRoute = r('Stats', {
  start: Schema.OptionFromOptional(CalendarDate),
  end: Schema.OptionFromOptional(CalendarDate),
})
export const WeightRoute = r('Weight', {})
export const InjectionRoute = r('Injection', {})
export const ScheduleRoute = r('Schedule', {})
export const ScheduleViewRoute = r('ScheduleView', { scheduleId: Schema.String })
export const SettingsRoute = r('Settings', {})
export const NotFoundRoute = r('NotFound', { path: Schema.String })

export const AppRoute = Schema.Union([
  LoginRoute,
  StatsRoute,
  WeightRoute,
  InjectionRoute,
  ScheduleRoute,
  ScheduleViewRoute,
  SettingsRoute,
  NotFoundRoute,
])
export type AppRoute = typeof AppRoute.Type

// ============================================
// Bidirectional routers (parse URLs, generate hrefs)
// ============================================

export const loginRouter = pipe(literal('login'), Route.mapTo(LoginRoute))
export const statsRouter = pipe(
  literal('stats'),
  Route.query(
    Schema.Struct({
      start: Schema.OptionFromOptional(CalendarDate),
      end: Schema.OptionFromOptional(CalendarDate),
    })
  ),
  Route.mapTo(StatsRoute)
)
export const weightRouter = pipe(literal('weight'), Route.mapTo(WeightRoute))
export const injectionRouter = pipe(literal('injection'), Route.mapTo(InjectionRoute))
export const scheduleViewRouter = pipe(literal('schedule'), slash(string('scheduleId')), Route.mapTo(ScheduleViewRoute))
export const scheduleRouter = pipe(literal('schedule'), Route.mapTo(ScheduleRoute))
export const settingsRouter = pipe(literal('settings'), Route.mapTo(SettingsRoute))
// `/` shows stats, same as the old app's index redirect
export const rootRouter = pipe(
  root,
  Route.query(
    Schema.Struct({
      start: Schema.OptionFromOptional(CalendarDate),
      end: Schema.OptionFromOptional(CalendarDate),
    })
  ),
  Route.mapTo(StatsRoute)
)

const routeParser = Route.oneOf(
  loginRouter,
  statsRouter,
  weightRouter,
  injectionRouter,
  scheduleViewRouter,
  scheduleRouter,
  settingsRouter,
  rootRouter
)

export const urlToAppRoute = Route.parseUrlWithFallback(routeParser, NotFoundRoute)

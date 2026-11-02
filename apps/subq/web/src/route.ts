import * as Function from 'effect/Function'
import * as Option from 'effect/Option'
import * as Schema from 'effect/Schema'
import { Route } from 'foldkit'
import { defineRouteUnion, literal, root, slash, string } from 'foldkit/route'

import { CalendarDate } from '#shared'

// ============================================
// Route definitions
// ============================================

export const AppRoute = defineRouteUnion({
  Login: {},
  Stats: {
    start: Schema.OptionFromOptional(CalendarDate),
    end: Schema.OptionFromOptional(CalendarDate),
  },
  Weight: {},
  Injection: {},
  Schedule: {},
  ScheduleView: { scheduleId: Schema.String },
  Settings: {},
  NotFound: { path: Schema.String },
})

export type AppRoute = typeof AppRoute.Type

// ============================================
// Bidirectional routers (parse URLs, generate hrefs)
// ============================================

export const loginRouter = Function.pipe(literal('login'), Route.mapTo(AppRoute.Login))

export const statsRouter = Function.pipe(
  literal('stats'),
  Route.query(
    Schema.Struct({
      start: Schema.OptionFromOptional(CalendarDate),
      end: Schema.OptionFromOptional(CalendarDate),
    })
  ),
  Route.mapTo(AppRoute.Stats)
)

export const weightRouter = Function.pipe(literal('weight'), Route.mapTo(AppRoute.Weight))
export const injectionRouter = Function.pipe(literal('injection'), Route.mapTo(AppRoute.Injection))

export const scheduleViewRouter = Function.pipe(
  literal('schedule'),
  slash(string('scheduleId')),
  Route.mapTo(AppRoute.ScheduleView)
)

export const scheduleRouter = Function.pipe(literal('schedule'), Route.mapTo(AppRoute.Schedule))
export const settingsRouter = Function.pipe(literal('settings'), Route.mapTo(AppRoute.Settings))

// `/` shows stats, same as the old app's index redirect
export const rootRouter = Function.pipe(
  root,
  Route.query(
    Schema.Struct({
      start: Schema.OptionFromOptional(CalendarDate),
      end: Schema.OptionFromOptional(CalendarDate),
    })
  ),
  Route.mapTo(AppRoute.Stats)
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

export const urlToAppRoute = Route.parseUrlWithFallback(routeParser, AppRoute.NotFound)

export const statsHref = statsRouter({ end: Option.none(), start: Option.none() })

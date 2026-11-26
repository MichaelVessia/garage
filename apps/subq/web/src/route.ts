import { Route } from '@effect/ui'
import * as Schema from 'effect/Schema'

// Preserve malformed dates so the view can show the missing-page state.
const DateParameter = Schema.optional(Schema.Union([Schema.String, Schema.NonEmptyArray(Schema.String)]))
const dateRange = { start: DateParameter, end: DateParameter }

export const AppRoute = Route.union({
  Index: Route.make('/', { search: dateRange }),
  Stats: Route.make('/stats', { search: dateRange }),
  Weight: Route.make('/weight'),
  Injection: Route.make('/injection'),
  Schedule: Route.make('/schedule'),
  ScheduleView: Route.make('/schedule/:scheduleId', { params: { scheduleId: Schema.String } }),
  Settings: Route.make('/settings'),
  NotFound: Route.make('/*'),
})

export type AppRoute = typeof AppRoute.Type

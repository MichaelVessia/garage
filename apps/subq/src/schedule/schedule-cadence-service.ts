import * as Context from 'effect/Context'
import * as DateTime from 'effect/DateTime'
import * as Effect from 'effect/Effect'
import * as Layer from 'effect/Layer'
import * as Option from 'effect/Option'

import {
  nextDose,
  NextScheduledDoseResult,
  projectInstantToCalendarDate,
  ScheduleDatabaseError,
  scheduleView,
  SettingsTimezoneNotInitialized,
} from '#shared'
import type { InjectionScheduleId, ScheduleView } from '#shared'

import { InjectionLogRepo } from '../injection/injection-log-repo.js'
import { SettingsRepo } from '../settings/settings-repo.js'
import { ScheduleRepo } from './schedule-repo.js'

export class ScheduleCadenceService extends Context.Service<
  ScheduleCadenceService,
  {
    readonly getNextScheduledDose: (userId: string) => Effect.Effect<NextScheduledDoseResult, ScheduleDatabaseError>
    readonly getScheduleView: (
      userId: string,
      scheduleId: InjectionScheduleId
    ) => Effect.Effect<Option.Option<ScheduleView>, ScheduleDatabaseError>
  }
>()('@garage/subq/schedule/schedule-cadence-service/ScheduleCadenceService') {}

export const ScheduleCadenceServiceLive = Layer.effect(
  ScheduleCadenceService,
  Effect.gen(function* () {
    const scheduleRepo = yield* ScheduleRepo
    const injectionLogRepo = yield* InjectionLogRepo
    const settingsRepo = yield* SettingsRepo

    const getTimezone = Effect.fn('ScheduleCadenceService.getTimezone')(function* (userId: string) {
      const settings = yield* settingsRepo
        .get(userId)
        .pipe(
          Effect.mapError((error) => ScheduleDatabaseError.make({ operation: error.operation, cause: error.cause }))
        )
      return yield* Option.match(settings, {
        onNone: () =>
          Effect.fail(
            ScheduleDatabaseError.make({
              operation: 'query',
              cause: new SettingsTimezoneNotInitialized({ userId }),
            })
          ),
        onSome: ({ timezone }) => Effect.succeed(timezone),
      })
    })

    const getNextScheduledDose = Effect.fn('ScheduleCadenceService.getNextScheduledDose')(function* (userId: string) {
      const timezone = yield* getTimezone(userId)
      const scheduleOpt = yield* scheduleRepo.getActive(userId)
      if (Option.isNone(scheduleOpt)) {
        return new NextScheduledDoseResult({ nextDose: null, timezone })
      }

      const schedule = scheduleOpt.value
      const lastInjection = yield* scheduleRepo.getLastInjectionDate(userId, schedule.drug)
      const now = yield* DateTime.now
      const lastInjectionDate = Option.map(lastInjection, (instant) => projectInstantToCalendarDate(instant, timezone))
      const today = projectInstantToCalendarDate(now, timezone)

      return new NextScheduledDoseResult({
        nextDose: Option.getOrNull(nextDose(schedule, lastInjectionDate, today)),
        timezone,
      })
    })

    const getScheduleView = Effect.fn('ScheduleCadenceService.getScheduleView')(function* (
      userId: string,
      scheduleId: InjectionScheduleId
    ) {
      const scheduleOpt = yield* scheduleRepo.findById(scheduleId, userId)
      if (Option.isNone(scheduleOpt)) {
        return Option.none()
      }

      const injections = yield* injectionLogRepo
        .listBySchedule(scheduleId, userId)
        .pipe(Effect.mapError((e) => ScheduleDatabaseError.make({ operation: e.operation, cause: e.cause })))
      const timezone = yield* getTimezone(userId)
      const now = yield* DateTime.now
      const today = projectInstantToCalendarDate(now, timezone)

      return Option.some(scheduleView(scheduleOpt.value, injections, today, timezone))
    })

    return { getNextScheduledDose, getScheduleView }
  })
)

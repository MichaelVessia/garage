import * as Context from 'effect/Context'
import * as DateTime from 'effect/DateTime'
import * as Effect from 'effect/Effect'
import * as Layer from 'effect/Layer'
import * as Option from 'effect/Option'

import { nextDose, ScheduleDatabaseError, scheduleView } from '#shared'
import type { InjectionScheduleId, NextScheduledDose, ScheduleView } from '#shared'

import { InjectionLogRepo } from '../injection/injection-log-repo.js'
import { ScheduleRepo } from './schedule-repo.js'

export class ScheduleCadenceService extends Context.Service<
  ScheduleCadenceService,
  {
    readonly getNextScheduledDose: (
      userId: string
    ) => Effect.Effect<Option.Option<NextScheduledDose>, ScheduleDatabaseError>
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

    const getNextScheduledDose = Effect.fn('ScheduleCadenceService.getNextScheduledDose')(function* (userId: string) {
      const scheduleOpt = yield* scheduleRepo.getActive(userId)
      if (Option.isNone(scheduleOpt)) {
        return Option.none()
      }

      const schedule = scheduleOpt.value
      const lastInjectionDate = yield* scheduleRepo.getLastInjectionDate(userId, schedule.drug)
      const now = yield* DateTime.now

      return nextDose(schedule, lastInjectionDate, now)
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
      const now = yield* DateTime.now

      return Option.some(scheduleView(scheduleOpt.value, injections, now))
    })

    return { getNextScheduledDose, getScheduleView }
  })
)

import { assert, describe, it } from '@effect/vitest'
import * as Effect from 'effect/Effect'
import * as Layer from 'effect/Layer'
import * as Option from 'effect/Option'
import { TestClock } from 'effect/testing'

import { InjectionScheduleId } from '#shared'

import { InjectionLogRepoLive } from '../src/injection/injection-log-repo.js'
import { ScheduleCadenceService, ScheduleCadenceServiceLive } from '../src/schedule/schedule-cadence-service.js'
import { ScheduleRepoLive } from '../src/schedule/schedule-repo.js'
import { SettingsRepoLive } from '../src/settings/settings-repo.js'
import { testDate } from './helpers/dates.js'
import {
  insertInjectionLog,
  insertSchedule,
  insertSchedulePhase,
  insertSettings,
  insertUser,
  makeInitializedTestLayer,
} from './helpers/test-db.js'

const RepoLayer = Layer.mergeAll(ScheduleRepoLive, InjectionLogRepoLive, SettingsRepoLive)
const TestLayer = makeInitializedTestLayer(ScheduleCadenceServiceLive.pipe(Layer.provide(RepoLayer)))

const requireValue = <T>(value: T | null | undefined): T => {
  if (value === null || value === undefined) {
    throw new Error('Expected value to be present')
  }
  return value
}

describe('ScheduleCadenceService', () => {
  it.effect('calculates the next scheduled dose from active schedule and same-drug history', () =>
    Effect.gen(function* () {
      yield* TestClock.setTime(testDate('2024-01-15T12:00:00Z').getTime())
      const userId = 'user-1'

      yield* insertUser(userId)
      yield* insertSettings('settings-1', userId, 'lbs', 'America/New_York')
      yield* insertSchedule(
        'schedule-1',
        'Semaglutide schedule',
        'Semaglutide',
        'weekly',
        testDate('2024-01-01T12:00:00Z'),
        userId
      )
      yield* insertSchedulePhase('phase-1', 'schedule-1', 1, 200)
      yield* insertInjectionLog('injection-1', testDate('2024-01-10T12:00:00Z'), 'Semaglutide', 200, userId)

      const service = yield* ScheduleCadenceService
      const result = yield* service.getNextScheduledDose(userId)
      const dose = requireValue(result.nextDose)

      assert.strictEqual(result.timezone, 'America/New_York')
      assert.strictEqual(dose.suggestedDate, '2024-01-17')
      assert.strictEqual(dose.daysUntilDue, 2)
      assert.strictEqual(dose.doseMg, 200)
    }).pipe(Effect.provide(TestLayer))
  )

  it.effect('builds Schedule View from assigned injection logs only', () =>
    Effect.gen(function* () {
      yield* TestClock.setTime(testDate('2024-01-15T12:00:00Z').getTime())
      const userId = 'user-1'
      const scheduleId = InjectionScheduleId.make('schedule-1')

      yield* insertUser(userId)
      yield* insertSettings('settings-2', userId, 'lbs', 'America/New_York')
      yield* insertSchedule(
        scheduleId,
        'Semaglutide schedule',
        'Semaglutide',
        'weekly',
        testDate('2024-01-01T00:00:00Z'),
        userId
      )
      yield* insertSchedulePhase('phase-1', scheduleId, 1, 2.5, 28)
      yield* insertSchedulePhase('phase-2', scheduleId, 2, 5)
      yield* insertInjectionLog('assigned-injection', testDate('2024-01-08T00:00:00Z'), 'Semaglutide', 2.5, userId, {
        scheduleId,
      })
      yield* insertInjectionLog(
        'same-drug-unassigned-injection',
        testDate('2024-01-15T00:00:00Z'),
        'Semaglutide',
        2.5,
        userId
      )

      const service = yield* ScheduleCadenceService
      const view = Option.getOrThrow(yield* service.getScheduleView(userId, scheduleId))
      const firstPhase = requireValue(view.phases[0])

      assert.strictEqual(view.totalCompletedInjections, 1)
      assert.strictEqual(firstPhase.completedInjections, 1)
    }).pipe(Effect.provide(TestLayer))
  )
})

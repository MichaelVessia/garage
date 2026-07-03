import { assert, describe, it } from '@effect/vitest'
import * as DateTime from 'effect/DateTime'
import * as Effect from 'effect/Effect'
import * as Layer from 'effect/Layer'
import * as Option from 'effect/Option'
import { TestClock } from 'effect/testing'

import { InjectionScheduleId } from '#shared'

import { InjectionLogRepoLive } from '../src/injection/injection-log-repo.js'
import { ScheduleCadenceService, ScheduleCadenceServiceLive } from '../src/schedule/schedule-cadence-service.js'
import { ScheduleRepoLive } from '../src/schedule/schedule-repo.js'
import { testDate } from './helpers/dates.js'
import {
  insertInjectionLog,
  insertSchedule,
  insertSchedulePhase,
  insertSettings,
  insertUser,
  makeInitializedTestLayer,
} from './helpers/test-db.js'

const RepoLayer = Layer.mergeAll(ScheduleRepoLive, InjectionLogRepoLive)
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
      yield* insertSchedule(
        'schedule-1',
        'Testosterone schedule',
        'Testosterone',
        'weekly',
        testDate('2024-01-01T12:00:00Z'),
        userId
      )
      yield* insertSchedulePhase('phase-1', 'schedule-1', 1, '200mg')
      yield* insertInjectionLog('injection-1', testDate('2024-01-10T12:00:00Z'), 'Testosterone', '200mg', userId)

      const service = yield* ScheduleCadenceService
      const dose = Option.getOrThrow(yield* service.getNextScheduledDose(userId))

      assert.strictEqual(DateTime.formatIso(dose.suggestedDate), '2024-01-17T12:00:00.000Z')
      assert.strictEqual(dose.daysUntilDue, 2)
      assert.strictEqual(dose.dosage, '200mg')
    }).pipe(Effect.provide(TestLayer))
  )

  it.effect('builds Schedule View from assigned injection logs only', () =>
    Effect.gen(function* () {
      yield* TestClock.setTime(testDate('2024-01-15T12:00:00Z').getTime())
      const userId = 'user-1'
      const scheduleId = InjectionScheduleId.make('schedule-1')

      yield* insertUser(userId)
      yield* insertSchedule(
        scheduleId,
        'Semaglutide schedule',
        'Semaglutide',
        'weekly',
        testDate('2024-01-01T00:00:00Z'),
        userId
      )
      yield* insertSchedulePhase('phase-1', scheduleId, 1, '2.5mg', 28)
      yield* insertSchedulePhase('phase-2', scheduleId, 2, '5mg')
      yield* insertInjectionLog(
        'assigned-injection',
        testDate('2024-01-08T00:00:00Z'),
        'Semaglutide',
        '2.5mg',
        userId,
        { scheduleId }
      )
      yield* insertInjectionLog(
        'same-drug-unassigned-injection',
        testDate('2024-01-15T00:00:00Z'),
        'Semaglutide',
        '2.5mg',
        userId
      )

      const service = yield* ScheduleCadenceService
      const view = Option.getOrThrow(yield* service.getScheduleView(userId, scheduleId))
      const firstPhase = requireValue(view.phases[0])

      assert.strictEqual(view.totalCompletedInjections, 1)
      assert.strictEqual(firstPhase.completedInjections, 1)
    }).pipe(Effect.provide(TestLayer))
  )

  it.effect('loads reminder candidates through the cadence seam', () =>
    Effect.gen(function* () {
      const now = DateTime.makeUnsafe('2024-01-15T12:00:00Z')

      yield* insertUser('eligible-user', 'eligible@example.com', 'Eligible User')
      yield* insertSchedule(
        'eligible-schedule',
        'Eligible schedule',
        'Semaglutide',
        'weekly',
        testDate('2024-01-01T12:00:00Z'),
        'eligible-user'
      )
      yield* insertSchedulePhase('eligible-phase', 'eligible-schedule', 1, '2.5mg')

      yield* insertUser('disabled-user', 'disabled@example.com', 'Disabled User')
      yield* insertSettings('disabled-settings', 'disabled-user', 'lbs', false)
      yield* insertSchedule(
        'disabled-schedule',
        'Disabled schedule',
        'Semaglutide',
        'weekly',
        testDate('2024-01-01T12:00:00Z'),
        'disabled-user'
      )
      yield* insertSchedulePhase('disabled-phase', 'disabled-schedule', 1, '2.5mg')

      const service = yield* ScheduleCadenceService
      const candidates = yield* service.getReminderCandidates(now)
      const candidate = requireValue(candidates[0])

      assert.lengthOf(candidates, 1)
      assert.strictEqual(candidate.email, 'eligible@example.com')
      assert.strictEqual(candidate.nextScheduledDose.dosage, '2.5mg')
    }).pipe(Effect.provide(TestLayer))
  )
})

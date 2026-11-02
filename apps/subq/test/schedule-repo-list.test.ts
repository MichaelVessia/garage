import { assert, describe, it } from '@effect/vitest'
import * as Effect from 'effect/Effect'
import * as Option from 'effect/Option'

import {
  CalendarDate,
  DoseMg,
  InjectionScheduleCreate,
  MedicationCompound,
  PhaseOrder,
  ScheduleName,
  SchedulePhaseCreate,
} from '#shared'

import { ScheduleRepo, ScheduleRepoLive } from '../src/schedule/schedule-repo.js'
import { testDate } from './helpers/dates.js'
import { insertSchedule, insertSchedulePhase, makeInitializedTestLayer } from './helpers/test-db.js'

const TestLayer = makeInitializedTestLayer(ScheduleRepoLive)

const requireValue = <T>(value: T | null | undefined): T => {
  if (value === null || value === undefined) {
    throw new Error('Expected value to be present')
  }

  return value
}

describe('ScheduleRepo', () => {
  describe('list', () => {
    it.layer(TestLayer)((it) => {
      it.effect('returns schedules sorted by start date descending', () =>
        Effect.gen(function* () {
          const repo = yield* ScheduleRepo
          yield* repo.create(
            InjectionScheduleCreate.make({
              name: ScheduleName.make('January'),
              drug: MedicationCompound.make('Semaglutide'),
              supplier: Option.none(),
              frequency: 'weekly',
              startDate: CalendarDate.make('2024-01-01'),
              notes: Option.none(),
              phases: [
                SchedulePhaseCreate.make({
                  order: PhaseOrder.make(1),
                  durationDays: null,
                  doseMg: DoseMg.make(100),
                }),
              ],
            }),
            'user-123'
          )

          yield* repo.create(
            InjectionScheduleCreate.make({
              name: ScheduleName.make('March'),
              drug: MedicationCompound.make('Tirzepatide'),
              supplier: Option.none(),
              frequency: 'weekly',
              startDate: CalendarDate.make('2024-03-01'),
              notes: Option.none(),
              phases: [
                SchedulePhaseCreate.make({
                  order: PhaseOrder.make(1),
                  durationDays: null,
                  doseMg: DoseMg.make(200),
                }),
              ],
            }),
            'user-123'
          )

          yield* repo.create(
            InjectionScheduleCreate.make({
              name: ScheduleName.make('February'),
              drug: MedicationCompound.make('Retatrutide'),
              supplier: Option.none(),
              frequency: 'weekly',
              startDate: CalendarDate.make('2024-02-01'),
              notes: Option.none(),
              phases: [
                SchedulePhaseCreate.make({
                  order: PhaseOrder.make(1),
                  durationDays: null,
                  doseMg: DoseMg.make(150),
                }),
              ],
            }),
            'user-123'
          )

          const schedules = yield* repo.list('user-123')

          assert.strictEqual(schedules.length, 3)
          assert.strictEqual(requireValue(schedules[0]).name, 'March')
          assert.strictEqual(requireValue(schedules[1]).name, 'February')
          assert.strictEqual(requireValue(schedules[2]).name, 'January')
        })
      )
    })

    it.layer(TestLayer)((it) => {
      it.effect('only returns schedules for the specified user', () =>
        Effect.gen(function* () {
          yield* insertSchedule({
            id: 'sched-1',
            name: 'User 123 Schedule',
            drug: 'Semaglutide',
            frequency: 'weekly',
            startDate: testDate('2024-01-01'),
            userId: 'user-123',
          })
          yield* insertSchedule({
            id: 'sched-2',
            name: 'User 456 Schedule',
            drug: 'Semaglutide',
            frequency: 'weekly',
            startDate: testDate('2024-01-01'),
            userId: 'user-456',
          })

          const repo = yield* ScheduleRepo
          const schedules = yield* repo.list('user-123')

          assert.strictEqual(schedules.length, 1)
          assert.strictEqual(requireValue(schedules[0]).id, 'sched-1')
        })
      )
    })

    it.layer(TestLayer)((it) => {
      it.effect('includes phases with schedules', () =>
        Effect.gen(function* () {
          yield* insertSchedule({
            id: 'sched-1',
            name: 'With Phases',
            drug: 'Semaglutide',
            frequency: 'weekly',
            startDate: testDate('2024-01-01'),
            userId: 'user-123',
          })
          yield* insertSchedulePhase({ id: 'phase-1', scheduleId: 'sched-1', order: 1, doseMg: 100, durationDays: 28 })
          yield* insertSchedulePhase({
            id: 'phase-2',
            scheduleId: 'sched-1',
            order: 2,
            doseMg: 200,
            durationDays: null,
          })

          const repo = yield* ScheduleRepo
          const schedules = yield* repo.list('user-123')

          assert.strictEqual(schedules.length, 1)
          const schedule = requireValue(schedules[0])
          assert.strictEqual(schedule.phases.length, 2)
          assert.strictEqual(requireValue(schedule.phases[0]).doseMg, 100)
          assert.isNull(requireValue(schedule.phases[1]).durationDays)
        })
      )
    })
  })
})

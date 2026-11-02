import { assert, describe, it } from '@effect/vitest'
import * as DateTime from 'effect/DateTime'
import * as Effect from 'effect/Effect'
import * as Option from 'effect/Option'
import * as Schema from 'effect/Schema'
import * as SqlClient from 'effect/sql/SqlClient'

import {
  CalendarDate,
  DoseMg,
  InjectionScheduleCreate,
  MedicationCompound,
  Notes,
  PhaseDurationDays,
  PhaseOrder,
  ScheduleName,
  SchedulePhaseCreate,
  Supplier,
} from '#shared'

import { ScheduleRepo, ScheduleRepoLive } from '../src/schedule/schedule-repo.js'
import { testDate } from './helpers/dates.js'
import { insertInjectionLog, insertSchedule, makeInitializedTestLayer } from './helpers/test-db.js'

const TestLayer = makeInitializedTestLayer(ScheduleRepoLive)

const requireValue = <T>(value: T | null | undefined): T => {
  if (value === null || value === undefined) {
    throw new Error('Expected value to be present')
  }

  return value
}

describe('ScheduleRepo', () => {
  describe('create', () => {
    it.layer(TestLayer)((it) => {
      it.effect('creates a schedule with phases', () =>
        Effect.gen(function* () {
          const repo = yield* ScheduleRepo

          const created = yield* repo.create(
            InjectionScheduleCreate.make({
              name: ScheduleName.make('TRT Schedule'),
              drug: MedicationCompound.make('Semaglutide'),
              supplier: Option.some(Supplier.make('Empower')),
              frequency: 'weekly',
              startDate: CalendarDate.make('2024-01-01'),
              notes: Option.some(Notes.make('Start low')),
              phases: [
                SchedulePhaseCreate.make({
                  order: PhaseOrder.make(1),
                  durationDays: PhaseDurationDays.make(28),
                  doseMg: DoseMg.make(100),
                }),
                SchedulePhaseCreate.make({
                  order: PhaseOrder.make(2),
                  durationDays: PhaseDurationDays.make(28),
                  doseMg: DoseMg.make(150),
                }),
                SchedulePhaseCreate.make({
                  order: PhaseOrder.make(3),
                  durationDays: null,
                  doseMg: DoseMg.make(200),
                }),
              ],
            }),
            'user-123'
          )

          assert.strictEqual(created.name, 'TRT Schedule')
          assert.strictEqual(created.drug, 'Semaglutide')
          assert.strictEqual(created.supplier, 'Empower')
          assert.strictEqual(created.frequency, 'weekly')
          assert.strictEqual(created.isActive, true)
          assert.strictEqual(created.phases.length, 3)
          assert.strictEqual(requireValue(created.phases[0]).doseMg, 100)
          assert.isNull(requireValue(created.phases[2]).durationDays)

          const sql = yield* SqlClient.SqlClient
          const rows = yield* sql`SELECT calendar_date_migrated FROM injection_schedules WHERE id = ${created.id}`

          const markers = yield* Schema.decodeUnknownEffect(
            Schema.Array(Schema.Struct({ calendar_date_migrated: Schema.Int }))
          )(rows)

          assert.strictEqual(markers[0]?.calendar_date_migrated, 1)
        })
      )
    })

    it.layer(TestLayer)((it) => {
      it.effect('deactivates existing schedules when creating new one', () =>
        Effect.gen(function* () {
          const repo = yield* ScheduleRepo

          const first = yield* repo.create(
            InjectionScheduleCreate.make({
              name: ScheduleName.make('First Schedule'),
              drug: MedicationCompound.make('Semaglutide'),
              supplier: Option.none(),
              frequency: 'weekly',
              startDate: CalendarDate.make('2024-01-01'),
              notes: Option.none(),
              phases: [
                SchedulePhaseCreate.make({
                  order: PhaseOrder.make(1),
                  durationDays: PhaseDurationDays.make(28),
                  doseMg: DoseMg.make(100),
                }),
              ],
            }),
            'user-123'
          )

          assert.strictEqual(first.isActive, true)

          const second = yield* repo.create(
            InjectionScheduleCreate.make({
              name: ScheduleName.make('Second Schedule'),
              drug: MedicationCompound.make('Tirzepatide'),
              supplier: Option.none(),
              frequency: 'weekly',
              startDate: CalendarDate.make('2024-02-01'),
              notes: Option.none(),
              phases: [
                SchedulePhaseCreate.make({
                  order: PhaseOrder.make(1),
                  durationDays: PhaseDurationDays.make(28),
                  doseMg: DoseMg.make(200),
                }),
              ],
            }),
            'user-123'
          )

          assert.strictEqual(second.isActive, true)

          const firstAfter = yield* repo.findById(first.id, 'user-123')
          assert.strictEqual(Option.isSome(firstAfter), true)

          if (Option.isSome(firstAfter)) {
            assert.strictEqual(firstAfter.value.isActive, false)
          }
        })
      )
    })
  })

  describe('getActive', () => {
    it.layer(TestLayer)((it) => {
      it.effect('returns none when no active schedule', () =>
        Effect.gen(function* () {
          const repo = yield* ScheduleRepo
          const active = yield* repo.getActive('user-123')
          assert.strictEqual(Option.isNone(active), true)
        })
      )
    })

    it.layer(TestLayer)((it) => {
      it.effect('returns the active schedule', () =>
        Effect.gen(function* () {
          const repo = yield* ScheduleRepo

          const created = yield* repo.create(
            InjectionScheduleCreate.make({
              name: ScheduleName.make('Active Schedule'),
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

          const active = yield* repo.getActive('user-123')
          assert.strictEqual(Option.isSome(active), true)

          if (Option.isSome(active)) {
            assert.strictEqual(active.value.id, created.id)
          }
        })
      )
    })

    it.layer(TestLayer)((it) => {
      it.effect('only returns active schedule for the specified user', () =>
        Effect.gen(function* () {
          yield* insertSchedule({
            id: 'sched-1',
            name: 'Other User Schedule',
            drug: 'Semaglutide',
            frequency: 'weekly',
            startDate: testDate('2024-01-01'),
            userId: 'user-456',
            isActive: true,
          })

          const repo = yield* ScheduleRepo
          const active = yield* repo.getActive('user-123')
          assert.strictEqual(Option.isNone(active), true)
        })
      )
    })
  })

  describe('findById', () => {
    it.layer(TestLayer)((it) => {
      it.effect('returns none for non-existent id', () =>
        Effect.gen(function* () {
          const repo = yield* ScheduleRepo
          const found = yield* repo.findById('non-existent', 'user-123')
          assert.strictEqual(Option.isNone(found), true)
        })
      )
    })

    it.layer(TestLayer)((it) => {
      it.effect('finds schedule by id with phases', () =>
        Effect.gen(function* () {
          const repo = yield* ScheduleRepo

          const created = yield* repo.create(
            InjectionScheduleCreate.make({
              name: ScheduleName.make('Find Me'),
              drug: MedicationCompound.make('Semaglutide'),
              supplier: Option.none(),
              frequency: 'daily',
              startDate: CalendarDate.make('2024-01-01'),
              notes: Option.none(),
              phases: [
                SchedulePhaseCreate.make({
                  order: PhaseOrder.make(1),
                  durationDays: PhaseDurationDays.make(7),
                  doseMg: DoseMg.make(50),
                }),
                SchedulePhaseCreate.make({
                  order: PhaseOrder.make(2),
                  durationDays: null,
                  doseMg: DoseMg.make(100),
                }),
              ],
            }),
            'user-123'
          )

          const found = yield* repo.findById(created.id, 'user-123')
          assert.strictEqual(Option.isSome(found), true)

          if (Option.isSome(found)) {
            assert.strictEqual(found.value.name, 'Find Me')
            assert.strictEqual(found.value.phases.length, 2)
          }
        })
      )
    })

    it.layer(TestLayer)((it) => {
      it.effect('does not find schedule belonging to different user', () =>
        Effect.gen(function* () {
          yield* insertSchedule({
            id: 'sched-1',
            name: 'Other User',
            drug: 'Semaglutide',
            frequency: 'weekly',
            startDate: testDate('2024-01-01'),
            userId: 'user-456',
          })

          const repo = yield* ScheduleRepo
          const found = yield* repo.findById('sched-1', 'user-123')
          assert.strictEqual(Option.isNone(found), true)
        })
      )
    })
  })

  describe('delete', () => {
    it.layer(TestLayer)((it) => {
      it.effect('deletes existing schedule', () =>
        Effect.gen(function* () {
          const repo = yield* ScheduleRepo

          const created = yield* repo.create(
            InjectionScheduleCreate.make({
              name: ScheduleName.make('To Delete'),
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

          const deleted = yield* repo.delete(created.id, 'user-123')
          assert.strictEqual(deleted, true)

          const found = yield* repo.findById(created.id, 'user-123')
          assert.strictEqual(Option.isNone(found), true)
        })
      )
    })

    it.layer(TestLayer)((it) => {
      it.effect('returns false for non-existent schedule', () =>
        Effect.gen(function* () {
          const repo = yield* ScheduleRepo
          const deleted = yield* repo.delete('non-existent', 'user-123')
          assert.strictEqual(deleted, false)
        })
      )
    })

    it.layer(TestLayer)((it) => {
      it.effect('cannot delete schedule belonging to different user', () =>
        Effect.gen(function* () {
          yield* insertSchedule({
            id: 'sched-1',
            name: 'Other User',
            drug: 'Semaglutide',
            frequency: 'weekly',
            startDate: testDate('2024-01-01'),
            userId: 'user-456',
          })

          const repo = yield* ScheduleRepo
          const deleted = yield* repo.delete('sched-1', 'user-123')
          assert.strictEqual(deleted, false)
        })
      )
    })
  })

  describe('getLastInjectionDate', () => {
    it.layer(TestLayer)((it) => {
      it.effect('returns none when no injections exist', () =>
        Effect.gen(function* () {
          const repo = yield* ScheduleRepo
          const lastDate = yield* repo.getLastInjectionDate('user-123', 'Semaglutide')
          assert.strictEqual(Option.isNone(lastDate), true)
        })
      )
    })

    it.layer(TestLayer)((it) => {
      it.effect('returns most recent injection date for drug', () =>
        Effect.gen(function* () {
          yield* insertInjectionLog({
            id: 'inj-1',
            datetime: testDate('2024-01-15T10:00:00Z'),
            drug: 'Semaglutide',
            doseMg: 100,
            userId: 'user-123',
          })
          yield* insertInjectionLog({
            id: 'inj-2',
            datetime: testDate('2024-01-22T10:00:00Z'),
            drug: 'Semaglutide',
            doseMg: 100,
            userId: 'user-123',
          })
          yield* insertInjectionLog({
            id: 'inj-3',
            datetime: testDate('2024-01-20T10:00:00Z'),
            drug: 'Tirzepatide',
            doseMg: 0.25,
            userId: 'user-123',
          })

          const repo = yield* ScheduleRepo
          const lastDate = yield* repo.getLastInjectionDate('user-123', 'Semaglutide')

          assert.strictEqual(Option.isSome(lastDate), true)

          if (Option.isSome(lastDate)) {
            assert.include(DateTime.formatIso(lastDate.value), '2024-01-22')
          }
        })
      )
    })

    it.layer(TestLayer)((it) => {
      it.effect('only considers injections for the specified user', () =>
        Effect.gen(function* () {
          yield* insertInjectionLog({
            id: 'inj-1',
            datetime: testDate('2024-01-15T10:00:00Z'),
            drug: 'Semaglutide',
            doseMg: 100,
            userId: 'user-123',
          })
          yield* insertInjectionLog({
            id: 'inj-2',
            datetime: testDate('2024-01-22T10:00:00Z'),
            drug: 'Semaglutide',
            doseMg: 100,
            userId: 'user-456',
          })

          const repo = yield* ScheduleRepo
          const lastDate = yield* repo.getLastInjectionDate('user-123', 'Semaglutide')

          assert.strictEqual(Option.isSome(lastDate), true)

          if (Option.isSome(lastDate)) {
            assert.include(DateTime.formatIso(lastDate.value), '2024-01-15')
          }
        })
      )
    })
  })
})

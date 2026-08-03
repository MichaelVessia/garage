import { assert, describe, it } from '@effect/vitest'
import * as DateTime from 'effect/DateTime'
import * as Effect from 'effect/Effect'
import * as Layer from 'effect/Layer'
import * as Option from 'effect/Option'
import * as Schema from 'effect/Schema'
import { SqlClient } from 'effect/unstable/sql'

import {
  CalendarDate,
  DoseMg,
  MedicationCompound,
  Supplier,
  InjectionScheduleId,
  IanaTimezone,
  Notes,
  PhaseDurationDays,
  PhaseOrder,
  ScheduleName,
} from '#shared'

import { ScheduleRepo, ScheduleRepoLive } from '../src/schedule/schedule-repo.js'
import { SettingsRepo, SettingsRepoLive } from '../src/settings/settings-repo.js'
import { testDate } from './helpers/dates.js'
import {
  insertInjectionLog,
  insertSchedule,
  insertSchedulePhase,
  insertSettings,
  makeInitializedTestLayer,
} from './helpers/test-db.js'

const TestLayer = makeInitializedTestLayer(ScheduleRepoLive)
const MigrationTestLayer = makeInitializedTestLayer(Layer.merge(ScheduleRepoLive, SettingsRepoLive))

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
            {
              name: ScheduleName.make('TRT Schedule'),
              drug: MedicationCompound.make('Semaglutide'),
              supplier: Option.some(Supplier.make('Empower')),
              frequency: 'weekly',
              startDate: CalendarDate.make('2024-01-01'),
              notes: Option.some(Notes.make('Start low')),
              phases: [
                {
                  order: PhaseOrder.make(1),
                  durationDays: PhaseDurationDays.make(28),
                  doseMg: DoseMg.make(100),
                },
                {
                  order: PhaseOrder.make(2),
                  durationDays: PhaseDurationDays.make(28),
                  doseMg: DoseMg.make(150),
                },
                {
                  order: PhaseOrder.make(3),
                  durationDays: null,
                  doseMg: DoseMg.make(200),
                },
              ],
            },
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
            Schema.Array(Schema.Struct({ calendar_date_migrated: Schema.Number }))
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
            {
              name: ScheduleName.make('First Schedule'),
              drug: MedicationCompound.make('Semaglutide'),
              supplier: Option.none(),
              frequency: 'weekly',
              startDate: CalendarDate.make('2024-01-01'),
              notes: Option.none(),
              phases: [
                {
                  order: PhaseOrder.make(1),
                  durationDays: PhaseDurationDays.make(28),
                  doseMg: DoseMg.make(100),
                },
              ],
            },
            'user-123'
          )

          assert.strictEqual(first.isActive, true)

          const second = yield* repo.create(
            {
              name: ScheduleName.make('Second Schedule'),
              drug: MedicationCompound.make('Tirzepatide'),
              supplier: Option.none(),
              frequency: 'weekly',
              startDate: CalendarDate.make('2024-02-01'),
              notes: Option.none(),
              phases: [
                {
                  order: PhaseOrder.make(1),
                  durationDays: PhaseDurationDays.make(28),
                  doseMg: DoseMg.make(200),
                },
              ],
            },
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
            {
              name: ScheduleName.make('Active Schedule'),
              drug: MedicationCompound.make('Semaglutide'),
              supplier: Option.none(),
              frequency: 'weekly',
              startDate: CalendarDate.make('2024-01-01'),
              notes: Option.none(),
              phases: [
                {
                  order: PhaseOrder.make(1),
                  durationDays: null,
                  doseMg: DoseMg.make(100),
                },
              ],
            },
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
          yield* insertSchedule(
            'sched-1',
            'Other User Schedule',
            'Semaglutide',
            'weekly',
            testDate('2024-01-01'),
            'user-456',
            {
              isActive: true,
            }
          )

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
            {
              name: ScheduleName.make('Find Me'),
              drug: MedicationCompound.make('Semaglutide'),
              supplier: Option.none(),
              frequency: 'daily',
              startDate: CalendarDate.make('2024-01-01'),
              notes: Option.none(),
              phases: [
                {
                  order: PhaseOrder.make(1),
                  durationDays: PhaseDurationDays.make(7),
                  doseMg: DoseMg.make(50),
                },
                {
                  order: PhaseOrder.make(2),
                  durationDays: null,
                  doseMg: DoseMg.make(100),
                },
              ],
            },
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
          yield* insertSchedule('sched-1', 'Other User', 'Semaglutide', 'weekly', testDate('2024-01-01'), 'user-456')

          const repo = yield* ScheduleRepo
          const found = yield* repo.findById('sched-1', 'user-123')
          assert.strictEqual(Option.isNone(found), true)
        })
      )
    })
  })

  describe('update', () => {
    it.layer(TestLayer)((it) => {
      it.effect('updates schedule fields', () =>
        Effect.gen(function* () {
          const repo = yield* ScheduleRepo
          const created = yield* repo.create(
            {
              name: ScheduleName.make('Original'),
              drug: MedicationCompound.make('Semaglutide'),
              supplier: Option.some(Supplier.make('Clinic')),
              frequency: 'weekly',
              startDate: CalendarDate.make('2024-01-01'),
              notes: Option.none(),
              phases: [
                {
                  order: PhaseOrder.make(1),
                  durationDays: PhaseDurationDays.make(28),
                  doseMg: DoseMg.make(100),
                },
              ],
            },
            'user-123'
          )

          const updated = yield* repo.update(
            {
              id: created.id,
              name: ScheduleName.make('Updated'),
              supplier: null,
              frequency: 'every_3_days',
            },
            'user-123'
          )

          assert.strictEqual(updated.name, 'Updated')
          assert.isNull(updated.supplier)
          assert.strictEqual(updated.frequency, 'every_3_days')
          assert.strictEqual(updated.drug, 'Semaglutide')
        })
      )
    })

    it.layer(TestLayer)((it) => {
      it.effect('updates phases when provided', () =>
        Effect.gen(function* () {
          const repo = yield* ScheduleRepo
          const created = yield* repo.create(
            {
              name: ScheduleName.make('Phases Test'),
              drug: MedicationCompound.make('Semaglutide'),
              supplier: Option.none(),
              frequency: 'weekly',
              startDate: CalendarDate.make('2024-01-01'),
              notes: Option.none(),
              phases: [
                {
                  order: PhaseOrder.make(1),
                  durationDays: PhaseDurationDays.make(28),
                  doseMg: DoseMg.make(100),
                },
              ],
            },
            'user-123'
          )

          assert.strictEqual(created.phases.length, 1)

          const updated = yield* repo.update(
            {
              id: created.id,
              phases: [
                {
                  order: PhaseOrder.make(1),
                  durationDays: PhaseDurationDays.make(14),
                  doseMg: DoseMg.make(50),
                },
                {
                  order: PhaseOrder.make(2),
                  durationDays: null,
                  doseMg: DoseMg.make(100),
                },
              ],
            },
            'user-123'
          )

          assert.strictEqual(updated.phases.length, 2)
          assert.strictEqual(requireValue(updated.phases[0]).doseMg, 50)
          assert.isNull(requireValue(updated.phases[1]).durationDays)
        })
      )
    })

    it.layer(TestLayer)((it) => {
      it.effect('activating schedule deactivates others', () =>
        Effect.gen(function* () {
          const repo = yield* ScheduleRepo
          const first = yield* repo.create(
            {
              name: ScheduleName.make('First'),
              drug: MedicationCompound.make('Semaglutide'),
              supplier: Option.none(),
              frequency: 'weekly',
              startDate: CalendarDate.make('2024-01-01'),
              notes: Option.none(),
              phases: [
                {
                  order: PhaseOrder.make(1),
                  durationDays: null,
                  doseMg: DoseMg.make(100),
                },
              ],
            },
            'user-123'
          )

          const second = yield* repo.create(
            {
              name: ScheduleName.make('Second'),
              drug: MedicationCompound.make('Tirzepatide'),
              supplier: Option.none(),
              frequency: 'weekly',
              startDate: CalendarDate.make('2024-02-01'),
              notes: Option.none(),
              phases: [
                {
                  order: PhaseOrder.make(1),
                  durationDays: null,
                  doseMg: DoseMg.make(200),
                },
              ],
            },
            'user-123'
          )

          yield* repo.update({ id: first.id, isActive: true }, 'user-123')

          const firstAfter = yield* repo.findById(first.id, 'user-123')
          const secondAfter = yield* repo.findById(second.id, 'user-123')

          assert.strictEqual(Option.isSome(firstAfter) && firstAfter.value.isActive, true)
          assert.strictEqual(Option.isSome(secondAfter) && secondAfter.value.isActive, false)
        })
      )
    })

    it.layer(TestLayer)((it) => {
      it.effect('rejects start-date writes for marker-0 schedules before timezone migration completes', () =>
        Effect.gen(function* () {
          const sql = yield* SqlClient.SqlClient
          const audit = '2026-01-01T00:00:00.000Z'
          yield* sql`
            INSERT INTO injection_schedules (
              id, name, drug, frequency, start_date, calendar_date_migrated,
              is_active, user_id, created_at, updated_at
            ) VALUES ('schedule-legacy', 'Legacy', 'Semaglutide', 'weekly', '2026-01-01', 0,
                      1, 'user-123', ${audit}, ${audit})
          `

          const repo = yield* ScheduleRepo
          const result = yield* repo
            .update(
              {
                id: InjectionScheduleId.make('schedule-legacy'),
                startDate: CalendarDate.make('2026-02-01'),
              },
              'user-123'
            )
            .pipe(Effect.result)
          const rows = yield* sql`
            SELECT start_date, calendar_date_migrated
            FROM injection_schedules WHERE id = 'schedule-legacy'
          `
          const state = yield* Schema.decodeUnknownEffect(
            Schema.Array(Schema.Struct({ calendar_date_migrated: Schema.Number, start_date: Schema.String }))
          )(rows)

          assert.strictEqual(result._tag, 'Failure')
          if (result._tag === 'Failure') {
            assert.strictEqual(result.failure._tag, 'SettingsTimezoneNotInitialized')
          }
          assert.deepStrictEqual(state, [{ calendar_date_migrated: 0, start_date: '2026-01-01' }])
        })
      )

      it.effect('keeps marker-1 provenance when updating an initialized schedule start date', () =>
        Effect.gen(function* () {
          yield* insertSettings('settings-1', 'user-123', 'lbs', 'UTC')
          yield* insertSchedule(
            'schedule-modern',
            'Modern',
            'Semaglutide',
            'weekly',
            testDate('2026-01-01'),
            'user-123'
          )

          const repo = yield* ScheduleRepo
          const updated = yield* repo.update(
            {
              id: InjectionScheduleId.make('schedule-modern'),
              startDate: CalendarDate.make('2026-02-01'),
            },
            'user-123'
          )
          const sql = yield* SqlClient.SqlClient
          const rows = yield* sql`
            SELECT start_date, calendar_date_migrated
            FROM injection_schedules WHERE id = 'schedule-modern'
          `
          const state = yield* Schema.decodeUnknownEffect(
            Schema.Array(Schema.Struct({ calendar_date_migrated: Schema.Number, start_date: Schema.String }))
          )(rows)

          assert.strictEqual(updated.startDate, '2026-02-01')
          assert.deepStrictEqual(state, [{ calendar_date_migrated: 1, start_date: '2026-02-01' }])
        })
      )
    })

    it.layer(MigrationTestLayer)((it) => {
      it.effect('does not let concurrent timezone migration overwrite a schedule start-date update', () =>
        Effect.gen(function* () {
          const userId = 'user-concurrent-schedule-update'
          const sql = yield* SqlClient.SqlClient
          const audit = '2026-01-01T00:00:00.000Z'
          yield* insertSettings('settings-concurrent', userId, 'lbs')
          yield* Effect.forEach(
            Array.from({ length: 30 }, (_, index) => index),
            (index) => sql`
              INSERT INTO injection_schedules (
                id, name, drug, frequency, start_date, calendar_date_migrated,
                is_active, user_id, created_at, updated_at
              ) VALUES (${`filler-${index}`}, ${`Filler ${index}`}, 'Semaglutide', 'weekly',
                        '2026-01-01', 0, 0, ${userId}, ${audit}, ${audit})
            `,
            { concurrency: 1, discard: true }
          )
          yield* sql`
            INSERT INTO injection_schedules (
              id, name, drug, frequency, start_date, calendar_date_migrated,
              is_active, user_id, created_at, updated_at
            ) VALUES ('schedule-concurrent-update', 'Concurrent', 'Semaglutide', 'weekly',
                      '2026-01-01', 0, 1, ${userId}, ${audit}, ${audit})
          `

          const scheduleRepo = yield* ScheduleRepo
          const settingsRepo = yield* SettingsRepo
          const [, updateResult] = yield* Effect.all(
            [
              settingsRepo.initializeTimezone(userId, IanaTimezone.make('Pacific/Auckland')),
              scheduleRepo
                .update(
                  {
                    id: InjectionScheduleId.make('schedule-concurrent-update'),
                    startDate: CalendarDate.make('2026-03-01'),
                  },
                  userId
                )
                .pipe(Effect.result),
            ],
            { concurrency: 'unbounded' }
          )
          const rows = yield* sql`
            SELECT start_date, calendar_date_migrated
            FROM injection_schedules WHERE id = 'schedule-concurrent-update'
          `
          const state = yield* Schema.decodeUnknownEffect(
            Schema.Array(Schema.Struct({ calendar_date_migrated: Schema.Number, start_date: Schema.String }))
          )(rows)

          assert.strictEqual(state[0]?.calendar_date_migrated, 1)
          if (updateResult._tag === 'Success') {
            assert.strictEqual(state[0]?.start_date, '2026-03-01')
          } else {
            assert.strictEqual(updateResult.failure._tag, 'SettingsTimezoneNotInitialized')
            assert.strictEqual(state[0]?.start_date, '2026-01-02')
          }
        })
      )
    })

    it.layer(TestLayer)((it) => {
      it.effect('fails for non-existent schedule', () =>
        Effect.gen(function* () {
          const repo = yield* ScheduleRepo
          const result = yield* repo
            .update(
              {
                id: InjectionScheduleId.make('non-existent'),
                name: ScheduleName.make('Updated'),
              },
              'user-123'
            )
            .pipe(Effect.result)

          assert.strictEqual(result._tag, 'Failure')
          if (result._tag === 'Failure') {
            assert.strictEqual(result.failure._tag, 'ScheduleNotFoundError')
          }
        })
      )
    })

    it.layer(TestLayer)((it) => {
      it.effect('cannot update schedule belonging to different user', () =>
        Effect.gen(function* () {
          yield* insertSchedule('sched-1', 'Other User', 'Semaglutide', 'weekly', testDate('2024-01-01'), 'user-456')

          const repo = yield* ScheduleRepo
          const result = yield* repo
            .update(
              {
                id: InjectionScheduleId.make('sched-1'),
                name: ScheduleName.make('Hacked'),
              },
              'user-123'
            )
            .pipe(Effect.result)

          assert.strictEqual(result._tag, 'Failure')
          if (result._tag === 'Failure') {
            assert.strictEqual(result.failure._tag, 'ScheduleNotFoundError')
          }
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
            {
              name: ScheduleName.make('To Delete'),
              drug: MedicationCompound.make('Semaglutide'),
              supplier: Option.none(),
              frequency: 'weekly',
              startDate: CalendarDate.make('2024-01-01'),
              notes: Option.none(),
              phases: [
                {
                  order: PhaseOrder.make(1),
                  durationDays: null,
                  doseMg: DoseMg.make(100),
                },
              ],
            },
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
          yield* insertSchedule('sched-1', 'Other User', 'Semaglutide', 'weekly', testDate('2024-01-01'), 'user-456')

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
          yield* insertInjectionLog('inj-1', testDate('2024-01-15T10:00:00Z'), 'Semaglutide', 100, 'user-123')
          yield* insertInjectionLog('inj-2', testDate('2024-01-22T10:00:00Z'), 'Semaglutide', 100, 'user-123')
          yield* insertInjectionLog('inj-3', testDate('2024-01-20T10:00:00Z'), 'Tirzepatide', 0.25, 'user-123')

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
          yield* insertInjectionLog('inj-1', testDate('2024-01-15T10:00:00Z'), 'Semaglutide', 100, 'user-123')
          yield* insertInjectionLog('inj-2', testDate('2024-01-22T10:00:00Z'), 'Semaglutide', 100, 'user-456')

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

  describe('list', () => {
    it.layer(TestLayer)((it) => {
      it.effect('returns schedules sorted by start date descending', () =>
        Effect.gen(function* () {
          const repo = yield* ScheduleRepo
          yield* repo.create(
            {
              name: ScheduleName.make('January'),
              drug: MedicationCompound.make('Semaglutide'),
              supplier: Option.none(),
              frequency: 'weekly',
              startDate: CalendarDate.make('2024-01-01'),
              notes: Option.none(),
              phases: [
                {
                  order: PhaseOrder.make(1),
                  durationDays: null,
                  doseMg: DoseMg.make(100),
                },
              ],
            },
            'user-123'
          )

          yield* repo.create(
            {
              name: ScheduleName.make('March'),
              drug: MedicationCompound.make('Tirzepatide'),
              supplier: Option.none(),
              frequency: 'weekly',
              startDate: CalendarDate.make('2024-03-01'),
              notes: Option.none(),
              phases: [
                {
                  order: PhaseOrder.make(1),
                  durationDays: null,
                  doseMg: DoseMg.make(200),
                },
              ],
            },
            'user-123'
          )

          yield* repo.create(
            {
              name: ScheduleName.make('February'),
              drug: MedicationCompound.make('Retatrutide'),
              supplier: Option.none(),
              frequency: 'weekly',
              startDate: CalendarDate.make('2024-02-01'),
              notes: Option.none(),
              phases: [
                {
                  order: PhaseOrder.make(1),
                  durationDays: null,
                  doseMg: DoseMg.make(150),
                },
              ],
            },
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
          yield* insertSchedule(
            'sched-1',
            'User 123 Schedule',
            'Semaglutide',
            'weekly',
            testDate('2024-01-01'),
            'user-123'
          )
          yield* insertSchedule(
            'sched-2',
            'User 456 Schedule',
            'Semaglutide',
            'weekly',
            testDate('2024-01-01'),
            'user-456'
          )

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
          yield* insertSchedule('sched-1', 'With Phases', 'Semaglutide', 'weekly', testDate('2024-01-01'), 'user-123')
          yield* insertSchedulePhase('phase-1', 'sched-1', 1, 100, 28)
          yield* insertSchedulePhase('phase-2', 'sched-1', 2, 200, null)

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

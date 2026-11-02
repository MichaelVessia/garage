import { assert, describe, it } from '@effect/vitest'
import * as Effect from 'effect/Effect'
import * as Layer from 'effect/Layer'
import * as Option from 'effect/Option'
import * as Schema from 'effect/Schema'
import * as SqlClient from 'effect/sql/SqlClient'

import {
  CalendarDate,
  DoseMg,
  IanaTimezone,
  InjectionScheduleCreate,
  InjectionScheduleId,
  InjectionScheduleUpdate,
  MedicationCompound,
  PhaseDurationDays,
  PhaseOrder,
  ScheduleName,
  SchedulePhaseCreate,
  Supplier,
} from '#shared'

import { ScheduleRepo, ScheduleRepoLive } from '../src/schedule/schedule-repo.js'
import { SettingsRepo, SettingsRepoLive } from '../src/settings/settings-repo.js'
import { testDate } from './helpers/dates.js'
import { insertSchedule, insertSettings, makeInitializedTestLayer } from './helpers/test-db.js'

const TestLayer = makeInitializedTestLayer(ScheduleRepoLive)
const MigrationTestLayer = makeInitializedTestLayer(Layer.merge(ScheduleRepoLive, SettingsRepoLive))

const requireValue = <T>(value: T | null | undefined): T => {
  if (value === null || value === undefined) {
    throw new Error('Expected value to be present')
  }

  return value
}

describe('ScheduleRepo', () => {
  describe('update', () => {
    it.layer(TestLayer)((it) => {
      it.effect('updates schedule fields', () =>
        Effect.gen(function* () {
          const repo = yield* ScheduleRepo

          const created = yield* repo.create(
            InjectionScheduleCreate.make({
              name: ScheduleName.make('Original'),
              drug: MedicationCompound.make('Semaglutide'),
              supplier: Option.some(Supplier.make('Clinic')),
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

          const updated = yield* repo.update(
            InjectionScheduleUpdate.make({
              id: created.id,
              name: ScheduleName.make('Updated'),
              supplier: null,
              frequency: 'every_3_days',
            }),
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
            InjectionScheduleCreate.make({
              name: ScheduleName.make('Phases Test'),
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

          assert.strictEqual(created.phases.length, 1)

          const updated = yield* repo.update(
            InjectionScheduleUpdate.make({
              id: created.id,
              phases: [
                SchedulePhaseCreate.make({
                  order: PhaseOrder.make(1),
                  durationDays: PhaseDurationDays.make(14),
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
            InjectionScheduleCreate.make({
              name: ScheduleName.make('First'),
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

          const second = yield* repo.create(
            InjectionScheduleCreate.make({
              name: ScheduleName.make('Second'),
              drug: MedicationCompound.make('Tirzepatide'),
              supplier: Option.none(),
              frequency: 'weekly',
              startDate: CalendarDate.make('2024-02-01'),
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

          yield* repo.update(InjectionScheduleUpdate.make({ id: first.id, isActive: true }), 'user-123')

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
              InjectionScheduleUpdate.make({
                id: InjectionScheduleId.make('schedule-legacy'),
                startDate: CalendarDate.make('2026-02-01'),
              }),
              'user-123'
            )
            .pipe(Effect.result)

          const rows = yield* sql`
            SELECT start_date, calendar_date_migrated
            FROM injection_schedules WHERE id = 'schedule-legacy'
          `

          const state = yield* Schema.decodeUnknownEffect(
            Schema.Array(Schema.Struct({ calendar_date_migrated: Schema.Int, start_date: Schema.String }))
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
          yield* insertSettings({ id: 'settings-1', userId: 'user-123', weightUnit: 'lbs', timezone: 'UTC' })
          yield* insertSchedule({
            id: 'schedule-modern',
            name: 'Modern',
            drug: 'Semaglutide',
            frequency: 'weekly',
            startDate: testDate('2026-01-01'),
            userId: 'user-123',
          })

          const repo = yield* ScheduleRepo

          const updated = yield* repo.update(
            InjectionScheduleUpdate.make({
              id: InjectionScheduleId.make('schedule-modern'),
              startDate: CalendarDate.make('2026-02-01'),
            }),
            'user-123'
          )

          const sql = yield* SqlClient.SqlClient

          const rows = yield* sql`
            SELECT start_date, calendar_date_migrated
            FROM injection_schedules WHERE id = 'schedule-modern'
          `

          const state = yield* Schema.decodeUnknownEffect(
            Schema.Array(Schema.Struct({ calendar_date_migrated: Schema.Int, start_date: Schema.String }))
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
          yield* insertSettings({ id: 'settings-concurrent', userId, weightUnit: 'lbs' })
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
                  InjectionScheduleUpdate.make({
                    id: InjectionScheduleId.make('schedule-concurrent-update'),
                    startDate: CalendarDate.make('2026-03-01'),
                  }),
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
            Schema.Array(Schema.Struct({ calendar_date_migrated: Schema.Int, start_date: Schema.String }))
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
              InjectionScheduleUpdate.make({
                id: InjectionScheduleId.make('non-existent'),
                name: ScheduleName.make('Updated'),
              }),
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
          yield* insertSchedule({
            id: 'sched-1',
            name: 'Other User',
            drug: 'Semaglutide',
            frequency: 'weekly',
            startDate: testDate('2024-01-01'),
            userId: 'user-456',
          })

          const repo = yield* ScheduleRepo

          const result = yield* repo
            .update(
              InjectionScheduleUpdate.make({
                id: InjectionScheduleId.make('sched-1'),
                name: ScheduleName.make('Hacked'),
              }),
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
})

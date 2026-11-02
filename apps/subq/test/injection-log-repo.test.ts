import { assert, describe, it } from '@effect/vitest'
import * as Arr from 'effect/Array'
import * as DateTime from 'effect/DateTime'
import * as Effect from 'effect/Effect'
import * as Option from 'effect/Option'

import {
  DoseMg,
  InjectionLogCreate,
  InjectionLogId,
  InjectionLogUpdate,
  InjectionSite,
  MedicationCompound,
  Notes,
  Supplier,
} from '#shared'

import { InjectionLogRepo, InjectionLogRepoLive } from '../src/injection/injection-log-repo.js'
import { testDate } from './helpers/dates.js'
import { insertInjectionLog, insertSchedule, makeInitializedTestLayer } from './helpers/test-db.js'

const TestLayer = makeInitializedTestLayer(InjectionLogRepoLive)

describe('InjectionLogRepo', () => {
  describe('create', () => {
    it.layer(TestLayer)((it) => {
      it.effect('creates an injection log with all fields', () =>
        Effect.gen(function* () {
          const repo = yield* InjectionLogRepo

          const created = yield* repo.create(
            InjectionLogCreate.make({
              datetime: DateTime.makeUnsafe('2024-01-15T10:00:00Z'),
              drug: MedicationCompound.make('Semaglutide'),
              supplier: Option.some(Supplier.make('Empower Pharmacy')),
              doseMg: DoseMg.make(200),
              injectionSite: Option.some(InjectionSite.make('left ventrogluteal')),
              notes: Option.some(Notes.make('Weekly injection')),
              scheduleId: Option.none(),
            }),
            'user-123'
          )

          assert.strictEqual(created.drug, 'Semaglutide')
          assert.strictEqual(created.supplier, 'Empower Pharmacy')
          assert.strictEqual(created.doseMg, 200)
          assert.strictEqual(created.injectionSite, 'left ventrogluteal')
          assert.strictEqual(created.notes, 'Weekly injection')
          assert.isDefined(created.id)
        })
      )
    })

    it.layer(TestLayer)((it) => {
      it.effect('creates an injection log with minimal fields', () =>
        Effect.gen(function* () {
          const repo = yield* InjectionLogRepo

          const created = yield* repo.create(
            InjectionLogCreate.make({
              datetime: DateTime.makeUnsafe('2024-01-15T10:00:00Z'),
              drug: MedicationCompound.make('Tirzepatide'),
              supplier: Option.none(),
              doseMg: DoseMg.make(0.25),
              injectionSite: Option.none(),
              notes: Option.none(),
              scheduleId: Option.none(),
            }),
            'user-123'
          )

          assert.strictEqual(created.drug, 'Tirzepatide')
          assert.isNull(created.supplier)
          assert.isNull(created.injectionSite)
          assert.isNull(created.notes)
        })
      )
    })
  })

  describe('findById', () => {
    it.layer(TestLayer)((it) => {
      it.effect('finds existing entry by id', () =>
        Effect.gen(function* () {
          const repo = yield* InjectionLogRepo

          const created = yield* repo.create(
            InjectionLogCreate.make({
              datetime: DateTime.makeUnsafe('2024-01-15T10:00:00Z'),
              drug: MedicationCompound.make('Semaglutide'),
              supplier: Option.none(),
              doseMg: DoseMg.make(100),
              injectionSite: Option.none(),
              notes: Option.none(),
              scheduleId: Option.none(),
            }),
            'user-123'
          )

          const found = yield* repo.findById(created.id, 'user-123')
          assert.isTrue(Option.isSome(found))

          if (Option.isSome(found)) {
            assert.strictEqual(found.value.id, created.id)
            assert.strictEqual(found.value.drug, 'Semaglutide')
          }
        })
      )
    })

    it.layer(TestLayer)((it) => {
      it.effect('returns none for non-existent id', () =>
        Effect.gen(function* () {
          const repo = yield* InjectionLogRepo
          const found = yield* repo.findById('non-existent', 'user-123')
          assert.isTrue(Option.isNone(found))
        })
      )
    })

    it.layer(TestLayer)((it) => {
      it.effect('does not find entry belonging to different user', () =>
        Effect.gen(function* () {
          yield* insertInjectionLog({
            id: 'inj-1',
            datetime: testDate('2024-01-15T10:00:00Z'),
            drug: 'Semaglutide',
            doseMg: 100,
            userId: 'user-456',
          })

          const repo = yield* InjectionLogRepo
          const found = yield* repo.findById('inj-1', 'user-123')
          assert.isTrue(Option.isNone(found))
        })
      )
    })
  })

  describe('update', () => {
    it.layer(TestLayer)((it) => {
      it.effect('updates injection log fields', () =>
        Effect.gen(function* () {
          const repo = yield* InjectionLogRepo

          const created = yield* repo.create(
            InjectionLogCreate.make({
              datetime: DateTime.makeUnsafe('2024-01-15T10:00:00Z'),
              drug: MedicationCompound.make('Semaglutide'),
              supplier: Option.some(Supplier.make('Pharmacy')),
              doseMg: DoseMg.make(100),
              injectionSite: Option.none(),
              notes: Option.none(),
              scheduleId: Option.none(),
            }),
            'user-123'
          )

          const updated = yield* repo.update(
            InjectionLogUpdate.make({
              id: created.id,
              doseMg: DoseMg.make(150),
              injectionSite: Option.some(InjectionSite.make('right deltoid')),
              notes: Option.some(Notes.make('Updated notes')),
              supplier: null,
              scheduleId: Option.none(),
            }),
            'user-123'
          )

          assert.strictEqual(updated.doseMg, 150)
          assert.isNull(updated.supplier)
          assert.strictEqual(updated.injectionSite, 'right deltoid')
          assert.strictEqual(updated.notes, 'Updated notes')
        })
      )
    })

    it.layer(TestLayer)((it) => {
      it.effect('fails for non-existent entry', () =>
        Effect.gen(function* () {
          const repo = yield* InjectionLogRepo

          const result = yield* repo
            .update(
              InjectionLogUpdate.make({
                id: InjectionLogId.make('non-existent'),
                doseMg: DoseMg.make(100),
                injectionSite: Option.none(),
                notes: Option.none(),
                scheduleId: Option.none(),
              }),
              'user-123'
            )
            .pipe(Effect.result)

          assert.strictEqual(result._tag, 'Failure')

          if (result._tag === 'Failure') {
            assert.strictEqual(result.failure._tag, 'InjectionLogNotFoundError')
          }
        })
      )
    })

    it.layer(TestLayer)((it) => {
      it.effect('cannot update entry belonging to different user', () =>
        Effect.gen(function* () {
          yield* insertInjectionLog({
            id: 'inj-1',
            datetime: testDate('2024-01-15T10:00:00Z'),
            drug: 'Semaglutide',
            doseMg: 100,
            userId: 'user-456',
          })

          const repo = yield* InjectionLogRepo

          const result = yield* repo
            .update(
              InjectionLogUpdate.make({
                id: InjectionLogId.make('inj-1'),
                doseMg: DoseMg.make(999),
                injectionSite: Option.none(),
                notes: Option.none(),
                scheduleId: Option.none(),
              }),
              'user-123'
            )
            .pipe(Effect.result)

          assert.strictEqual(result._tag, 'Failure')

          if (result._tag === 'Failure') {
            assert.strictEqual(result.failure._tag, 'InjectionLogNotFoundError')
          }
        })
      )
    })
  })

  describe('delete', () => {
    it.layer(TestLayer)((it) => {
      it.effect('deletes existing entry', () =>
        Effect.gen(function* () {
          const repo = yield* InjectionLogRepo

          const created = yield* repo.create(
            InjectionLogCreate.make({
              datetime: DateTime.makeUnsafe('2024-01-15T10:00:00Z'),
              drug: MedicationCompound.make('Semaglutide'),
              supplier: Option.none(),
              doseMg: DoseMg.make(100),
              injectionSite: Option.none(),
              notes: Option.none(),
              scheduleId: Option.none(),
            }),
            'user-123'
          )

          const deleted = yield* repo.delete(created.id, 'user-123')
          assert.isTrue(deleted)

          const found = yield* repo.findById(created.id, 'user-123')
          assert.isTrue(Option.isNone(found))
        })
      )
    })

    it.layer(TestLayer)((it) => {
      it.effect('returns false for non-existent entry', () =>
        Effect.gen(function* () {
          const repo = yield* InjectionLogRepo
          const deleted = yield* repo.delete('non-existent', 'user-123')
          assert.isFalse(deleted)
        })
      )
    })

    it.layer(TestLayer)((it) => {
      it.effect('cannot delete entry belonging to different user', () =>
        Effect.gen(function* () {
          yield* insertInjectionLog({
            id: 'inj-1',
            datetime: testDate('2024-01-15T10:00:00Z'),
            drug: 'Semaglutide',
            doseMg: 100,
            userId: 'user-456',
          })

          const repo = yield* InjectionLogRepo
          const deleted = yield* repo.delete('inj-1', 'user-123')
          assert.isFalse(deleted)
        })
      )
    })
  })

  describe('getUniqueSites', () => {
    it.layer(TestLayer)((it) => {
      it.effect('returns unique injection sites for user', () =>
        Effect.gen(function* () {
          yield* insertInjectionLog({
            id: 'inj-1',
            datetime: testDate('2024-01-15T10:00:00Z'),
            drug: 'Semaglutide',
            doseMg: 100,
            userId: 'user-123',
            injectionSite: 'left VG',
          })
          yield* insertInjectionLog({
            id: 'inj-2',
            datetime: testDate('2024-01-16T10:00:00Z'),
            drug: 'Semaglutide',
            doseMg: 100,
            userId: 'user-123',
            injectionSite: 'right VG',
          })
          yield* insertInjectionLog({
            id: 'inj-3',
            datetime: testDate('2024-01-17T10:00:00Z'),
            drug: 'Semaglutide',
            doseMg: 100,
            userId: 'user-123',
            injectionSite: 'left VG',
          })
          yield* insertInjectionLog({
            id: 'inj-4',
            datetime: testDate('2024-01-18T10:00:00Z'),
            drug: 'Semaglutide',
            doseMg: 100,
            userId: 'user-456',
            injectionSite: 'other site',
          })

          const repo = yield* InjectionLogRepo
          const sites = yield* repo.getUniqueSites('user-123')

          assert.strictEqual(sites.length, 2)
          assert.include(sites, 'left VG')
          assert.include(sites, 'right VG')
          assert.notInclude(sites, 'other site')
        })
      )
    })
  })

  describe('getLastSite', () => {
    it.layer(TestLayer)((it) => {
      it.effect('returns most recent injection site', () =>
        Effect.gen(function* () {
          yield* insertInjectionLog({
            id: 'inj-1',
            datetime: testDate('2024-01-15T10:00:00Z'),
            drug: 'Semaglutide',
            doseMg: 100,
            userId: 'user-123',
            injectionSite: 'left VG',
          })
          yield* insertInjectionLog({
            id: 'inj-2',
            datetime: testDate('2024-01-17T10:00:00Z'),
            drug: 'Semaglutide',
            doseMg: 100,
            userId: 'user-123',
            injectionSite: 'right VG',
          })

          const repo = yield* InjectionLogRepo
          const lastSite = yield* repo.getLastSite('user-123')

          assert.isTrue(Option.isSome(lastSite))

          if (Option.isSome(lastSite)) {
            assert.strictEqual(lastSite.value, 'right VG')
          }
        })
      )
    })

    it.layer(TestLayer)((it) => {
      it.effect('returns null when no injections exist', () =>
        Effect.gen(function* () {
          const repo = yield* InjectionLogRepo
          const lastSite = yield* repo.getLastSite('user-123')

          assert.isTrue(Option.isNone(lastSite))
        })
      )
    })
  })

  describe('listBySchedule', () => {
    it.layer(TestLayer)((it) => {
      it.effect('returns injections for a specific schedule', () =>
        Effect.gen(function* () {
          yield* insertSchedule({
            id: 'sched-1',
            name: 'TRT',
            drug: 'Semaglutide',
            frequency: 'weekly',
            startDate: testDate('2024-01-01'),
            userId: 'user-123',
          })
          yield* insertInjectionLog({
            id: 'inj-1',
            datetime: testDate('2024-01-15T10:00:00Z'),
            drug: 'Semaglutide',
            doseMg: 100,
            userId: 'user-123',
            scheduleId: 'sched-1',
          })
          yield* insertInjectionLog({
            id: 'inj-2',
            datetime: testDate('2024-01-22T10:00:00Z'),
            drug: 'Semaglutide',
            doseMg: 100,
            userId: 'user-123',
            scheduleId: 'sched-1',
          })
          yield* insertInjectionLog({
            id: 'inj-3',
            datetime: testDate('2024-01-16T10:00:00Z'),
            drug: 'Tirzepatide',
            doseMg: 0.25,
            userId: 'user-123',
          })

          const repo = yield* InjectionLogRepo
          const logs = yield* repo.listBySchedule('sched-1', 'user-123')

          assert.strictEqual(logs.length, 2)
          assert.isTrue(Arr.every(logs, (l) => l.scheduleId === 'sched-1'))
        })
      )
    })
  })
})

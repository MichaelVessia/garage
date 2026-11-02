import { assert, describe, it } from '@effect/vitest'
import * as Arr from 'effect/Array'
import * as DateTime from 'effect/DateTime'
import * as Effect from 'effect/Effect'
import * as Option from 'effect/Option'

import { DoseMg, InjectionLogCreate, InjectionLogListParams, Limit, MedicationCompound, Offset } from '#shared'

import { InjectionLogRepo, InjectionLogRepoLive } from '../src/injection/injection-log-repo.js'
import { testDate } from './helpers/dates.js'
import { insertInjectionLog, makeInitializedTestLayer } from './helpers/test-db.js'

const TestLayer = makeInitializedTestLayer(InjectionLogRepoLive)

const requireValue = <T>(value: T | null | undefined): T => {
  if (value === null || value === undefined) {
    throw new Error('Expected value to be present')
  }

  return value
}

describe('InjectionLogRepo', () => {
  describe('list', () => {
    it.layer(TestLayer)((it) => {
      it.effect('lists injection logs with pagination', () =>
        Effect.gen(function* () {
          const repo = yield* InjectionLogRepo

          for (let i = 0; i < 5; i += 1) {
            yield* repo.create(
              InjectionLogCreate.make({
                datetime: DateTime.makeUnsafe(`2024-01-${15 + i}T10:00:00Z`),
                drug: MedicationCompound.make('Semaglutide'),
                supplier: Option.none(),
                doseMg: DoseMg.make(100 + i * 10),
                injectionSite: Option.none(),
                notes: Option.none(),
                scheduleId: Option.none(),
              }),
              'user-123'
            )
          }

          const page1 = yield* repo.list(
            InjectionLogListParams.make({ limit: Limit.make(2), offset: Offset.make(0) }),
            'user-123'
          )

          assert.strictEqual(page1.length, 2)
          // Should be sorted by datetime DESC
          assert.strictEqual(requireValue(page1[0]).doseMg, 140)
          assert.strictEqual(requireValue(page1[1]).doseMg, 130)

          const page2 = yield* repo.list(
            InjectionLogListParams.make({ limit: Limit.make(2), offset: Offset.make(2) }),
            'user-123'
          )

          assert.strictEqual(page2.length, 2)
        })
      )
    })

    it.layer(TestLayer)((it) => {
      it.effect('filters by drug', () =>
        Effect.gen(function* () {
          const repo = yield* InjectionLogRepo
          yield* repo.create(
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
          yield* repo.create(
            InjectionLogCreate.make({
              datetime: DateTime.makeUnsafe('2024-01-16T10:00:00Z'),
              drug: MedicationCompound.make('Tirzepatide'),
              supplier: Option.none(),
              doseMg: DoseMg.make(0.25),
              injectionSite: Option.none(),
              notes: Option.none(),
              scheduleId: Option.none(),
            }),
            'user-123'
          )

          const filtered = yield* repo.list(
            InjectionLogListParams.make({
              limit: Limit.make(50),
              offset: Offset.make(0),
              drug: MedicationCompound.make('Semaglutide'),
            }),
            'user-123'
          )

          assert.strictEqual(filtered.length, 1)
          assert.strictEqual(requireValue(filtered[0]).drug, 'Semaglutide')
        })
      )
    })

    it.layer(TestLayer)((it) => {
      it.effect('filters by date range', () =>
        Effect.gen(function* () {
          const repo = yield* InjectionLogRepo
          yield* repo.create(
            InjectionLogCreate.make({
              datetime: DateTime.makeUnsafe('2024-01-10T10:00:00Z'),
              drug: MedicationCompound.make('Semaglutide'),
              supplier: Option.none(),
              doseMg: DoseMg.make(100),
              injectionSite: Option.none(),
              notes: Option.none(),
              scheduleId: Option.none(),
            }),
            'user-123'
          )
          yield* repo.create(
            InjectionLogCreate.make({
              datetime: DateTime.makeUnsafe('2024-01-15T10:00:00Z'),
              drug: MedicationCompound.make('Semaglutide'),
              supplier: Option.none(),
              doseMg: DoseMg.make(200),
              injectionSite: Option.none(),
              notes: Option.none(),
              scheduleId: Option.none(),
            }),
            'user-123'
          )
          yield* repo.create(
            InjectionLogCreate.make({
              datetime: DateTime.makeUnsafe('2024-01-20T10:00:00Z'),
              drug: MedicationCompound.make('Semaglutide'),
              supplier: Option.none(),
              doseMg: DoseMg.make(300),
              injectionSite: Option.none(),
              notes: Option.none(),
              scheduleId: Option.none(),
            }),
            'user-123'
          )

          const filtered = yield* repo.list(
            InjectionLogListParams.make({
              limit: Limit.make(50),
              offset: Offset.make(0),
              startDate: DateTime.makeUnsafe('2024-01-12T00:00:00Z'),
              endDate: DateTime.makeUnsafe('2024-01-18T00:00:00Z'),
            }),
            'user-123'
          )

          assert.strictEqual(filtered.length, 1)
          assert.strictEqual(requireValue(filtered[0]).doseMg, 200)
        })
      )
    })

    it.layer(TestLayer)((it) => {
      it.effect('only returns entries for the specified user', () =>
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
            datetime: testDate('2024-01-16T10:00:00Z'),
            drug: 'Semaglutide',
            doseMg: 100,
            userId: 'user-456',
          })
          yield* insertInjectionLog({
            id: 'inj-3',
            datetime: testDate('2024-01-17T10:00:00Z'),
            drug: 'Semaglutide',
            doseMg: 100,
            userId: 'user-123',
          })

          const repo = yield* InjectionLogRepo

          const logs = yield* repo.list(
            InjectionLogListParams.make({ limit: Limit.make(50), offset: Offset.make(0) }),
            'user-123'
          )

          assert.strictEqual(logs.length, 2)
          assert.isTrue(Arr.every(logs, (l) => l.id === 'inj-1' || l.id === 'inj-3'))
        })
      )
    })
  })
})

import { assert, it } from '@effect/vitest'
import {
  BeltworksSaveSchema,
  Building,
  Game,
  Progression,
  applyEdits,
  createRuntime,
  createRuntimeFromSave,
  enqueue,
  exportSave,
  sideContract,
} from '@garage/beltworks-domain'
import * as Arr from 'effect/Array'
import * as SecureRandom from 'effect/crypto/SecureRandom'
import * as Duration from 'effect/Duration'
import * as Effect from 'effect/Effect'
import * as Request from 'effect/http/HttpServerRequest'
import * as Response from 'effect/http/HttpServerResponse'
import * as Layer from 'effect/Layer'
import * as Rec from 'effect/Record'
import * as S from 'effect/Schema'
import * as TestClock from 'effect/testing/TestClock'

import { FactoryStore, router } from '../src/BeltworksRouter.ts'
import { catchUp } from '../src/catchUp.ts'

const memory = Layer.sync(FactoryStore, () => {
  const records = new Map<string, unknown>()
  return FactoryStore.of({
    get: (key) => Effect.sync(() => records.get(key)),
    put: (key, value) =>
      S.decodeEffect(S.fromJsonString(S.Unknown))(value).pipe(
        Effect.tap((record) => Effect.sync(() => records.set(key, record))),
        Effect.asVoid,
        Effect.orDie
      ),
  })
})
const request = (path: string, method = 'GET', body?: string) =>
  router.pipe(
    Effect.provideService(
      Request.HttpServerRequest,
      Request.fromWeb(
        new globalThis.Request('https://factory.test' + path, body === undefined ? { method } : { method, body })
      )
    ),
    Effect.map((r) => Response.toWeb(r))
  )
const json = (response: globalThis.Response) =>
  Effect.promise(() => response.text()).pipe(Effect.flatMap(S.decodeEffect(S.fromJsonString(S.Unknown))))
it.effect('saves, advances and shares a factory without credentials', () =>
  Effect.gen(function* () {
    const path = '/api/saves/player-1234'
    const board = createRuntime(0)
    assert.equal(catchUp({ runtime: board, elapsedMs: 3_600_000 }).offlineTicks, 0)
    // Seed zero has an active contract for threes at index seven.
    const contract = sideContract(0, 7)
    assert.equal(contract.value, 3)
    board.tick(
      Game.Schedule(
        Game.System('Test/Contract', { resources: { p: Game.System.writeResource(Progression) } }, ({ resources }) =>
          resources.p.set({
            ...resources.p.get(),
            milestoneIndex: 3,
            contractIndex: 7,
            contractDelivered: contract.quota - 1,
          })
        )
      )
    )
    enqueue({ type: 'placeBuilding', kind: 'combiner', op: 'add', gx: 15, gy: 11, dir: 'S' })(board)
    enqueue({ type: 'placeBuilding', kind: 'extractor', gx: 13, gy: 12, dir: 'N' })(board)
    enqueue({ type: 'placeBuilding', kind: 'extractor', gx: 21, gy: 13, dir: 'N' })(board)
    enqueue({ type: 'placeBuilding', kind: 'belt', gx: 21, gy: 12, dir: 'N' })(board)
    for (const gx of [13, 14]) {
      enqueue({ type: 'placeBuilding', kind: 'belt', gx, gy: 11, dir: 'E' })(board)
    }
    for (let gx = 21; gx >= 16; gx--) {
      enqueue({ type: 'placeBuilding', kind: 'belt', gx, gy: 11, dir: 'W' })(board)
    }
    for (const gx of [15, 16]) {
      enqueue({ type: 'placeBuilding', kind: 'belt', gx, gy: 12, dir: 'E' })(board)
    }
    board.tick(applyEdits)
    const save = exportSave(board)
    const legacy = yield* S.decodeUnknownEffect(BeltworksSaveSchema)(save)
    const body = yield* S.encodeEffect(S.fromJsonString(S.Unknown))({
      ...legacy,
      resources: {
        ...legacy.resources,
        'Beltworks/Progression': {
          ...Rec.remove(Rec.remove(legacy.resources['Beltworks/Progression'], 'meta'), 'vaultRemainders'),
          seed: 0,
        },
      },
    })
    const health = yield* request('/health')
    const status = yield* json(health)
    assert.deepEqual(status, { status: 'ok' })
    assert.equal((yield* request(path)).status, 404)
    assert.equal((yield* request('/api/shares/missing-1234')).status, 404)
    assert.equal((yield* request('/api/saves/x', 'PUT', body)).status, 400)
    assert.equal((yield* request(path, 'PUT', '{')).status, 400)
    assert.equal((yield* request('/api/shares', 'POST', '{}')).status, 400)
    assert.equal((yield* request(path, 'PUT', body)).status, 200)
    const created = yield* request('/api/shares', 'POST', body)
    const shared = yield* json(created).pipe(Effect.flatMap(S.decodeUnknownEffect(S.Struct({ shareId: S.String }))))
    yield* TestClock.adjust(Duration.minutes(2))
    const progress = S.decodeUnknownEffect(
      S.Struct({ offlineTicks: S.Int, deliveredDelta: S.Int, sparksEarned: S.Int, save: S.Unknown })
    )
    const after = yield* request(path).pipe(Effect.flatMap(json), Effect.flatMap(progress))
    assert.equal(after.offlineTicks, 3600)
    const restored = createRuntimeFromSave(after.save)
    if (!restored.ok) {
      throw new Error('Invalid offline save')
    }
    const p = restored.value.inspect(
      Game.Inspector(
        'Test/OfflineBalance',
        { resources: { p: Game.System.readResource(Progression) } },
        ({ resources }) => resources.p.get()
      )
    )
    assert.isAbove(after.deliveredDelta, 0)
    assert.equal(p.contractIndex, 8)
    assert.equal(p.contractDelivered, 0)
    assert.equal(after.sparksEarned, after.deliveredDelta + contract.sparks)
    assert.equal(p.vault[3], after.deliveredDelta + contract.stock)
    const again = yield* request(path).pipe(Effect.flatMap(json), Effect.flatMap(progress))
    assert.equal(again.offlineTicks, 0)
    assert.deepEqual(after.save, again.save)
    const original = yield* request('/api/shares/' + shared.shareId).pipe(Effect.flatMap(json))
    assert.deepEqual(original, { save })
  }).pipe(Effect.provide(Layer.merge(memory, SecureRandom.layerWebCrypto)))
)

it.effect('restores a stamped filter, beacon and divider before offline production', () =>
  Effect.gen(function* () {
    const board = createRuntime(-1)
    board.tick(
      Game.Schedule(
        Game.System(
          'Test/UnlockDivider',
          { resources: { p: Game.System.writeResource(Progression) } },
          ({ resources }) => resources.p.set({ ...resources.p.get(), milestoneIndex: 8 })
        )
      )
    )
    enqueue({ type: 'ascendBoard', mutator: 'highVelocity' })(board)
    enqueue({ type: 'buyMetaUpgrade', upgrade: 'masterySynergy' })(board)
    board.tick(applyEdits)
    board.tick(
      Game.Schedule(
        Game.System('Test/NextRun', { resources: { p: Game.System.writeResource(Progression) } }, ({ resources }) =>
          resources.p.set({ ...resources.p.get(), milestoneIndex: 8 })
        )
      )
    )
    enqueue({
      type: 'stampBlueprint',
      originX: 18,
      originY: 14,
      entries: [
        { dx: 0, dy: 0, kind: 'combiner', op: 'div', dir: 'N' },
        { dx: 1, dy: 0, kind: 'beacon', dir: 'W' },
        { dx: 2, dy: 0, kind: 'filter', targetValue: 2, dir: 'W' },
        { dx: 3, dy: 0, kind: 'belt', dir: 'W' },
      ],
    })(board)
    enqueue({ type: 'placeBuilding', kind: 'extractor', dir: 'S', gx: 21, gy: 13 })(board)
    board.tick(applyEdits)
    const body = yield* S.encodeEffect(S.fromJsonString(S.Unknown))(exportSave(board))
    const path = '/api/saves/strategy-1234'
    assert.equal((yield* request(path, 'PUT', body)).status, 200)
    yield* TestClock.adjust(Duration.seconds(5))
    const actual = yield* request(path).pipe(
      Effect.flatMap(json),
      Effect.flatMap(S.decodeUnknownEffect(S.Struct({ save: S.Unknown, offlineTicks: S.Int })))
    )
    const expected = catchUp({ runtime: board, elapsedMs: 5000 })
    assert.equal(actual.offlineTicks, 300)
    assert.deepEqual(actual.save, expected.save)
    const states = board.inspect(
      Game.Inspector(
        'Test/RestoredMachines',
        { queries: { machines: Game.Query({ selection: { building: Game.Query.read(Building) } }) } },
        ({ queries }) => Array.from(queries.machines.each(), (e) => queries.machines.data.building.get(e))
      )
    )
    assert.includeDeepMembers(states, [{ kind: 'filter', targetValue: 2 }])
    assert.isTrue(Arr.some(states, (s) => s.kind === 'combiner' && s.op === 'div'))
    assert.isTrue(Arr.some(states, (s) => s.kind === 'beacon' && s.fuelTicks > 0))
  }).pipe(Effect.provide(Layer.merge(memory, SecureRandom.layerWebCrypto)))
)

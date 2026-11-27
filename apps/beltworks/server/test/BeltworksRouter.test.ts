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
import * as Option from 'effect/Option'
import * as Rec from 'effect/Record'
import * as S from 'effect/Schema'
import * as TestClock from 'effect/testing/TestClock'

import { FactoryStore, router } from '../src/BeltworksRouter.ts'
import { catchUp } from '../src/catchUp.ts'
import { LeaderboardStore, readBoards, updateBoards } from '../src/LeaderboardStore.ts'
import type { PlayerEntry } from '../src/LeaderboardStore.ts'
import { verifyFactoryThroughput } from '../src/verifyThroughput.ts'

const leaderboard = Layer.sync(LeaderboardStore, () => {
  const players = new Map<string, PlayerEntry>()
  return LeaderboardStore.of({
    list: (viewer) => Effect.sync(() => readBoards({ entries: players.values(), viewer })),
    submit: (incoming, clearShare) =>
      Effect.sync(() => {
        const { updated, result } = updateBoards({ players, incoming, clearShare })
        players.set(updated.playerId, updated)
        return result
      }),
  })
})

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
    assert.include(p.meta.medals, 'contractRunner')
    const medalBonus = Math.floor(((after.deliveredDelta - 1) * 3) / 100)
    assert.equal(after.sparksEarned, after.deliveredDelta + contract.sparks + medalBonus)
    assert.equal(p.vault[3], after.deliveredDelta + contract.stock)
    const again = yield* request(path).pipe(Effect.flatMap(json), Effect.flatMap(progress))
    assert.equal(again.offlineTicks, 0)
    assert.deepEqual(after.save, again.save)
    const original = yield* request('/api/shares/' + shared.shareId).pipe(Effect.flatMap(json))
    assert.deepEqual(original, { save })
  }).pipe(Effect.provide([memory, leaderboard, SecureRandom.layerWebCrypto]))
)

it.effect('shares and advances an ascended v7 factory with a fueled beacon', () =>
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
    enqueue({ type: 'placeBuilding', gx: 18, gy: 14, kind: 'combiner', op: 'div', dir: 'N' })(board)
    enqueue({ type: 'placeBuilding', gx: 19, gy: 14, kind: 'beacon', dir: 'W' })(board)
    enqueue({ type: 'placeBuilding', gx: 20, gy: 14, kind: 'filter', targetValue: 2, dir: 'W' })(board)
    enqueue({ type: 'placeBuilding', gx: 21, gy: 14, kind: 'belt', dir: 'W' })(board)
    enqueue({ type: 'placeBuilding', gx: 18, gy: 15, kind: 'belt', dir: 'W' })(board)
    enqueue({ type: 'placeBuilding', gx: 19, gy: 15, kind: 'buffer', dir: 'N' })(board)
    enqueue({ type: 'placeBuilding', kind: 'extractor', dir: 'S', gx: 21, gy: 13 })(board)
    board.tick(applyEdits)
    const start = catchUp({ runtime: board, elapsedMs: 5000 }).save
    const states = board.inspect(
      Game.Inspector(
        'Test/SharedMachines',
        { queries: { machines: Game.Query({ selection: { building: Game.Query.read(Building) } }) } },
        ({ queries }) => Array.from(queries.machines.each(), (e) => queries.machines.data.building.get(e))
      )
    )
    assert.isTrue(Arr.some(states, (s) => s.kind === 'belt'))
    assert.isTrue(Arr.some(states, (s) => s.kind === 'buffer'))
    assert.includeDeepMembers(states, [{ kind: 'filter', targetValue: 2 }])
    assert.isTrue(Arr.some(states, (s) => s.kind === 'combiner' && s.op === 'div'))
    assert.isTrue(Arr.some(states, (s) => s.kind === 'beacon' && s.fuelTicks > 0))
    const body = yield* S.encodeEffect(S.fromJsonString(S.Unknown))(start)
    const created = yield* request('/api/shares', 'POST', body)
    const shared = yield* json(created).pipe(Effect.flatMap(S.decodeUnknownEffect(S.Struct({ shareId: S.String }))))
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
    const original = yield* request('/api/shares/' + shared.shareId).pipe(Effect.flatMap(json))
    assert.deepEqual(original, { save: start })
    const progression = board.inspect(
      Game.Inspector('Test/CloudMeta', { resources: { p: Game.System.readResource(Progression) } }, ({ resources }) =>
        resources.p.get()
      )
    )
    assert.equal(progression.runTicks, 600)
    assert.equal(progression.meta.ascensions, 1)
    assert.includeMembers([...progression.meta.medals], ['ascended'])
  }).pipe(Effect.provide([memory, leaderboard, SecureRandom.layerWebCrypto]))
)

it('excludes untracked deliveries and saved history from the measured rate', () => {
  const board = createRuntime(0)
  enqueue({ type: 'placeBuilding', kind: 'extractor', gx: 21, gy: 13, dir: 'W' })(board)
  for (const gx of [19, 20]) {
    enqueue({ type: 'placeBuilding', kind: 'belt', gx, gy: 13, dir: 'W' })(board)
  }
  board.tick(applyEdits)
  board.tick(
    Game.Schedule(
      Game.System(
        'Test/DeliveryHistory',
        { resources: { p: Game.System.writeResource(Progression) } },
        ({ resources }) =>
          resources.p.set({
            ...resources.p.get(),
            deliveryWindow: [{ tick: 0, value: 1 }],
            rateByValue: { 1: 1 },
            totalDelivered: 100,
          })
      )
    )
  )
  const verified = verifyFactoryThroughput(exportSave(board))
  assert.equal(Option.getOrThrow(verified).score.verifiedThroughput, 0)
  assert.isAbove(catchUp({ runtime: board, elapsedMs: 10_000 }).deliveredDelta, 0)
})

const boardPath = '/api/leaderboard'
const post = Effect.fn(function* (payload: unknown) {
  const body = yield* S.encodeEffect(S.fromJsonString(S.Unknown))(payload)
  return yield* request(boardPath, 'POST', body)
})
const posted = S.decodeUnknownEffect(
  S.Struct({
    entry: S.Struct({
      callsign: S.String,
      verifiedThroughput: S.Int,
      milestone: S.Int,
      bestRunTicks: S.NullOr(S.Int),
      shareId: S.NullOr(S.String),
    }),
    ranks: S.Struct({ foundryRank: S.Int, fastestM8: S.NullOr(S.Int), throughput: S.NullOr(S.Int) }),
  })
)
it.effect('ranks submitted factories, keeps best scores and shares the original snapshot', () =>
  Effect.gen(function* () {
    const runtime = createRuntime(0)
    const empty = exportSave(runtime)
    runtime.tick(
      Game.Schedule(
        Game.System(
          'Test/ReadyForDelivery',
          { resources: { p: Game.System.writeResource(Progression) } },
          ({ resources }) => {
            const p = resources.p.get()
            resources.p.set({ ...p, delivered: { 1: 7 }, meta: { ...p.meta, bestRunTicks: Option.some(150) } })
          }
        )
      )
    )
    enqueue({ type: 'placeBuilding', kind: 'extractor', gx: 13, gy: 12, dir: 'E' })(runtime)
    for (const gx of [14, 15, 16]) {
      enqueue({ type: 'placeBuilding', kind: 'belt', gx, gy: 12, dir: 'E' })(runtime)
    }
    runtime.tick(applyEdits)
    const save = exportSave(runtime)
    const input = { playerId: 'player-1234', callsign: '  Forge  ', save }
    yield* Effect.forEach(
      [{ save: {} }, { callsign: '<img>' }, { callsign: ' ' }, { playerId: 'short' }, { shareFactory: 'yes' }],
      (bad) => post({ ...input, ...bad }).pipe(Effect.map((response) => assert.equal(response.status, 400))),
      { concurrency: 1 }
    )
    const first = yield* post({ ...input, shareFactory: true }).pipe(Effect.flatMap(json), Effect.flatMap(posted))
    assert.equal(first.entry.callsign, 'Forge')
    assert.equal(first.entry.milestone, 1)
    const delivered = catchUp({ runtime, elapsedMs: 10_000 }).deliveredDelta
    assert.isAbove(delivered, 0)
    assert.equal(first.entry.verifiedThroughput, delivered * 6)
    assert.deepEqual(first.ranks, { foundryRank: 1, fastestM8: 1, throughput: 1 })
    assert.isNotNull(first.entry.shareId)
    const shared = yield* request('/api/shares/' + first.entry.shareId).pipe(Effect.flatMap(json))
    assert.deepEqual(shared, { save })
    const second = yield* post({ ...input, save: empty, callsign: 'Mint' }).pipe(
      Effect.flatMap(json),
      Effect.flatMap(posted)
    )
    assert.deepEqual(second.entry, { ...first.entry, callsign: 'Mint' })
    const unshared = yield* post({ ...input, callsign: 'Mint', shareFactory: false }).pipe(
      Effect.flatMap(json),
      Effect.flatMap(posted)
    )
    assert.isNull(unshared.entry.shareId)
    const other = yield* post({ ...input, playerId: 'player-5678', callsign: 'Idle', save: empty }).pipe(
      Effect.flatMap(json),
      Effect.flatMap(posted)
    )
    assert.deepEqual(other.ranks, { foundryRank: 2, fastestM8: null, throughput: null })
    assert.equal(other.entry.verifiedThroughput, 0)
    const row = S.Struct({ callsign: S.String, isYou: S.Boolean })
    const response = yield* request(boardPath + '?playerId=player-5678')
    const raw = yield* Effect.promise(() => response.text())
    assert.notInclude(raw, 'playerId')
    assert.notInclude(raw, 'player-1234')
    const boards = yield* S.decodeEffect(
      S.fromJsonString(
        S.Struct({ totalPlayers: S.Int, foundryRank: S.Array(row), fastestM8: S.Array(row), throughput: S.Array(row) })
      )
    )(raw)
    const mint = { callsign: 'Mint', isYou: false }
    assert.deepEqual(boards, {
      totalPlayers: 2,
      foundryRank: [mint, { callsign: 'Idle', isYou: true }],
      fastestM8: [mint],
      throughput: [mint],
    })
  }).pipe(Effect.provide([memory, leaderboard, SecureRandom.layerWebCrypto]))
)

it('limits each board to 50 and ranks eligible players outside the published list', () => {
  const players = new Map<string, PlayerEntry>()
  for (let i = 1; i <= 52; i++) {
    const playerId = 'factory-' + i
    players.set(playerId, {
      playerId,
      callsign: playerId,
      ascensions: 0,
      totalCores: i,
      milestone: 1,
      medals: 0,
      bestRunTicks: Option.some(i),
      verifiedThroughput: i * 6,
      shareId: Option.none(),
      updatedAtMs: 0,
    })
  }
  const result = readBoards({ entries: players.values(), viewer: '' })
  assert.equal(result.totalPlayers, 52)
  for (const board of [result.foundryRank, result.fastestM8, result.throughput]) {
    assert.lengthOf(board, 50)
  }
  assert.equal(result.fastestM8[0]?.bestRunTicks, 1)
  assert.equal(result.throughput[0]?.verifiedThroughput, 312)
  const incoming = players.get('factory-1')
  assert.isDefined(incoming)
  if (incoming === undefined) {
    throw new Error('Missing player')
  }
  assert.deepEqual(updateBoards({ players, incoming }).result.ranks, { foundryRank: 52, fastestM8: 1, throughput: 52 })
})

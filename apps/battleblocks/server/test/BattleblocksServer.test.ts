import { assert, it } from '@effect/vitest'
import {
  ClientMessage,
  DuelCommand,
  DuelPhase,
  Seat,
  ServerMessage,
  DeviceLinkRequest,
  DeviceSession,
  DeviceLinkResponse,
  LeaderboardResponse,
  PlayerProfile,
} from '@garage/battleblocks-domain'
import * as Arr from 'effect/Array'
import * as SecureRandom from 'effect/crypto/SecureRandom'
import * as Effect from 'effect/Effect'
import * as Request from 'effect/http/HttpServerRequest'
import * as Response from 'effect/http/HttpServerResponse'
import * as Layer from 'effect/Layer'
import * as Option from 'effect/Option'
import * as Rec from 'effect/Record'
import * as S from 'effect/Schema'
import * as Str from 'effect/String'
import * as TestClock from 'effect/testing/TestClock'

import { router } from '../src/BattleblocksRouter.ts'
import { QueueGateway, selectQueuePairs, buildQueuedStatus } from '../src/QueueLogic.ts'
import { ratingsRepository, RatingsGateway, LINK_CODE_TTL_MS, buildLeaderboard } from '../src/RatingsLogic.ts'
import {
  applyRankedAlarm,
  createRankedRoom,
  nextAlarmMs,
  markSeatConnected,
  markSeatDisconnected,
  RoomGateway,
  RoomRecord,
  buildSnapshot,
  createRoom,
  handleMessage,
  joinRoom,
} from '../src/RoomLogic.ts'

const memory = Layer.sync(RoomGateway, () => {
  const records = new Map<string, RoomRecord>()
  return RoomGateway.of({
    create: (roomId, name, token, seed) =>
      Effect.sync(() => {
        if (records.has(roomId)) {
          return false
        }
        records.set(roomId, createRoom({ roomId, name, token, seed }))
        return true
      }),
    join: (roomId, input, freshToken) =>
      Effect.sync(() => {
        const room = records.get(roomId)
        if (room === undefined) {
          return Option.none()
        }
        const joined = joinRoom({ room, input, freshToken })
        records.set(roomId, joined.room)
        return Option.some(joined.admission)
      }),
    connect: (id, req) => Effect.succeed(Response.text(id + new URL(req.url, 'https://battleblocks.test').search)),
  })
})
const memoryRatings = Effect.gen(function* () {
  const random = yield* SecureRandom.SecureRandom
  const rows = new Map<string, unknown>()
  return ratingsRepository<never>({
    random,
    storage: {
      transaction: (body) =>
        body({
          get: (key) => Effect.sync(() => rows.get(key)),
          put: (entries) =>
            Effect.sync(() => {
              for (const [key, value] of Rec.toEntries(entries)) {
                rows.set(key, value)
              }
            }),
          delete: (key) => Effect.sync(() => rows.delete(key)),
        }),
      players: Effect.sync(() => Arr.filter(Array.from(rows.values()), S.is(PlayerProfile))),
    },
  })
})
const api = Layer.mergeAll(
  memory,
  Layer.effect(RatingsGateway, memoryRatings).pipe(Layer.provide(SecureRandom.layerWebCrypto)),
  Layer.succeed(QueueGateway)({ connect: () => Effect.succeed(Response.text('queue')) }),
  SecureRandom.layerWebCrypto
)
const request = (path: string, method = 'POST', body?: string, token?: string) =>
  router.pipe(
    Effect.provideService(
      Request.HttpServerRequest,
      Request.fromWeb(
        new globalThis.Request('https://battleblocks.test' + path, {
          method,
          body: body ?? null,
          headers: token === undefined ? {} : { authorization: 'Bearer ' + token },
        })
      )
    ),
    Effect.map((r) => Response.toWeb(r))
  )
const admission = S.Struct({ roomId: S.String, seat: S.NullOr(Seat), token: S.NullOr(S.String) })
const readAdmission = (response: globalThis.Response) =>
  Effect.promise(() => response.text()).pipe(Effect.flatMap(S.decodeEffect(S.fromJsonString(admission))))
it.effect('creates a room, admits two players, restores seats and admits spectators', () =>
  Effect.gen(function* () {
    const health = yield* request('/health', 'GET')
    const healthBody = yield* Effect.promise(() => health.text())
    assert.equal(healthBody, '{"status":"ok"}')
    assert.equal((yield* request('/api/rooms/ZZZZZZ/join')).status, 404)
    assert.equal((yield* request('/api/rooms/bad/join')).status, 400)
    assert.equal((yield* request('/api/rooms', 'POST', '{"name":"  "}')).status, 400)
    assert.equal((yield* request('/api/rooms', 'POST', '{')).status, 400)
    const created = yield* request('/api/rooms').pipe(Effect.flatMap(readAdmission))
    assert.equal(created.seat, 0)
    assert.match(created.roomId, /^[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{6}$/u)
    assert.isString(created.token)
    const path = '/api/rooms/' + Str.toLowerCase(created.roomId)
    const join = (body?: string) => request(path + '/join', 'POST', body).pipe(Effect.flatMap(readAdmission))
    const guest = yield* join('{"name":"  Guest  "}')
    assert.equal(guest.seat, 1)
    assert.isString(guest.token)
    assert.notEqual(guest.token, created.token)
    const encode = S.encodeEffect(S.fromJsonString(S.Unknown))
    const hostBody = yield* encode({ token: created.token, name: 'Host' })
    const guestBody = yield* encode({ token: guest.token })
    const reclaimedHost = yield* join(hostBody)
    assert.deepEqual(reclaimedHost, created)
    const reclaimedGuest = yield* join(guestBody)
    assert.deepEqual(reclaimedGuest, guest)
    const spectator = yield* join()
    assert.deepEqual(spectator, { roomId: created.roomId, seat: null, token: null })
    const ws = yield* request(path + '/ws?token=abc', 'GET')
    const forwarded = yield* Effect.promise(() => ws.text())
    assert.equal(forwarded, created.roomId + '?token=abc')
  }).pipe(Effect.provide(api))
)

const host = createRoom({ roomId: 'ABC234', name: 'Host', token: 'host-secret', seed: 77 })
const playing = joinRoom({ room: host, input: { name: 'Guest' }, freshToken: 'guest-secret' }).room
const action = DuelCommand.cases
const rename = (name: string) => ClientMessage.cases.SetName.make({ name })
const command = (value: DuelCommand) => ClientMessage.cases.Command.make({ command: value })
const dispatch = Effect.fn(function* (room: RoomRecord, seat: Option.Option<Seat>, message: ClientMessage) {
  const text = yield* S.encodeEffect(S.fromJsonString(ClientMessage))(message)
  return yield* handleMessage(room, seat, new TextEncoder().encode(text))
})
const update = Effect.fn(function* (room: RoomRecord, seat: Seat, message: ClientMessage) {
  const result = yield* dispatch(room, Option.some(seat), message)
  if ('reply' in result) {
    throw new Error('Expected room update, received ' + result.reply._tag)
  }
  return result.room
})
const error = (message: string) => ({ reply: ServerMessage.cases.ErrorNotice.make({ message }) })
it.effect('rejects invalid input and unauthorized commands, handles ping and updates names', () =>
  Effect.gen(function* () {
    const seat = Option.some<Seat>(0)
    const move = command(action.Move.make({ card: 2, direction: 'forward' }))
    const malformed = yield* handleMessage(host, seat, '{')
    assert.deepEqual(malformed, error('Invalid message'))
    const invalid = yield* handleMessage(host, seat, '{}')
    assert.deepEqual(invalid, error('Invalid message'))
    const waiting = yield* dispatch(host, seat, move)
    assert.deepEqual(waiting, error('Waiting for opponent to join'))
    const unauthorized = yield* dispatch(playing, Option.none(), move)
    assert.deepEqual(unauthorized, error('Spectators cannot change the room'))
    const invalidName = yield* dispatch(playing, seat, rename('  '))
    assert.deepEqual(invalidName, error('Name must contain 1 to 20 characters'))
    assert.deepEqual((yield* update(playing, 1, rename('  Ada  '))).names, ['Host', 'Ada'])
    const pong = yield* dispatch(playing, Option.none(), ClientMessage.cases.Ping.make({}))
    assert.deepEqual(pong, {
      reply: ServerMessage.cases.Pong.make({}),
    })
    const wrongSeat = yield* dispatch(playing, Option.some(1), move)
    assert.deepEqual(wrongSeat, error('Move is illegal for seat 1 in AwaitAction.'))
    const illegal = yield* dispatch(playing, seat, command(action.Block.make({})))
    assert.deepEqual(illegal, error('Block is illegal for seat 0 in AwaitAction.'))
  })
)
it.effect('applies moves, strikes, blocks, match wins and rematches', () =>
  Effect.gen(function* () {
    const room: RoomRecord = {
      ...playing,
      duel: {
        ...playing.duel,
        positions: [3, 8],
        hands: [
          [2, 3, 5],
          [3, 5],
        ],
        score: [2, 0],
      },
    }
    const moved = yield* update(room, 0, command(action.Move.make({ card: 2, direction: 'forward' })))
    assert.deepEqual(moved.duel.positions, [5, 8])
    assert.equal(moved.seq, 1)
    const strike = command(action.Strike.make({ card: 5, count: 1 }))
    const attacked = yield* update(room, 0, strike)
    const blocked = yield* update(attacked, 1, command(action.Block.make({})))
    assert.equal(blocked.duel.phase._tag, 'AwaitAction')
    assert.equal(blocked.seq, 2)
    const won = yield* update(attacked, 1, command(action.TakeHit.make({})))
    assert.equal(won.status, 'finished')
    const again = yield* update(won, 0, command(action.Rematch.make({})))
    assert.equal(again.status, 'playing')
    assert.deepEqual(again.duel.score, [0, 0])
    assert.equal(again.seq, 3)
    const encoded = yield* S.encodeEffect(S.fromJsonString(RoomRecord))(won)
    const restored = yield* S.decodeEffect(S.fromJsonString(RoomRecord))(encoded)
    assert.deepEqual(restored, won)
  })
)
it('projects private hands for each socket and hides all hands from spectators', () => {
  const room: RoomRecord = {
    ...playing,
    duel: {
      ...playing.duel,
      hands: [
        [2, 2],
        [4, 4, 4],
      ],
    },
  }
  const snapshot = (seat: Option.Option<Seat>) => buildSnapshot({ room, seat, connected: [true, false] })
  const first = snapshot(Option.some(0))
  const second = snapshot(Option.some(1))
  const observer = snapshot(Option.none())
  assert.deepEqual(first.view.myHand, [2, 2])
  assert.deepEqual(second.view.myHand, [4, 4, 4])
  assert.deepEqual(observer.view.myHand, [])
  assert.deepEqual(observer.view.viewer, Option.none())
  for (const value of [first, second, observer]) {
    assert.notProperty(value.view, 'hands')
    assert.notProperty(value.view, 'deck')
    assert.notProperty(value.view, 'seed')
    assert.notProperty(value, 'tokens')
    assert.deepEqual(value.connected, [true, false])
    assert.deepEqual(value.seatNames, ['Host', 'Guest'])
  }
})

const readJson =
  <A extends S.ConstraintDecoder<unknown, never>>(schema: A) =>
  (response: globalThis.Response) =>
    Effect.promise(() => response.text()).pipe(Effect.flatMap(S.decodeEffect(S.fromJsonString(schema))))
it.effect('registers, authenticates and renames profiles across linked devices', () =>
  Effect.gen(function* () {
    const path = '/api/profile'
    const register = (body?: string) => request(path + '/register', 'POST', body)
    assert.equal((yield* register('{')).status, 400)
    assert.equal((yield* register('{"callsign":"   "}')).status, 400)
    const guest = yield* register().pipe(Effect.flatMap(readJson(DeviceSession)))
    assert.match(guest.profile.callsign, /^Knight-[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{4}$/u)
    assert.deepEqual(guest.profile, {
      playerId: guest.profile.playerId,
      callsign: guest.profile.callsign,
      rating: 1000,
      peakRating: 1000,
      wins: 0,
      losses: 0,
      streak: 0,
    })
    const original = yield* register('{"callsign":" Ada "}').pipe(Effect.flatMap(readJson(DeviceSession)))
    assert.equal(original.profile.callsign, 'Ada')
    const get = (token?: string) => request(path, 'GET', undefined, token)
    assert.equal((yield* get()).status, 401)
    assert.equal((yield* get('bad')).status, 401)
    assert.equal((yield* request(path, 'PATCH', '{"callsign":" "}', original.token)).status, 400)
    assert.equal((yield* request(path, 'PATCH', '{"callsign":"New"}', 'bad')).status, 401)
    assert.equal((yield* request(path + '/link', 'POST', undefined, 'bad')).status, 401)
    const create = () =>
      request(path + '/link', 'POST', undefined, original.token).pipe(Effect.flatMap(readJson(DeviceLinkResponse)))
    const link = yield* create()
    assert.match(link.code, /^[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{6}$/u)
    const claim = (code: string) =>
      S.encodeEffect(S.fromJsonString(DeviceLinkRequest))({ code }).pipe(
        Effect.flatMap((body) => request(path + '/claim', 'POST', body))
      )
    assert.equal((yield* claim('  ')).status, 400)
    assert.equal((yield* request(path + '/claim', 'POST', '{')).status, 400)
    const second = yield* claim(' ' + Str.toLowerCase(link.code) + ' ').pipe(Effect.flatMap(readJson(DeviceSession)))
    assert.notEqual(second.token, original.token)
    assert.deepEqual(second.profile, original.profile)
    assert.equal((yield* claim(link.code)).status, 404)
    const renamed = yield* request(path, 'PATCH', '{"callsign":" Grace "}', second.token).pipe(
      Effect.flatMap(readJson(S.Struct({ profile: PlayerProfile })))
    )
    assert.equal(renamed.profile.callsign, 'Grace')
    yield* Effect.forEach(
      [original.token, second.token],
      Effect.fn(function* (token) {
        const response = yield* get(token).pipe(Effect.flatMap(readJson(S.Struct({ profile: PlayerProfile }))))
        assert.deepEqual(response, renamed)
      }),
      { concurrency: 1 }
    )
    const expired = yield* create()
    yield* TestClock.adjust(LINK_CODE_TTL_MS)
    assert.equal((yield* claim(expired.code)).status, 410)
    assert.equal((yield* claim(expired.code)).status, 404)
    yield* Effect.forEach(
      [
        ['/api/leaderboard', second.token],
        ['/api/leaderboard?playerId=' + original.profile.playerId, undefined],
      ] as const,
      Effect.fn(function* ([url, token]) {
        const board = yield* request(url, 'GET', undefined, token).pipe(Effect.flatMap(readJson(LeaderboardResponse)))
        assert.deepEqual(board, {
          viewer: { ...renamed.profile, isViewer: true, rank: 0 },
          entries: [],
          totalPlayers: 0,
        })
      }),
      { concurrency: 1 }
    )
    const queue = yield* request('/api/queue/ws', 'GET')
    const forwarded = yield* Effect.promise(() => queue.text())
    assert.equal(forwarded, 'queue')
  }).pipe(Effect.provide(api))
)
it.effect('records a match once and tracks rating peaks and streak reversals', () =>
  Effect.gen(function* () {
    const ratings = yield* memoryRatings
    const a = yield* ratings.register('A')
    const b = yield* ratings.register('B')
    const result = (matchId: string, winnerId = a.profile.playerId, loserId = b.profile.playerId) =>
      ratings.recordRankedResult({ matchId, winnerId, loserId })
    const self = yield* result('self', a.profile.playerId, a.profile.playerId)
    assert.isTrue(Option.isNone(self))
    const missing = yield* result('missing', 'unknown')
    assert.isTrue(Option.isNone(missing))
    const first = yield* result('1')
    assert.deepEqual(
      first,
      Option.some({
        winnerDelta: { before: 1000, after: 1016, delta: 16 },
        loserDelta: { before: 1000, after: 984, delta: -16 },
      })
    )
    const replay = yield* result('1')
    assert.deepEqual(replay, first)
    yield* result('2')
    const before = yield* ratings.authenticate(a.token).pipe(Effect.map(Option.getOrThrow))
    assert.equal(before.wins, 2)
    assert.equal(before.streak, 2)
    assert.equal(before.rating, before.peakRating)
    yield* result('3', b.profile.playerId, a.profile.playerId)
    const after = yield* ratings.authenticate(a.token).pipe(Effect.map(Option.getOrThrow))
    assert.equal(after.losses, 1)
    assert.equal(after.streak, -1)
    assert.equal(after.peakRating, before.rating)
    assert.isBelow(after.rating, after.peakRating)
    const other = yield* ratings.authenticate(b.token).pipe(Effect.map(Option.getOrThrow))
    assert.equal(other.streak, 1)
    assert.equal(other.losses, 2)
  }).pipe(Effect.provide(SecureRandom.layerWebCrypto))
)
const player = (id: string, rating: number, wins: number, callsign = id) => ({
  playerId: id,
  callsign,
  rating,
  peakRating: rating,
  wins,
  losses: 0,
  streak: wins,
})
it('sorts ranked profiles and includes viewers outside the top 50', () => {
  const profiles = [
    player('guest', 3000, 0),
    player('c', 1100, 2, 'Ada'),
    player('a', 1100, 2, 'Ada'),
    player('b', 1100, 2, 'Bea'),
    player('d', 1100, 3),
    ...Array.from({ length: 50 }, (_, i) => player('low' + i, 1000 - i, 1)),
  ]
  const board = buildLeaderboard({ profiles, viewerId: Option.some('low49') })
  assert.equal(board.totalPlayers, 54)
  assert.lengthOf(board.entries, 50)
  assert.deepEqual(
    Arr.map(board.entries.slice(0, 4), (e) => e.playerId),
    ['d', 'a', 'c', 'b']
  )
  assert.equal(board.viewer?.rank, 54)
  assert.equal(board.viewer?.isViewer, true)
  assert.equal(buildLeaderboard({ profiles, viewerId: Option.some('guest') }).viewer?.rank, 0)
  assert.equal(buildLeaderboard({ profiles, viewerId: Option.some('missing') }).viewer, null)
})
const entry = (id: string, rating: number, joinedAtMs: number, playerId = id) => ({
  id,
  playerId,
  rating,
  joinedAtMs,
  callsign: id,
})
it('pairs by wait time and nearest eligible rating, and skips the same player', () => {
  const a = entry('a', 1000, 0),
    b = entry('b', 1300, 1),
    c = entry('c', 1090, 2),
    d = entry('d', 910, 3)
  assert.deepEqual(selectQueuePairs([b, a], 4999).waiting, [a, b])
  assert.deepEqual(selectQueuePairs([b, a], 5000).pairs, [[a, b]])
  assert.deepEqual(selectQueuePairs([d, c, b, a], 6000).pairs[0], [a, c])
  assert.deepEqual(selectQueuePairs([a, entry('other', 1000, 0, 'a')], 30_000).pairs, [])
  assert.equal(buildQueuedStatus(a, 1, 2, 5000).window, 350)
  assert.equal(buildQueuedStatus(a, 1, 2, 20_000).window, null)
})
const ranked = createRankedRoom({
  roomId: 'ABC234',
  matchId: 'match',
  nowMs: 100,
  seed: 77,
  players: [
    { playerId: 'a', callsign: 'A', token: 'one', rating: 1000 },
    { playerId: 'b', callsign: 'B', token: 'two', rating: 1200 },
  ],
})
it.effect('enforces turn and disconnect deadlines and clears reconnect deadlines', () =>
  Effect.gen(function* () {
    assert.equal(ranked.status, 'playing')
    assert.deepEqual(nextAlarmMs(ranked), Option.some(45_100))
    assert.isFalse((yield* applyRankedAlarm(ranked, 45_099)).changed)
    const defense = {
      ...ranked,
      duel: {
        ...ranked.duel,
        phase: DuelPhase.cases.AwaitDefense.make({
          attacker: 0,
          defender: 1,
          strikeValue: 2,
          strikeCount: 1,
          isDashing: false,
        }),
      },
    }
    const first = markSeatDisconnected(ranked, 1, 100)
    const both = markSeatDisconnected(first, 0, 100)
    assert.deepEqual(nextAlarmMs(both), Option.some(20_100))
    assert.deepEqual(markSeatConnected(first, 1).disconnectDeadlines, [null, null])
    yield* Effect.forEach(
      [
        [ranked, 45_100, 'timeout', 1],
        [defense, 45_100, 'timeout', 0],
        [first, 60_000, 'disconnect', 0],
        [both, 20_100, 'disconnect', 1],
        [markSeatDisconnected(first, 0, 200), 20_200, 'disconnect', 0],
      ] as const,
      Effect.fn(function* ([room, time, reason, winner]) {
        const outcome = yield* applyRankedAlarm(room, time)
        assert.isTrue(outcome.changed)
        assert.equal(outcome.room.forfeitReason, reason)
        assert.equal(outcome.room.status, 'finished')
        assert.equal(outcome.room.seq, 1)
        assert.deepEqual(nextAlarmMs(outcome.room), Option.none())
        assert.equal(DuelPhase.guards.MatchOver(outcome.room.duel.phase) && outcome.room.duel.phase.winner, winner)
      }),
      { concurrency: 1 }
    )
  })
)
it.effect('advances ranked rounds and strips ranked data on rematch', () =>
  Effect.gen(function* () {
    const room: RoomRecord = { ...ranked, duel: { ...ranked.duel, positions: [3, 8], hands: [[5], [1]] } }
    const text = yield* S.encodeEffect(S.fromJsonString(ClientMessage))(
      command(action.Strike.make({ card: 5, count: 1 }))
    )
    const outcome = yield* handleMessage(room, Option.some(0), text, 200)
    if ('reply' in outcome) {
      throw new Error('Expected a completed round')
    }
    assert.equal(outcome.room.turnDeadlineMs, 10_200)
    const next = yield* applyRankedAlarm(outcome.room, 10_200)
    assert.equal(next.room.duel.phase._tag, 'AwaitAction')
    assert.equal(next.room.duel.round, 2)
    assert.equal(next.room.turnDeadlineMs, 55_200)
    const finished = yield* applyRankedAlarm(next.room, 55_200)
    const again = yield* update(finished.room, 0, command(action.Rematch.make({})))
    assert.equal(again.mode, 'casual')
    for (const key of [
      'matchId',
      'seatPlayerIds',
      'seatRatings',
      'ratingDeltas',
      'turnDeadlineMs',
      'disconnectDeadlines',
      'forfeitReason',
    ]) {
      assert.notProperty(again, key)
    }
    const snapshot = buildSnapshot({ room: playing, seat: Option.none(), connected: [false, false] })
    for (const key of ['mode', 'seatRatings', 'ratingDeltas', 'turnDeadlineMs', 'forfeitReason']) {
      assert.notProperty(snapshot, key)
    }
  })
)

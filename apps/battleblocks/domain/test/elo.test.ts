import { assert, it } from '@effect/vitest'
import * as Effect from 'effect/Effect'
import * as Option from 'effect/Option'
import * as Schema from 'effect/Schema'

import {
  DeviceLinkRequest,
  DeviceLinkResponse,
  DeviceSession,
  DuelEvent,
  DuelPhase,
  LeaderboardResponse,
  PlayerProfile,
  QueueClientMessage,
  QueueServerMessage,
  ServerMessage,
  canMatchRatings,
  computeEloUpdate,
  createMatch,
  forfeitMatch,
  matchmakingWindow,
  projectView,
} from '../src/index.ts'

it.each([
  [0, 19, 16, -16],
  [20, 21, 12, -12],
  [19, 20, 16, -12],
])(
  'updates equal ratings for a winner with %i games and a loser with %i games',
  (winnerGames, loserGames, gain, loss) => {
    assert.deepStrictEqual(computeEloUpdate({ winnerRating: 1000, loserRating: 1000, winnerGames, loserGames }), {
      winner: { before: 1000, after: 1000 + gain, delta: gain },
      loser: { before: 1000, after: 1000 + loss, delta: loss },
    })
  }
)

it('awards more for an upset and at least one point for a win', () => {
  const games = { winnerGames: 0, loserGames: 0 }
  const upset = computeEloUpdate({ ...games, winnerRating: 1000, loserRating: 1400 })
  const favorite = computeEloUpdate({ ...games, winnerRating: 1400, loserRating: 1000 })
  assert.strictEqual(upset.winner.delta, 29)
  assert.strictEqual(favorite.winner.delta, 3)
  const mismatch = computeEloUpdate({ ...games, winnerRating: 3000, loserRating: 1000 })
  assert.strictEqual(mismatch.winner.delta, 1)
  assert.strictEqual(mismatch.loser.delta, -1)
})

it('reports the actual loss at the rating floor', () => {
  const result = computeEloUpdate({ winnerRating: 105, loserRating: 105, winnerGames: 0, loserGames: 0 })
  assert.deepStrictEqual(result.loser, { before: 105, after: 100, delta: -5 })
})

it('widens the window at each wait threshold', () => {
  assert.deepStrictEqual(matchmakingWindow(4999), Option.some(150))
  assert.deepStrictEqual(matchmakingWindow(5000), Option.some(350))
  assert.deepStrictEqual(matchmakingWindow(11_999), Option.some(350))
  assert.deepStrictEqual(matchmakingWindow(12_000), Option.some(700))
  assert.deepStrictEqual(matchmakingWindow(19_999), Option.some(700))
  assert.deepStrictEqual(matchmakingWindow(20_000), Option.none())
})

it.each([
  [150, 0, 0, true],
  [151, 0, 0, false],
  [350, 5000, 0, true],
  [351, 5000, 0, false],
  [700, 0, 12_000, true],
  [701, 0, 12_000, false],
  [3000, 20_000, 0, true],
  [3000, 0, 20_000, true],
] satisfies Array<[number, number, number, boolean]>)(
  'matches a gap of %i with waits of %i and %i',
  (gap, waitMsA, waitMsB, matches) => {
    assert.strictEqual(canMatchRatings({ ratingA: 1000, ratingB: 1000 + gap, waitMsA, waitMsB }), matches)
  }
)

const phases = DuelPhase.cases
it.each([
  phases.AwaitAction.make({ active: 0 }),
  phases.AwaitDefense.make({ attacker: 0, defender: 1, strikeValue: 2, strikeCount: 1, isDashing: false }),
  phases.RoundOver.make({ winner: Option.some(0), nextStarter: 1, reason: 'hit' }),
])('ends a forfeited match during $_tag and preserves the first result', (phase) => {
  const state = createMatch(1)
  const ended = forfeitMatch({ ...state, score: [2, 1], phase }, 1)
  const result = phases.MatchOver.make({ winner: 1, finalScore: [2, 3] })
  assert.deepStrictEqual(ended.score, [2, 3])
  assert.deepStrictEqual(ended.phase, result)
  assert.deepStrictEqual(ended.lastEvents, [DuelEvent.cases.MatchEnded.make({ winner: 1, finalScore: [2, 3] })])
  assert.strictEqual(forfeitMatch(ended, 0), ended)
})

function checkJson<A, I>(schema: Schema.Codec<A, I>, value: A) {
  const codec = Schema.fromJsonString(schema)
  return Effect.gen(function* () {
    const encoded = yield* Schema.encodeEffect(codec)(value)
    const decoded = yield* Schema.decodeEffect(codec)(encoded)
    assert.deepStrictEqual(decoded, value)
  })
}

it.effect('round-trips profiles, device links, and leaderboard responses', () =>
  Effect.gen(function* () {
    const profile = { playerId: 'p1', callsign: 'Blue', rating: 1016, peakRating: 1032, wins: 3, losses: 1, streak: -1 }
    yield* checkJson(PlayerProfile, profile)
    yield* checkJson(DeviceLinkRequest, { code: '123456' })
    yield* checkJson(DeviceLinkResponse, { code: '123456', expiresAtMs: 300_000 })
    yield* checkJson(DeviceSession, { token: 'session', profile })
    const viewer = { ...profile, rank: 1, isViewer: true }
    yield* checkJson(LeaderboardResponse, { entries: [viewer], viewer, totalPlayers: 1 })
    yield* checkJson(LeaderboardResponse, { entries: [], viewer: null, totalPlayers: 0 })
  })
)

it.effect('round-trips all queue messages', () =>
  Effect.gen(function* () {
    const client = QueueClientMessage.cases
    const server = QueueServerMessage.cases
    yield* checkJson(QueueClientMessage, client.Ping.make({}))
    yield* checkJson(QueueClientMessage, client.Cancel.make({}))
    yield* checkJson(
      QueueServerMessage,
      server.Queued.make({ position: 1, waitingCount: 2, rating: 1000, window: null })
    )
    yield* checkJson(
      QueueServerMessage,
      server.Matched.make({ roomId: 'r1', seat: 0, token: 'join', opponentName: 'Blue', opponentRating: 1200 })
    )
    yield* checkJson(QueueServerMessage, server.Cancelled.make({}))
    yield* checkJson(QueueServerMessage, server.ErrorNotice.make({ message: 'Queue closed' }))
    yield* checkJson(QueueServerMessage, server.Pong.make({}))
  })
)

it.effect('round-trips ranked room metadata after a forfeit', () =>
  Effect.gen(function* () {
    const seat = Option.some<0>(0)
    yield* checkJson(
      ServerMessage,
      ServerMessage.cases.RoomSnapshot.make({
        roomId: 'r1',
        status: 'finished',
        seat,
        seatNames: ['Blue', 'Red'],
        connected: [true, false],
        view: projectView(forfeitMatch(createMatch(2), 0), seat),
        seq: 2,
        mode: 'ranked',
        seatRatings: [1000, 1000],
        ratingDeltas: [
          { before: 1000, after: 1016, delta: 16 },
          { before: 1000, after: 984, delta: -16 },
        ],
        turnDeadlineMs: null,
        forfeitReason: 'disconnect',
      })
    )
  })
)

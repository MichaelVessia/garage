import { assert, it } from '@effect/vitest'
import * as Effect from 'effect/Effect'
import * as Option from 'effect/Option'
import * as Schema from 'effect/Schema'

import {
  ClientMessage,
  DuelCommand,
  DuelEvent,
  DuelPhase,
  DuelState,
  MoveDirection,
  PlayerView,
  Seat,
  ServerMessage,
  TrackSpace,
  applyCommand,
  chooseBotCommand,
  createMatch,
  legalCommands,
  projectView,
} from '../src/index.ts'
import type { InvalidCommandError } from '../src/index.ts'

const command = DuelCommand.cases
const phase = DuelPhase.cases

it('shows each player only their hand, legal commands, and opposing hand count', () => {
  const state = createMatch(520)
  const differentSecrets: DuelState = {
    ...state,
    hands: [state.hands[0], [1, 1, 1, 1, 1]],
    deck: [...state.deck].reverse(),
  }
  const player = projectView(state, Option.some(0))
  assert.deepStrictEqual(player, projectView(differentSecrets, Option.some(0)))
  assert.deepStrictEqual(player.myHand, state.hands[0])
  assert.deepStrictEqual(player.legalCommands, legalCommands(state, 0))
  assert.strictEqual(player.opponentHandCount, state.hands[1].length)
  assert.notProperty(player, 'hands')
  assert.notProperty(player, 'deck')
  assert.notProperty(player, 'rngState')
  assert.notProperty(player, 'seed')
  const opponent = projectView(state, Option.some(1))
  assert.deepStrictEqual(opponent.myHand, state.hands[1])
  assert.deepStrictEqual(opponent.legalCommands, [])
  const spectator = projectView(state, Option.none())
  assert.deepStrictEqual(spectator, projectView(differentSecrets, Option.none()))
  assert.deepStrictEqual(spectator.myHand, [])
  assert.deepStrictEqual(spectator.legalCommands, [])
  assert.strictEqual(spectator.opponentHandCount, 0)
})

it.effect('round-trips saved duel state and rejects out-of-range encoded positions', () =>
  Effect.gen(function* () {
    const state: DuelState = {
      ...createMatch(142),
      positions: [6, 9],
      hands: [
        [3, 3, 3],
        [3, 3],
      ],
    }
    const ended = yield* applyCommand(state, 0, command.Strike.make({ card: 3, count: 3 }))
    const codec = Schema.fromJsonString(DuelState)
    const encoded = yield* Schema.encodeEffect(DuelState)(ended.state)
    const json: unknown = yield* Schema.encodeEffect(codec)(ended.state)
    const decoded = yield* Schema.decodeEffect(DuelState)(encoded)
    const jsonDecoded = yield* Schema.decodeUnknownEffect(codec)(json)
    assert.deepStrictEqual(decoded, ended.state)
    assert.deepStrictEqual(jsonDecoded, ended.state)
    yield* Schema.decodeEffect(DuelState)({ ...encoded, positions: [0, 18] }).pipe(Effect.flip)
    assert.isTrue(Schema.is(TrackSpace)(18))
    assert.isFalse(Schema.is(TrackSpace)(19))
    assert.isFalse(Schema.is(Seat)(2))
    assert.isTrue(Schema.is(MoveDirection)('backward'))
    assert.isTrue(Schema.is(DuelEvent)(ended.events[0]))
  })
)

it.effect('round-trips the shared WebSocket contracts for players and spectators', () =>
  Effect.gen(function* () {
    const client = ClientMessage.cases.Command.make({ command: command.Block.make({}) })
    const clientCodec = Schema.fromJsonString(ClientMessage)
    const clientJson = yield* Schema.encodeEffect(clientCodec)(client)
    const decodedClient = yield* Schema.decodeEffect(clientCodec)(clientJson)
    assert.deepStrictEqual(decodedClient, client)

    const state = createMatch(1)
    yield* Effect.forEach(
      [Option.some<Seat>(0), Option.none<Seat>()],
      (seat) =>
        Effect.gen(function* () {
          const view = projectView(state, seat)
          assert.isTrue(Schema.is(PlayerView)(view))
          const snapshot = ServerMessage.cases.RoomSnapshot.make({
            roomId: 'room',
            status: 'playing',
            seat,
            seatNames: ['One', 'Two'],
            connected: [true, false],
            view,
            seq: 4,
          })
          const serverCodec = Schema.fromJsonString(ServerMessage)
          const serverJson = yield* Schema.encodeEffect(serverCodec)(snapshot)
          const decodedServer = yield* Schema.decodeEffect(serverCodec)(serverJson)
          assert.deepStrictEqual(decodedServer, snapshot)
        }),
      { concurrency: 1, discard: true }
    )
  })
)

it('uses public card counts for attacks and has the same choice with different unseen hands', () => {
  const state: DuelState = {
    ...createMatch(8),
    positions: [4, 7],
    hands: [
      [3, 3, 1, 4, 5],
      [1, 2, 4],
    ],
    discard: [3, 3],
  }
  const strike = Option.some(command.Strike.make({ card: 3, count: 2 }))
  assert.deepStrictEqual(chooseBotCommand(state, 0), strike)
  assert.deepStrictEqual(chooseBotCommand({ ...state, hands: [state.hands[0], [3, 5, 5]], deck: [4, 5] }, 0), strike)
  assert.deepStrictEqual(chooseBotCommand(state, 1), Option.none())
})

it('moves into range and pushes to the wall when it can keep cards for the new distance', () => {
  const match = createMatch(8)
  const approach: DuelState = { ...match, hands: [[1, 2, 3, 4, 5], match.hands[1]] }
  assert.deepStrictEqual(
    chooseBotCommand(approach, 0),
    Option.some(command.Move.make({ card: 5, direction: 'forward' }))
  )
  const pressure: DuelState = { ...match, positions: [16, 17], hands: [[2, 2, 2, 3, 4], match.hands[1]] }
  assert.deepStrictEqual(chooseBotCommand(pressure, 0), Option.some(command.Push.make({ card: 3 })))
})

it('prefers a block with cards to spare and retreats when a block would leave too few', () => {
  const defending: DuelState = {
    ...createMatch(8),
    positions: [8, 11],
    hands: [
      [1, 2, 3],
      [3, 3, 4, 5],
    ],
    phase: phase.AwaitDefense.make({ attacker: 0, defender: 1, strikeValue: 3, strikeCount: 2, isDashing: true }),
  }
  assert.deepStrictEqual(chooseBotCommand(defending, 1), Option.some(command.Block.make({})))
  assert.deepStrictEqual(
    chooseBotCommand(
      {
        ...defending,
        hands: [
          [1, 2, 3],
          [3, 3, 4],
        ],
      },
      1
    ),
    Option.some(command.Retreat.make({ card: 4 }))
  )
  assert.deepStrictEqual(
    chooseBotCommand(
      {
        ...defending,
        hands: [
          [1, 2, 3],
          [4, 5],
        ],
      },
      1
    ),
    Option.some(command.Retreat.make({ card: 5 }))
  )
})

function playBothSides(state: DuelState, remaining: number): Effect.Effect<DuelState, InvalidCommandError> {
  if (DuelPhase.guards.MatchOver(state.phase)) {
    return Effect.succeed(state)
  }
  if (remaining <= 0) {
    return Effect.die('The bots did not complete the match.')
  }
  const seat = DuelPhase.match(state.phase, {
    AwaitAction: ({ active }) => active,
    AwaitDefense: ({ defender }) => defender,
    RoundOver: ({ nextStarter }) => nextStarter,
    MatchOver: ({ winner }) => winner,
  })
  return Option.match(chooseBotCommand(state, seat), {
    onNone: () => Effect.die('The active bot has no command.'),
    onSome: (choice) =>
      applyCommand(state, seat, choice).pipe(Effect.flatMap(({ state: next }) => playBothSides(next, remaining - 1))),
  })
}

it.effect('completes full bot matches without an illegal command', () =>
  Effect.forEach(
    [0, 1, 21, 142, 520],
    (seed) =>
      playBothSides(createMatch(seed), 1000).pipe(
        Effect.tap((state) =>
          Effect.sync(() => {
            assert.isTrue(DuelPhase.guards.MatchOver(state.phase))
            assert.strictEqual(Math.max(...state.score), 3)
          })
        )
      ),
    { concurrency: 1, discard: true }
  )
)

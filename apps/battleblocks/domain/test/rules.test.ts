import { assert, it } from '@effect/vitest'
import * as Arr from 'effect/Array'
import * as Effect from 'effect/Effect'
import * as Option from 'effect/Option'
import * as Schema from 'effect/Schema'

import {
  CardValue,
  DuelCommand,
  DuelEvent,
  DuelPhase,
  HAND_LIMIT,
  InvalidCommandError,
  MAX_RESHUFFLES,
  ROUNDS_TO_WIN,
  TRACK_MAX,
  TRACK_MIN,
  applyCommand,
  createMatch,
  distanceBetween,
  legalCommands,
} from '../src/index.ts'
import type { DuelState, Seat } from '../src/index.ts'

const command = DuelCommand.cases
const event = DuelEvent.cases
const phase = DuelPhase.cases

function setup(
  positions: DuelState['positions'],
  hands: DuelState['hands'],
  options: Partial<DuelState> = {}
): DuelState {
  return { ...createMatch(142), positions, hands, ...options }
}

it('deals the full deterministic deck and honors the starting seat', () => {
  const initial = createMatch(142, 1)
  const cards = [...initial.hands[0], ...initial.hands[1], ...initial.deck]
  assert.lengthOf(cards, 25)
  for (const value of CardValue.literals) {
    assert.strictEqual(
      Arr.countBy(cards, (card) => card === value),
      5
    )
  }
  assert.lengthOf(initial.hands[0], HAND_LIMIT)
  assert.lengthOf(initial.hands[1], HAND_LIMIT)
  assert.deepStrictEqual(initial.positions, [TRACK_MIN, TRACK_MAX])
  assert.strictEqual(distanceBetween(initial.positions), 17)
  assert.strictEqual(initial.reshufflesRemaining, MAX_RESHUFFLES)
  assert.deepStrictEqual(initial.phase, phase.AwaitAction.make({ active: 1 }))
  assert.deepStrictEqual(initial.lastEvents, [event.RoundStarted.make({ round: 1, starter: 1 })])
  assert.deepStrictEqual(initial, createMatch(142, 1))
  assert.notDeepEqual(initial.deck, createMatch(143, 1).deck)
})

it.effect('moves exactly and rejects the wrong seat, crossing, landing, and moving off the track', () =>
  Effect.gen(function* () {
    const state = setup([2, 5], [[2, 3, 4], [2]])
    const forward = command.Move.make({ card: 2, direction: 'forward' })
    const wrongSeat = yield* applyCommand(state, 1, forward).pipe(Effect.flip)
    assert.isTrue(Schema.is(InvalidCommandError)(wrongSeat))
    const illegalMoves = [
      command.Move.make({ card: 3, direction: 'forward' }),
      command.Move.make({ card: 4, direction: 'forward' }),
      command.Move.make({ card: 2, direction: 'backward' }),
      command.Move.make({ card: 1, direction: 'forward' }),
    ]
    yield* Effect.forEach(illegalMoves, (move) => applyCommand(state, 0, move).pipe(Effect.flip), {
      concurrency: 1,
      discard: true,
    })
    assert.deepStrictEqual(legalCommands(state, 1), [])

    const moved = yield* applyCommand(state, 0, forward)
    assert.deepStrictEqual(moved.state.positions, [4, 5])
    assert.deepStrictEqual(moved.events, [event.Moved.make({ seat: 0, card: 2, from: 2, to: 4 })])
    assert.lengthOf(moved.state.hands[0], HAND_LIMIT)
    assert.deepStrictEqual(moved.state.hands[1], [2])
    assert.strictEqual(moved.state.turnNumber, 2)

    const opposite = yield* applyCommand(moved.state, 1, command.Move.make({ card: 2, direction: 'backward' }))
    assert.deepStrictEqual(opposite.state.positions, [4, 7])
    assert.deepStrictEqual(state.positions, [2, 5])
  })
)

it.effect('pushes only from adjacent spaces and allows a push against the wall', () =>
  Effect.gen(function* () {
    const push = command.Push.make({ card: 5 })
    yield* applyCommand(setup([14, 17], [[5], [1]]), 0, push).pipe(Effect.flip)
    const pushed = yield* applyCommand(setup([16, 17], [[5], [1]]), 0, push)
    assert.deepStrictEqual(pushed.state.positions, [16, 18])
    assert.deepStrictEqual(pushed.events, [event.Pushed.make({ seat: 0, opponent: 1, card: 5, from: 17, to: 18 })])
    const wall = yield* applyCommand(setup([17, 18], [[5], [1]]), 0, push)
    assert.deepStrictEqual(wall.events, [event.Pushed.make({ seat: 0, opponent: 1, card: 5, from: 18, to: 18 })])
    assert.deepStrictEqual(wall.state.discard, [5])
    const left = yield* applyCommand(
      setup([2, 3], [[1], [5]], { phase: phase.AwaitAction.make({ active: 1 }) }),
      1,
      push
    )
    assert.deepStrictEqual(left.state.positions, [1, 3])
  })
)

it.effect('offers every strike strength and blocks with the exact matching count', () =>
  Effect.gen(function* () {
    const state = setup(
      [6, 9],
      [
        [3, 1, 3, 5, 4],
        [3, 2, 3, 5, 1],
      ]
    )
    const single = command.Strike.make({ card: 3, count: 1 })
    const double = command.Strike.make({ card: 3, count: 2 })
    assert.deepStrictEqual(Arr.filter(legalCommands(state, 0), DuelCommand.guards.Strike), [single, double])
    yield* applyCommand(state, 0, command.Strike.make({ card: 3, count: 0 })).pipe(Effect.flip)
    yield* applyCommand(state, 0, command.Strike.make({ card: 3, count: 3 })).pipe(Effect.flip)
    yield* applyCommand(state, 0, command.Strike.make({ card: 4, count: 1 })).pipe(Effect.flip)

    const attack = yield* applyCommand(state, 0, double)
    assert.deepStrictEqual(attack.state.hands[0], [1, 5, 4])
    assert.deepStrictEqual(
      attack.state.phase,
      phase.AwaitDefense.make({
        attacker: 0,
        defender: 1,
        strikeValue: 3,
        strikeCount: 2,
        isDashing: false,
      })
    )
    assert.deepStrictEqual(legalCommands(attack.state, 0), [])
    assert.deepStrictEqual(legalCommands(attack.state, 1), [command.Block.make({}), command.TakeHit.make({})])
    yield* applyCommand(attack.state, 1, command.Retreat.make({ card: 5 })).pipe(Effect.flip)

    const blocked = yield* applyCommand(attack.state, 1, command.Block.make({}))
    assert.deepStrictEqual(blocked.state.discard, [3, 3, 3, 3])
    assert.deepStrictEqual(blocked.state.hands[1], [2, 5, 1])
    assert.lengthOf(blocked.state.hands[0], HAND_LIMIT)
    assert.deepStrictEqual(blocked.state.phase, phase.AwaitAction.make({ active: 1 }))
    assert.deepStrictEqual(blocked.events, [event.Blocked.make({ defender: 1, strikeValue: 3, strikeCount: 2 })])

    const yielded = yield* applyCommand(attack.state, 1, command.TakeHit.make({}))
    assert.deepStrictEqual(yielded.state.score, [1, 0])
  })
)

it.effect('lands an unblockable triple strike in the same command', () =>
  Effect.gen(function* () {
    const state = setup(
      [6, 9],
      [
        [3, 3, 3, 5, 4],
        [3, 2, 3, 5, 1],
      ]
    )
    const result = yield* applyCommand(state, 0, command.Strike.make({ card: 3, count: 3 }))
    assert.deepStrictEqual(result.events, [
      event.Struck.make({ attacker: 0, defender: 1, strikeValue: 3, strikeCount: 3, isDashing: false }),
      event.HitLanded.make({ attacker: 0, defender: 1 }),
      event.RoundEnded.make({ winner: Option.some(0), reason: 'hit', score: [1, 0] }),
    ])
    assert.deepStrictEqual(
      result.state.phase,
      phase.RoundOver.make({ winner: Option.some(0), reason: 'hit', nextStarter: 1 })
    )
    assert.deepStrictEqual(result.state.deck, state.deck)
  })
)

it.effect('counts a same-value dash separately and automatically recovers after retreat', () =>
  Effect.gen(function* () {
    const dash = command.DashingStrike.make({ dashCard: 2, strikeCard: 2, strikeCount: 2 })
    const state = setup(
      [13, 17],
      [
        [2, 2, 2, 3, 4],
        [2, 2, 3, 4, 5],
      ]
    )
    yield* applyCommand({ ...state, hands: [[2, 2, 1, 3, 4], state.hands[1]] }, 0, dash).pipe(Effect.flip)
    yield* applyCommand(state, 0, command.DashingStrike.make({ dashCard: 4, strikeCard: 2, strikeCount: 1 })).pipe(
      Effect.flip
    )

    const attacked = yield* applyCommand(state, 0, dash)
    assert.deepStrictEqual(attacked.state.positions, [15, 17])
    assert.deepStrictEqual(attacked.state.discard, [2, 2, 2])
    assert.deepStrictEqual(attacked.events, [
      event.Dashed.make({ seat: 0, card: 2, from: 13, to: 15 }),
      event.Struck.make({ attacker: 0, defender: 1, strikeValue: 2, strikeCount: 2, isDashing: true }),
    ])
    assert.includeDeepMembers(
      [...legalCommands(attacked.state, 1)],
      [command.Block.make({}), command.Retreat.make({ card: 5 })]
    )
    const blocked = yield* applyCommand(attacked.state, 1, command.Block.make({}))
    assert.deepStrictEqual(blocked.events, [
      event.Blocked.make({ defender: 1, strikeValue: 2, strikeCount: 2 }),
      event.Recovered.make({ seat: 1 }),
    ])
    assert.lengthOf(blocked.state.hands[1], HAND_LIMIT)
    assert.deepStrictEqual(blocked.state.phase, phase.AwaitAction.make({ active: 0 }))

    const retreated = yield* applyCommand(attacked.state, 1, command.Retreat.make({ card: 5 }))
    assert.deepStrictEqual(retreated.state.positions, [15, 18])
    assert.lengthOf(retreated.state.hands[0], HAND_LIMIT)
    assert.lengthOf(retreated.state.hands[1], HAND_LIMIT)
    assert.deepStrictEqual(retreated.events, [
      event.Retreated.make({ seat: 1, card: 5, from: 17, to: 18 }),
      event.Recovered.make({ seat: 1 }),
    ])
    assert.deepStrictEqual(retreated.state.phase, phase.AwaitAction.make({ active: 0 }))
    assert.strictEqual(retreated.state.turnNumber, state.turnNumber + 2)
  })
)

it.effect('disallows retreat at the wall and lands a dash if the defender there cannot block', () =>
  Effect.gen(function* () {
    const dash = command.DashingStrike.make({ dashCard: 2, strikeCard: 1, strikeCount: 1 })
    const state = setup(
      [15, 18],
      [
        [2, 1],
        [1, 3],
      ]
    )
    const defended = yield* applyCommand(state, 0, dash)
    yield* applyCommand(defended.state, 1, command.Retreat.make({ card: 3 })).pipe(Effect.flip)
    assert.deepStrictEqual(legalCommands(defended.state, 1), [command.Block.make({}), command.TakeHit.make({})])
    const hit = yield* applyCommand({ ...state, hands: [[2, 1], [3]] }, 0, dash)
    assert.strictEqual(hit.state.score[0], 1)
    assert.includeDeepMembers([...hit.events], [event.HitLanded.make({ attacker: 0, defender: 1 })])
  })
)

it.effect('reshuffles twice and ends on position even if the last card fills the hand', () =>
  Effect.gen(function* () {
    const move = command.Move.make({ card: 1, direction: 'forward' })
    const ready = setup(
      [8, 16],
      [
        [1, 2, 3, 4, 5],
        [1, 2, 3, 4, 5],
      ],
      { deck: [], discard: [1] }
    )
    const first = yield* applyCommand(ready, 0, move)
    assert.deepStrictEqual(first.events, [
      event.Moved.make({ seat: 0, card: 1, from: 8, to: 9 }),
      event.DeckReshuffled.make({ reshufflesRemaining: 1 }),
    ])
    assert.deepStrictEqual(first.state.deck, [1])
    assert.deepStrictEqual(first.state.discard, [])
    assert.notStrictEqual(first.state.rngState, ready.rngState)
    const second = yield* applyCommand(first.state, 1, move)
    assert.deepStrictEqual(second.state.deck, [])
    assert.strictEqual(second.state.reshufflesRemaining, 1)
    const third = yield* applyCommand(second.state, 0, move)
    assert.includeDeepMembers([...third.events], [event.DeckReshuffled.make({ reshufflesRemaining: 0 })])
    assert.deepStrictEqual(third.state.deck, [1])
    const last = yield* applyCommand(third.state, 1, move)
    assert.lengthOf(last.state.hands[1], HAND_LIMIT)
    assert.deepStrictEqual(
      last.state.phase,
      phase.RoundOver.make({
        winner: Option.some(0),
        reason: 'time-over-position',
        nextStarter: 1,
      })
    )
    assert.deepStrictEqual(last.state.score, [1, 0])
  })
)

it.effect('ties on equal progress and alternates the round starter', () =>
  Effect.gen(function* () {
    const state = setup([5, 13], [[1], [3]], {
      deck: [5],
      reshufflesRemaining: 0,
      turnNumber: 2,
    })
    const result = yield* applyCommand(state, 0, command.Move.make({ card: 1, direction: 'forward' }))
    assert.deepStrictEqual(result.state.positions, [6, 13])
    assert.deepStrictEqual(
      result.state.phase,
      phase.RoundOver.make({
        winner: Option.none(),
        reason: 'time-over-draw',
        nextStarter: 0,
      })
    )
    assert.deepStrictEqual(result.state.score, [0, 0])
    const next = yield* applyCommand(result.state, 0, command.StartNextRound.make({}))
    assert.deepStrictEqual(next.state.phase, phase.AwaitAction.make({ active: 0 }))
  })
)

it.effect('automatically recovers a defender who blocks with their last cards', () =>
  Effect.gen(function* () {
    const state = setup(
      [6, 9],
      [
        [3, 3],
        [3, 3],
      ]
    )
    const attack = yield* applyCommand(state, 0, command.Strike.make({ card: 3, count: 2 }))
    const blocked = yield* applyCommand(attack.state, 1, command.Block.make({}))
    assert.deepStrictEqual(blocked.events, [
      event.Blocked.make({ defender: 1, strikeValue: 3, strikeCount: 2 }),
      event.Recovered.make({ seat: 1 }),
    ])
    assert.lengthOf(blocked.state.hands[1], HAND_LIMIT)
    assert.deepStrictEqual(blocked.state.phase, phase.AwaitAction.make({ active: 0 }))
  })
)

it.effect('recovers both players when the attacker has no action after a retreat', () =>
  Effect.gen(function* () {
    const state = setup(
      [1, 4],
      [
        [1, 2, 4, 5, 5],
        [1, 2, 3, 3, 4],
      ],
      { deck: [4, 5, 2, 1, 3] }
    )
    const attack = yield* applyCommand(
      state,
      0,
      command.DashingStrike.make({ dashCard: 1, strikeCard: 2, strikeCount: 1 })
    )
    const retreated = yield* applyCommand(attack.state, 1, command.Retreat.make({ card: 1 }))
    assert.deepStrictEqual(retreated.events, [
      event.Retreated.make({ seat: 1, card: 1, from: 4, to: 5 }),
      event.Recovered.make({ seat: 1 }),
      event.Recovered.make({ seat: 0 }),
    ])
    assert.deepStrictEqual(retreated.state.phase, phase.AwaitAction.make({ active: 1 }))
    assert.strictEqual(retreated.state.turnNumber, state.turnNumber + 3)
  })
)

it.effect('cycles the first card when a cornered player has a full unplayable hand', () =>
  Effect.gen(function* () {
    const state = setup(
      [14, 18],
      [
        [2, 1, 2, 3, 4],
        [3, 4, 4, 5, 5],
      ],
      { deck: [1, 2, 3] }
    )
    const moved = yield* applyCommand(state, 0, command.Move.make({ card: 2, direction: 'forward' }))
    assert.deepStrictEqual(moved.events, [
      event.Moved.make({ seat: 0, card: 2, from: 14, to: 16 }),
      event.Recovered.make({ seat: 1 }),
    ])
    assert.deepStrictEqual(moved.state.hands[1], [4, 4, 5, 5, 2])
    assert.deepStrictEqual(moved.state.discard, [2, 3])
    assert.deepStrictEqual(moved.state.phase, phase.AwaitAction.make({ active: 0 }))
  })
)

it.effect('wins a five-round match, starts each next round with the loser, and resets for a rematch', () =>
  Effect.gen(function* () {
    const winRound = (state: DuelState, seat: Seat) =>
      applyCommand(
        {
          ...state,
          positions: [7, 10],
          hands: seat === 0 ? [[3], [1]] : [[1], [3]],
        },
        seat,
        command.Strike.make({ card: 3, count: 1 })
      )
    const nextRound = command.StartNextRound.make({})
    const first = yield* winRound(createMatch(8), 0)
    const secondStart = yield* applyCommand(first.state, 1, nextRound)
    assert.deepStrictEqual(secondStart.state.positions, [TRACK_MIN, TRACK_MAX])
    assert.deepStrictEqual(secondStart.state.phase, phase.AwaitAction.make({ active: 1 }))
    assert.deepStrictEqual(secondStart.events, [event.RoundStarted.make({ round: 2, starter: 1 })])
    assert.notStrictEqual(first.state.rngState, secondStart.state.rngState)
    const second = yield* winRound(secondStart.state, 1)
    const thirdStart = yield* applyCommand(second.state, 0, nextRound)
    const third = yield* winRound(thirdStart.state, 0)
    const fourthStart = yield* applyCommand(third.state, 1, nextRound)
    const fourth = yield* winRound(fourthStart.state, 1)
    const fifthStart = yield* applyCommand(fourth.state, 0, nextRound)
    const fifth = yield* winRound(fifthStart.state, 0)
    assert.strictEqual(fifth.state.round, 5)
    assert.deepStrictEqual(fifth.state.phase, phase.MatchOver.make({ winner: 0, finalScore: [ROUNDS_TO_WIN, 2] }))
    assert.includeDeepMembers([...fifth.events], [event.MatchEnded.make({ winner: 0, finalScore: [3, 2] })])
    yield* applyCommand(fifth.state, 0, nextRound).pipe(Effect.flip)
    const rematch = yield* applyCommand(fifth.state, 1, command.Rematch.make({}))
    assert.strictEqual(rematch.state.round, 1)
    assert.deepStrictEqual(rematch.state.score, [0, 0])
    assert.deepStrictEqual(rematch.state.phase, phase.AwaitAction.make({ active: 1 }))
    assert.strictEqual(rematch.state.seed, fifth.state.seed)
    assert.notStrictEqual(rematch.state.rngState, fifth.state.rngState)
  })
)

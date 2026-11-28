import * as Arr from 'effect/Array'
import * as Effect from 'effect/Effect'
import * as Function from 'effect/Function'
import * as Option from 'effect/Option'
import * as Schema from 'effect/Schema'

import { InvalidCommandError } from './errors.ts'
import {
  CardValue,
  DuelCommand,
  DuelEvent,
  DuelPhase,
  HAND_LIMIT,
  MAX_RESHUFFLES,
  ROUNDS_TO_WIN,
  TRACK_MAX,
  TRACK_MIN,
} from './model.ts'
import type { DuelState, MoveDirection, PlayerView, Seat, TrackSpace } from './model.ts'

const commandCases = DuelCommand.cases
const eventCases = DuelEvent.cases
const phaseCases = DuelPhase.cases
const sameCommand = Schema.toEquivalence(DuelCommand)
const roundDeck = Arr.flatMap(CardValue.literals, (card) => Arr.replicate(card, 5))

function randomStep(state: number): readonly [number, number] {
  const next = (state + 0x6d_2b_79_f5) >>> 0
  const mixed = Math.imul(next ^ (next >>> 15), next | 1)
  const value = mixed ^ (mixed + Math.imul(mixed ^ (mixed >>> 7), mixed | 61))
  return [next, ((value ^ (value >>> 14)) >>> 0) / 2 ** 32]
}

function shuffle(cards: ReadonlyArray<CardValue>, rngState: number): readonly [number, ReadonlyArray<CardValue>] {
  // Each Fisher-Yates step fixes one more card at the end of the deck.
  return Arr.reduceRight(
    cards,
    [rngState, cards] satisfies readonly [number, ReadonlyArray<CardValue>],
    ([state, deck], _, index): readonly [number, ReadonlyArray<CardValue>] => {
      if (index === 0) {
        return [state, deck]
      }
      const [next, roll] = randomStep(state)
      const pick = Math.floor(roll * (index + 1))
      const last = Arr.getUnsafe(deck, index)
      const chosen = Arr.getUnsafe(deck, pick)
      return [next, Arr.map(deck, (card, i) => (i === index ? chosen : i === pick ? last : card))]
    }
  )
}

function startRound(
  seed: number,
  rngState: number,
  round: number,
  score: DuelState['score'],
  starter: Seat
): DuelState {
  const [next, cards] = shuffle(roundDeck, rngState)
  return {
    seed,
    rngState: next,
    round,
    score,
    positions: [TRACK_MIN, TRACK_MAX],
    hands: [cards.slice(0, HAND_LIMIT), cards.slice(HAND_LIMIT, 2 * HAND_LIMIT)],
    deck: cards.slice(2 * HAND_LIMIT),
    discard: [],
    reshufflesRemaining: MAX_RESHUFFLES,
    phase: phaseCases.AwaitAction.make({ active: starter }),
    turnNumber: 1,
    lastEvents: [eventCases.RoundStarted.make({ round, starter })],
  }
}

// @effect-diagnostics-next-line missingPipeableSignature:off -- A seed alone starts a match with the default seat.
export const createMatch = (seed: number, startingSeat: Seat = 0): DuelState =>
  startRound(seed, seed >>> 0, 1, [0, 0], startingSeat)

export function distanceBetween(positions: DuelState['positions']): number {
  return Math.abs(positions[1] - positions[0])
}

function opponentOf(seat: Seat): Seat {
  return seat === 0 ? 1 : 0
}

function setSeat<A>(pair: readonly [A, A], seat: Seat, value: A): readonly [A, A] {
  return seat === 0 ? [value, pair[1]] : [pair[0], value]
}

function moveTarget(position: TrackSpace, seat: Seat, card: CardValue, direction: MoveDirection): TrackSpace {
  return (seat === 0) === (direction === 'forward') ? position + card : position - card
}

function canMove(positions: DuelState['positions'], seat: Seat, target: TrackSpace): boolean {
  return seat === 0 ? target >= TRACK_MIN && target < positions[1] : target <= TRACK_MAX && target > positions[0]
}

function backEdge(seat: Seat): TrackSpace {
  return seat === 0 ? TRACK_MIN : TRACK_MAX
}

function backwardClamped(position: TrackSpace, seat: Seat, card: CardValue): TrackSpace {
  return seat === 0 ? Math.max(TRACK_MIN, position - card) : Math.min(TRACK_MAX, position + card)
}

function copiesOf(hand: ReadonlyArray<CardValue>, card: CardValue): number {
  return Arr.countBy(hand, (value) => value === card)
}

function actionCommands(state: DuelState, seat: Seat): ReadonlyArray<DuelCommand> {
  const { positions } = state
  const hand = state.hands[seat]
  const distance = distanceBetween(positions)
  const cards = Arr.dedupe(hand)
  const moves = Arr.flatMap(cards, (card) =>
    Function.pipe(
      moveDirections,
      Arr.filter((direction) => canMove(positions, seat, moveTarget(positions[seat], seat, card, direction))),
      Arr.map((direction) => commandCases.Move.make({ card, direction }))
    )
  )
  const pushes = distance === 1 ? Arr.map(cards, (card) => commandCases.Push.make({ card })) : []
  const strikes = Function.pipe(
    cards,
    Arr.filter((card) => card === distance),
    Arr.flatMap((card) =>
      Arr.makeBy(copiesOf(hand, card), (index) => commandCases.Strike.make({ card, count: index + 1 }))
    )
  )
  const dashingStrikes = Arr.flatMap(cards, (dashCard) =>
    Function.pipe(
      cards,
      Arr.filter((strikeCard) => strikeCard === distance - dashCard),
      Arr.flatMap((strikeCard) =>
        Array.from({ length: copiesOf(hand, strikeCard) - Number(dashCard === strikeCard) }, (_, index) =>
          commandCases.DashingStrike.make({ dashCard, strikeCard, strikeCount: index + 1 })
        )
      )
    )
  )
  return [...moves, ...pushes, ...strikes, ...dashingStrikes]
}

const moveDirections: ReadonlyArray<MoveDirection> = ['forward', 'backward']

function defenses(state: DuelState, phase: typeof phaseCases.AwaitDefense.Type): ReadonlyArray<DuelCommand> {
  const hand = state.hands[phase.defender]
  const blocks = copiesOf(hand, phase.strikeValue) >= phase.strikeCount ? [commandCases.Block.make({})] : []
  const retreats =
    phase.isDashing && state.positions[phase.defender] !== backEdge(phase.defender)
      ? Arr.map(Arr.dedupe(hand), (card) => commandCases.Retreat.make({ card }))
      : []
  return [...blocks, ...retreats]
}

export const legalCommands: {
  (seat: Seat): (state: DuelState) => ReadonlyArray<DuelCommand>
  (state: DuelState, seat: Seat): ReadonlyArray<DuelCommand>
} = Function.dual(2, (state: DuelState, seat: Seat): ReadonlyArray<DuelCommand> =>
  DuelPhase.match(state.phase, {
    AwaitAction: ({ active }) => (seat === active ? actionCommands(state, seat) : []),
    AwaitDefense: (phase) =>
      seat === phase.defender ? [...defenses(state, phase), commandCases.TakeHit.make({})] : [],
    RoundOver: () => [commandCases.StartNextRound.make({})],
    MatchOver: () => [commandCases.Rematch.make({})],
  })
)

function spend(state: DuelState, seat: Seat, card: CardValue, count = 1): DuelState {
  const hand = state.hands[seat]
  const spentCards = Arr.replicate(card, count)
  const kept = Arr.reduce(spentCards, hand, (remaining, spent) =>
    Arr.findFirstIndex(remaining, (value) => value === spent).pipe(
      Option.map((index) => Arr.remove(remaining, index)),
      Option.getOrElse(() => remaining)
    )
  )
  return {
    ...state,
    hands: setSeat(state.hands, seat, kept),
    discard: [...state.discard, ...spentCards],
  }
}

function record(state: DuelState, event: DuelEvent): DuelState {
  return { ...state, lastEvents: [...state.lastEvents, event] }
}

export const forfeitMatch: {
  (winner: Seat): (state: DuelState) => DuelState
  (state: DuelState, winner: Seat): DuelState
} = Function.dual(2, (state: DuelState, winner: Seat): DuelState => {
  if (DuelPhase.guards.MatchOver(state.phase)) {
    return state
  }
  const finalScore = setSeat(state.score, winner, Math.max(ROUNDS_TO_WIN, state.score[winner]))
  const result = { winner, finalScore }
  return {
    ...state,
    score: finalScore,
    phase: phaseCases.MatchOver.make(result),
    lastEvents: [eventCases.MatchEnded.make(result)],
  }
})

function endRound(
  state: DuelState,
  winner: Option.Option<Seat>,
  reason: (typeof phaseCases.RoundOver.Type)['reason'],
  nextStarter: Seat
): DuelState {
  const score = Option.match(winner, {
    onNone: () => state.score,
    onSome: (seat) => setSeat(state.score, seat, state.score[seat] + 1),
  })
  const ended = record({ ...state, score }, eventCases.RoundEnded.make({ winner, reason, score }))
  if (Option.isSome(winner) && score[winner.value] >= ROUNDS_TO_WIN) {
    const result = { winner: winner.value, finalScore: score }
    return record({ ...ended, phase: phaseCases.MatchOver.make(result) }, eventCases.MatchEnded.make(result))
  }
  return { ...ended, phase: phaseCases.RoundOver.make({ winner, reason, nextStarter }) }
}

function timeOver(state: DuelState, active: Seat): DuelState {
  const [left, right] = state.positions
  const progress = left - TRACK_MIN - (TRACK_MAX - right)
  if (progress === 0) {
    const nextStarter = state.turnNumber % 2 === 1 ? opponentOf(active) : active
    return endRound(state, Option.none(), 'time-over-draw', nextStarter)
  }
  const winner = progress > 0 ? 0 : 1
  return endRound(state, Option.some(winner), 'time-over-position', opponentOf(winner))
}

function refill(state: DuelState, seat: Seat): DuelState {
  const hand = state.hands[seat]
  if (state.deck.length === 0 && state.reshufflesRemaining === 0) {
    return timeOver(state, seat)
  }
  if (hand.length >= HAND_LIMIT) {
    return state
  }

  const [card, ...deck] = state.deck
  if (card === undefined) {
    if (state.discard.length === 0) {
      return timeOver(state, seat)
    }
    const [rngState, reshuffled] = shuffle(state.discard, state.rngState)
    const reshufflesRemaining = state.reshufflesRemaining - 1
    return refill(
      record(
        { ...state, rngState, deck: reshuffled, discard: [], reshufflesRemaining },
        eventCases.DeckReshuffled.make({ reshufflesRemaining })
      ),
      seat
    )
  }

  return refill({ ...state, deck, hands: setSeat(state.hands, seat, [...hand, card]) }, seat)
}

function resolveNextTurn(current: DuelState, nextSeat: Seat, forceRecover: boolean): DuelState {
  const next = { ...current, turnNumber: current.turnNumber + 1 }
  if (forceRecover === false && actionCommands(current, nextSeat).length > 0) {
    return { ...next, phase: phaseCases.AwaitAction.make({ active: nextSeat }) }
  }
  const hand = current.hands[nextSeat]
  const cycled =
    forceRecover === false && hand.length >= HAND_LIMIT ? spend(next, nextSeat, Arr.getUnsafe(hand, 0)) : next
  const recovered = record(cycled, eventCases.Recovered.make({ seat: nextSeat }))
  return finishTurn(recovered, nextSeat)
}

function finishTurn(state: DuelState, seat: Seat, skipOpponent = false): DuelState {
  const drawn = refill(state, seat)
  return DuelPhase.isAnyOf(['RoundOver', 'MatchOver'])(drawn.phase)
    ? drawn
    : resolveNextTurn(drawn, opponentOf(seat), skipOpponent)
}

function landHit(state: DuelState, attacker: Seat, defender: Seat): DuelState {
  return endRound(
    record(state, eventCases.HitLanded.make({ attacker, defender })),
    Option.some(attacker),
    'hit',
    defender
  )
}

function strike(
  state: DuelState,
  attacker: Seat,
  strikeValue: CardValue,
  strikeCount: number,
  isDashing: boolean
): DuelState {
  const defender = opponentOf(attacker)
  const attack = { attacker, defender, strikeValue, strikeCount, isDashing }
  const spent = record(spend(state, attacker, strikeValue, strikeCount), eventCases.Struck.make(attack))
  const phase = phaseCases.AwaitDefense.make(attack)
  return defenses(spent, phase).length === 0 ? landHit(spent, attacker, defender) : { ...spent, phase }
}

function defend(
  state: DuelState,
  command: typeof commandCases.Retreat.Type | typeof commandCases.Block.Type | typeof commandCases.TakeHit.Type
): DuelState {
  const phase = state.phase
  if (DuelPhase.guards.AwaitDefense(phase)) {
    const { attacker, defender, strikeValue, strikeCount } = phase
    if (DuelCommand.guards.Block(command)) {
      const blocked = record(
        spend(state, defender, strikeValue, strikeCount),
        eventCases.Blocked.make({ defender, strikeValue, strikeCount })
      )
      return finishTurn(blocked, attacker)
    }
    if (DuelCommand.guards.Retreat(command)) {
      const { card } = command
      const from = state.positions[defender]
      const to = backwardClamped(from, defender, card)
      const retreated = record(
        { ...spend(state, defender, card), positions: setSeat(state.positions, defender, to) },
        eventCases.Retreated.make({ seat: defender, card, from, to })
      )
      return finishTurn(retreated, attacker, true)
    }
    return landHit(state, attacker, defender)
  }
  return state
}

function transition(state: DuelState, seat: Seat, command: DuelCommand): DuelState {
  const { positions } = state
  const from = positions[seat]
  return DuelCommand.match(command, {
    Move: ({ card, direction }) => {
      const to = moveTarget(from, seat, card, direction)
      const moved = record(
        { ...spend(state, seat, card), positions: setSeat(positions, seat, to) },
        eventCases.Moved.make({ seat, card, from, to })
      )
      return finishTurn(moved, seat)
    },
    Push: ({ card }) => {
      const opponent = opponentOf(seat)
      const origin = positions[opponent]
      const to = backwardClamped(origin, opponent, card)
      const pushed = record(
        { ...spend(state, seat, card), positions: setSeat(positions, opponent, to) },
        eventCases.Pushed.make({ seat, opponent, card, from: origin, to })
      )
      return finishTurn(pushed, seat)
    },
    Strike: ({ card, count }) => strike(state, seat, card, count, false),
    DashingStrike: ({ dashCard, strikeCard, strikeCount }) => {
      const to = moveTarget(from, seat, dashCard, 'forward')
      const dashed = record(
        { ...spend(state, seat, dashCard), positions: setSeat(positions, seat, to) },
        eventCases.Dashed.make({ seat, card: dashCard, from, to })
      )
      return strike(dashed, seat, strikeCard, strikeCount, true)
    },
    Block: (defense) => defend(state, defense),
    Retreat: (defense) => defend(state, defense),
    TakeHit: (defense) => defend(state, defense),
    StartNextRound: () =>
      DuelPhase.guards.RoundOver(state.phase)
        ? startRound(state.seed, state.rngState, state.round + 1, state.score, state.phase.nextStarter)
        : state,
    Rematch: () =>
      DuelPhase.guards.MatchOver(state.phase)
        ? startRound(state.seed, state.rngState, 1, [0, 0], opponentOf(state.phase.winner))
        : state,
  })
}

export const applyCommand = Effect.fn('battleblocks.applyCommand')(function* (
  state: DuelState,
  seat: Seat,
  command: DuelCommand
): Effect.fn.Return<{ readonly state: DuelState; readonly events: ReadonlyArray<DuelEvent> }, InvalidCommandError> {
  if (Arr.containsWith(sameCommand)(legalCommands(state, seat), command) === false) {
    return yield* InvalidCommandError.make({
      reason: `${command._tag} is illegal for seat ${seat} in ${state.phase._tag}.`,
    })
  }
  const next = transition({ ...state, lastEvents: [] }, seat, command)
  return { state: next, events: next.lastEvents }
})

export const projectView: {
  (viewer: Option.Option<Seat>): (state: DuelState) => PlayerView
  (state: DuelState, viewer: Option.Option<Seat>): PlayerView
} = Function.dual(2, (state: DuelState, viewer: Option.Option<Seat>): PlayerView => ({
  viewer,
  round: state.round,
  score: state.score,
  positions: state.positions,
  deckCount: state.deck.length,
  reshufflesRemaining: state.reshufflesRemaining,
  discard: state.discard,
  phase: state.phase,
  turnNumber: state.turnNumber,
  lastEvents: state.lastEvents,
  myHand: Option.match(viewer, { onNone: () => [], onSome: (seat) => state.hands[seat] }),
  opponentHandCount: Option.match(viewer, { onNone: () => 0, onSome: (seat) => state.hands[opponentOf(seat)].length }),
  legalCommands: Option.match(viewer, { onNone: () => [], onSome: (seat) => legalCommands(state, seat) }),
}))

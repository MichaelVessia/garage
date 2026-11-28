import * as Arr from 'effect/Array'
import * as Function from 'effect/Function'
import * as Option from 'effect/Option'
import * as Order from 'effect/Order'

import { DuelCommand, DuelPhase, TRACK_MAX, TRACK_MIN } from './model.ts'
import type { CardValue, DuelState, PlayerView, Seat } from './model.ts'
import { distanceBetween, projectView } from './rules.ts'

function count(cards: ReadonlyArray<CardValue>, value: CardValue): number {
  return Arr.countBy(cards, (card) => card === value)
}

function strikeSetup(view: PlayerView, distance: number, spent: CardValue): number {
  const matches = Arr.countBy(view.myHand, (value) => value === distance) - Number(spent === distance)
  const spendsLastCopy = count(view.myHand, spent) === 1
  const closest = Arr.reduce(view.myHand, distance, (gap, value) =>
    spendsLastCopy && value === spent ? gap : Math.min(gap, Math.abs(distance - value))
  )
  return 4 * matches - closest
}

function scoreCommand(view: PlayerView, seat: Seat, command: DuelCommand): number {
  const distance = distanceBetween(view.positions)
  const spacesBehindOpponent = seat === 0 ? TRACK_MAX - view.positions[1] : view.positions[0] - TRACK_MIN
  const attack = (value: CardValue, strength: number, canRetreat: boolean): number => {
    const unaccounted = 5 - count(view.myHand, value) - count(view.discard, value)
    const possibleBlocks = Math.min(view.opponentHandCount, unaccounted)
    if (strength > possibleBlocks) {
      return canRetreat ? 30 + strength : 100
    }
    return 13 + 6 * strength - 3 * possibleBlocks + (canRetreat ? 0 : 4)
  }

  return DuelCommand.match(command, {
    Strike: ({ card, count: strength }) => attack(card, strength, false),
    DashingStrike: ({ strikeCard, strikeCount }) =>
      attack(strikeCard, strikeCount, spacesBehindOpponent > 0 && view.opponentHandCount > 0) - 1,
    Move: ({ card, direction }) => {
      const progress = direction === 'forward' ? card : -card
      return strikeSetup(view, distance - progress, card) + progress
    },
    Push: ({ card }) => {
      const pushed = Math.min(card, spacesBehindOpponent)
      return (
        strikeSetup(view, distance + pushed, card) + pushed + (pushed === spacesBehindOpponent && pushed > 0 ? 4 : 0)
      )
    },
    Block: () => {
      const phase = view.phase
      return DuelPhase.guards.AwaitDefense(phase) && view.myHand.length - phase.strikeCount < 2 ? 2 : 12
    },
    Retreat: ({ card }) => {
      const spacesBehind = seat === 0 ? view.positions[0] - TRACK_MIN : TRACK_MAX - view.positions[1]
      return 3 + Math.min(card, spacesBehind) - 0.1 * card
    },
    TakeHit: () => -100,
    StartNextRound: () => 0,
    Rematch: () => 0,
  })
}

export const chooseBotCommand: {
  (seat: Seat): (state: DuelState) => Option.Option<DuelCommand>
  (state: DuelState, seat: Seat): Option.Option<DuelCommand>
} = Function.dual(2, (state: DuelState, seat: Seat): Option.Option<DuelCommand> => {
  const view = projectView(state, Option.some(seat))
  const scored = Arr.map(view.legalCommands, (command) => ({ command, score: scoreCommand(view, seat, command) }))
  const ranked = Arr.sortWith(scored, ({ score }) => -score, Order.Number)
  return Arr.head(ranked).pipe(Option.map(({ command }) => command))
})

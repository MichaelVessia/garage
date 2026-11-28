import * as Function from 'effect/Function'
import * as Option from 'effect/Option'

import type { RatingDelta } from './model.ts'

export const STARTING_RATING = 1000
export const MIN_RATING = 100
export const PROVISIONAL_GAMES = 20
export const PROVISIONAL_K = 32
export const ESTABLISHED_K = 24

export const expectedScore: {
  (ratingB: number): (ratingA: number) => number
  (ratingA: number, ratingB: number): number
} = Function.dual(2, (ratingA: number, ratingB: number): number => 1 / (1 + 10 ** ((ratingB - ratingA) / 400)))

export function kFactor(gamesPlayed: number): number {
  return gamesPlayed < PROVISIONAL_GAMES ? PROVISIONAL_K : ESTABLISHED_K
}

export function computeEloUpdate({
  winnerRating,
  winnerGames,
  loserRating,
  loserGames,
}: {
  readonly winnerRating: number
  readonly winnerGames: number
  readonly loserRating: number
  readonly loserGames: number
}) {
  const gain = Math.max(1, Math.round(kFactor(winnerGames) * (1 - expectedScore(winnerRating, loserRating))))
  const loss = Math.max(1, Math.round(kFactor(loserGames) * expectedScore(loserRating, winnerRating)))
  const loserNext = Math.max(MIN_RATING, loserRating - loss)
  return {
    winner: { before: winnerRating, after: winnerRating + gain, delta: gain },
    loser: { before: loserRating, after: loserNext, delta: loserNext - loserRating },
  } satisfies { readonly winner: RatingDelta; readonly loser: RatingDelta }
}

export function matchmakingWindow(waitMs: number): Option.Option<number> {
  if (waitMs < 5000) {
    return Option.some(150)
  }
  if (waitMs < 12_000) {
    return Option.some(350)
  }
  if (waitMs < 20_000) {
    return Option.some(700)
  }
  return Option.none()
}

export function canMatchRatings({
  ratingA,
  waitMsA,
  ratingB,
  waitMsB,
}: {
  readonly ratingA: number
  readonly waitMsA: number
  readonly ratingB: number
  readonly waitMsB: number
}): boolean {
  const windowA = matchmakingWindow(waitMsA)
  const windowB = matchmakingWindow(waitMsB)
  return (
    Option.isNone(windowA) ||
    Option.isNone(windowB) ||
    Math.abs(ratingA - ratingB) <= Math.max(windowA.value, windowB.value)
  )
}

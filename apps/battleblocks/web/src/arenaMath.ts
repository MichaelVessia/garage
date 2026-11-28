import { DuelCommand, DuelPhase, TRACK_MIN, TRACK_MAX } from '@garage/battleblocks-domain'
import type { PlayerView, CardValue, Seat } from '@garage/battleblocks-domain'
import * as Arr from 'effect/Array'
import * as Fn from 'effect/Function'
import * as Option from 'effect/Option'
import * as Order from 'effect/Order'
import * as Str from 'effect/String'

export const values: ReadonlyArray<CardValue> = [1, 2, 3, 4, 5]
export const blockColors = {
  1: { css: '#dc2626', text: '#ffffff', hex: 0xdc_26_26 },
  2: { css: '#ea580c', text: '#ffffff', hex: 0xea_58_0c },
  3: { css: '#facc15', text: '#0f172a', hex: 0xfa_cc_15 },
  4: { css: '#16a34a', text: '#ffffff', hex: 0x16_a3_4a },
  5: { css: '#0284c7', text: '#ffffff', hex: 0x02_84_c7 },
} satisfies Record<CardValue, { css: string; text: string; hex: number }>
export const cardCanStrike: {
  (view: PlayerView, card: CardValue): boolean
  (card: CardValue): (view: PlayerView) => boolean
} = Fn.dual(2, (view: PlayerView, card: CardValue) =>
  Arr.some(view.legalCommands, (command) => DuelCommand.guards.Strike(command) && command.card === card)
)
const onTrack = (space: number) => Math.max(TRACK_MIN, Math.min(TRACK_MAX, space))
export const spaceToWorldX = (space: number) => (space - 9.5) * 1.2

type NearTone = 'self' | 'forward' | 'backward' | 'opponent-strike' | 'opponent-dash' | 'opponent-far' | 'hidden'
export type BridgeMarker = {
  space: number
  anchorSeat: Seat
  nearValue: Option.Option<CardValue>
  nearLabel: string
  nearTone: NearTone
  farLabel: string
  farTone: 'edge' | 'center' | 'muted'
}

function nearMarker(signed: number, distance: number): Pick<BridgeMarker, 'nearLabel' | 'nearTone'> {
  if (signed === 0) {
    return { nearLabel: '0', nearTone: 'self' }
  }
  if (signed === distance) {
    return {
      nearLabel: String(distance),
      nearTone: distance <= 5 ? 'opponent-strike' : distance <= 10 ? 'opponent-dash' : 'opponent-far',
    }
  }
  if (signed > 0 && signed <= 5 && signed < distance) {
    return { nearLabel: String(signed), nearTone: 'forward' }
  }
  if (signed < 0 && signed >= -5) {
    return { nearLabel: String(signed), nearTone: 'backward' }
  }
  return { nearLabel: '', nearTone: 'hidden' }
}

export function turnSeat(phase: DuelPhase): Option.Option<Seat> {
  return DuelPhase.match(phase, {
    AwaitAction: ({ active }) => Option.some(active),
    AwaitDefense: ({ defender }) => Option.some(defender),
    RoundOver: () => Option.none<Seat>(),
    MatchOver: () => Option.none<Seat>(),
  })
}

export function resultStars(view: PlayerView) {
  if (Option.isNone(view.viewer)) {
    return ''
  }
  const seat = view.viewer.value
  return DuelPhase.match(view.phase, {
    AwaitAction: () => '',
    AwaitDefense: () => '',
    RoundOver: ({ winner }) => (Option.contains(winner, seat) ? Str.repeat(view.score[seat])('★') : ''),
    MatchOver: ({ winner, finalScore }) => (winner === seat ? Str.repeat(finalScore[seat])('★') : ''),
  })
}

export function resultHeading({
  scope,
  viewer,
  winner,
  names,
}: {
  scope: 'round' | 'match'
  viewer: Option.Option<Seat>
  winner: Option.Option<Seat>
  names: readonly [string, string]
}) {
  if (Option.isNone(winner)) {
    return { tone: 'tie', title: 'Round tied' }
  }
  if (Option.isNone(viewer)) {
    const side = winner.value === 0 ? 'left' : 'right'
    return { tone: 'spectator', title: names[winner.value] + ' (' + side + ') won the ' + scope }
  }
  return viewer.value === winner.value
    ? { tone: 'victory', title: 'You won the ' + scope + '!' }
    : { tone: 'defeat', title: 'You lost the ' + scope }
}

export function computeBridgeMarkers(view: PlayerView): ReadonlyArray<BridgeMarker> {
  const anchorSeat = Option.getOrElse(view.viewer, (): Seat => Option.getOrElse(turnSeat(view.phase), (): Seat => 0))
  const origin = view.positions[anchorSeat]
  const distance = Math.abs(view.positions[anchorSeat === 0 ? 1 : 0] - origin)
  const forward = anchorSeat === 0 ? 1 : -1
  return Arr.map(Arr.range(TRACK_MIN, TRACK_MAX), (space) => ({
    space,
    anchorSeat,
    nearValue: Arr.findFirst(values, (value) => value === Math.abs(space - origin)),
    ...nearMarker((space - origin) * forward, distance),
    farLabel: String(space),
    farTone: space === TRACK_MIN || space === TRACK_MAX ? 'edge' : space === 9 || space === 10 ? 'center' : 'muted',
  }))
}

type CameraTarget = { x: number; y: number; z: number; lookX: number }
export const computeCameraTarget: {
  (positions: readonly [number, number], aspect: number): CameraTarget
  (aspect: number): (positions: readonly [number, number]) => CameraTarget
} = Fn.dual(2, (positions: readonly [number, number], aspect: number) => {
  const left = spaceToWorldX(onTrack(positions[0] - 5))
  const right = spaceToWorldX(onTrack(positions[1] + 5))
  const lookX = (left + right) / 2
  const width = Math.abs(right - left) + 7.6
  const z = Math.max(9.5, width / (0.72 * Math.max(0.15, aspect)))
  return { x: lookX, lookX, y: 1.2 + z * 0.44, z }
})

export type ActionOption = {
  command: DuelCommand
  label: string
  ariaLabel: string
  tiles: Array<number>
  origin: number
  hops: ReadonlyArray<number>
  accent: Option.Option<CardValue>
}
function strikeLabel(card: CardValue, count: number) {
  return 'Strike ' + (count === 1 ? String(card) : count + '×' + card)
}
export const buildActionOptions: {
  (view: PlayerView, selection: Option.Option<CardValue>): Array<ActionOption>
  (selection: Option.Option<CardValue>): (view: PlayerView) => Array<ActionOption>
} = Fn.dual(2, (view: PlayerView, selection: Option.Option<CardValue>) => {
  const seat = Option.getOrElse(view.viewer, (): 0 => 0)
  const origin = view.positions[seat]
  const opponent = view.positions[seat === 0 ? 1 : 0]
  const forward = seat === 0 ? 1 : -1
  const options = Arr.flatMap(view.legalCommands, (command) => {
    function option(label: string, ariaLabel: string, tiles: Array<number>, card?: CardValue, start = origin) {
      const end = tiles.at(-1) ?? start
      const hops = Array.from({ length: Math.abs(end - start) }, (_, i) => start + Math.sign(end - start) * (i + 1))
      return [{ command, label, ariaLabel, tiles, hops, origin: start, accent: Option.fromNullishOr(card) }]
    }
    function movement(card: CardValue, target: number, retreat: boolean) {
      const steps = Math.abs(target - origin)
      const right = target > origin
      const label = right ? steps + ' →' : '← ' + steps
      return option(
        retreat && steps !== card ? label + '\nCard ' + card : label,
        (retreat ? 'Retreat' : 'Move') + (right ? ' right' : ' left') + ' to space ' + target + ' with card ' + card,
        [target],
        card
      )
    }
    const arrow = forward > 0 ? '→' : '←'
    return DuelCommand.match(command, {
      Move: ({ card, direction }) =>
        Option.contains(selection, card)
          ? movement(card, origin + forward * card * (direction === 'forward' ? 1 : -1), false)
          : [],
      Push: ({ card }) =>
        Option.contains(selection, card)
          ? option('Push ' + card, 'Push with a ' + card, [onTrack(opponent + forward * card)], card, opponent)
          : [],
      Strike: ({ card, count }) =>
        Option.contains(selection, card)
          ? option(strikeLabel(card, count), 'Strike with ' + count + ' of value ' + card, [opponent], card)
          : [],
      DashingStrike: ({ dashCard, strikeCard, strikeCount }) =>
        Option.contains(selection, dashCard)
          ? option(
              'Dash ' + arrow + dashCard + ' · ' + strikeLabel(strikeCard, strikeCount),
              'Dash ' + dashCard + ' spaces then strike with ' + strikeCount + ' of value ' + strikeCard,
              [origin + forward * dashCard, opponent],
              dashCard
            )
          : [],
      Retreat: ({ card }) => movement(card, onTrack(origin - forward * card), true),
      TakeHit: () => option('Take the hit and lose the round', 'Take the hit and lose the round', []),
      Block: () =>
        DuelPhase.guards.AwaitDefense(view.phase)
          ? option(
              'Block ' + view.phase.strikeValue + (view.phase.strikeCount > 1 ? '×' + view.phase.strikeCount : ''),
              'Block with ' + view.phase.strikeCount + ' of value ' + view.phase.strikeValue,
              [origin],
              view.phase.strikeValue
            )
          : [],
      StartNextRound: () => [],
      Rematch: () => [],
    })
  })
  const moveOrder = (opt: ActionOption) =>
    DuelCommand.guards.Move(opt.command) ? (opt.tiles[0] ?? origin) - origin : TRACK_MAX
  return Arr.sort(options, Order.mapInput(Order.Number, moveOrder))
})

function choose(n: number, k: number): number {
  if (k < 0 || k > n) {
    return 0
  }
  return k === 0 ? 1 : (n * choose(n - 1, k - 1)) / k
}

export function opponentCardProbabilities(view: PlayerView) {
  const h = view.opponentHandCount
  const total = view.deckCount + h
  const hands = Option.isSome(view.viewer) && h > 0 ? choose(total, h) : 0
  return Arr.map(values, (value) => {
    const unseen = Math.max(
      0,
      5 - Arr.countBy(view.discard, (c) => c === value) - Arr.countBy(view.myHand, (c) => c === value)
    )
    const noCopies = choose(total - unseen, h)
    const oneCopy = unseen * choose(total - unseen, h - 1)
    const probability = (count: number) => (hands === 0 ? 0 : Math.max(0, Math.min(1, count / hands)))
    const atLeastOne = probability(hands - noCopies)
    const atLeastTwo = probability(hands - noCopies - oneCopy)
    return {
      value,
      unseen,
      atLeastOne,
      atLeastTwo,
      pct: Math.round(100 * atLeastOne),
      pctTwo: Math.round(100 * atLeastTwo),
    }
  })
}

export function readRoomCodeFromSearch(search: string) {
  const code = Str.toUpperCase(Str.trim(new URLSearchParams(search).get('room') ?? ''))
  return /^[A-Z0-9]{6}$/u.test(code) ? code : undefined
}
export const buildRoomShareUrl: {
  (location: string, code: string): string
  (code: string): (location: string) => string
} = Fn.dual(2, (location: string, code: string) => {
  const url = new URL(location)
  url.search = ''
  url.hash = ''
  url.searchParams.set('room', Str.toUpperCase(code))
  return url.href
})

import { DuelPhase } from '@garage/battleblocks-domain'
import type { PlayerView } from '@garage/battleblocks-domain'
import * as Fn from 'effect/Function'
import * as Option from 'effect/Option'

export type MusicIntensity = 'calm' | 'duel' | 'clash'

export const computeMusicIntensity: {
  (view: PlayerView, activeSession: boolean): MusicIntensity
  (activeSession: boolean): (view: PlayerView) => MusicIntensity
} = Fn.dual(2, (view: PlayerView, activeSession: boolean): MusicIntensity => {
  if (activeSession === false || DuelPhase.guards.RoundOver(view.phase) || DuelPhase.guards.MatchOver(view.phase)) {
    return 'calm'
  }
  return DuelPhase.guards.AwaitDefense(view.phase) || Math.abs(view.positions[1] - view.positions[0]) <= 5
    ? 'clash'
    : 'duel'
})

export const midiToHz = (note: number) => 440 * 2 ** ((note - 69) / 12)

// Four bars of C-major pentatonic call and response.
const tonic = { root: 48, third: 4, lead: [72, 76, 79, 81, 79] }
const bars = [
  tonic,
  { root: 55, third: 2, lead: [74, 79, 81, 79, 74] },
  { root: 45, third: 3, lead: [81, 79, 76, 72, 76] },
  { root: 55, third: 2, lead: [79, 76, 74, 79, 72] },
]
type Step = {
  bass: Option.Option<number>
  arp: Option.Option<number>
  lead: Option.Option<number>
  percussion: boolean
}
export const musicStep: {
  (step: number, intensity: MusicIntensity): Step
  (intensity: MusicIntensity): (step: number) => Step
} = Fn.dual(2, (step: number, intensity: MusicIntensity): Step => {
  const index = ((step % 64) + 64) % 64
  const bar = bars[Math.floor(index / 16)] ?? tonic
  const beat = index % 16
  const root = bar.root
  const chord = [root + 24, root + 24 + bar.third, root + 31, root + 36]
  const active = intensity === 'duel' || intensity === 'clash'
  return {
    bass: beat % (active ? 2 : 8) === 0 ? Option.some(root + (beat % 8 === 4 ? 7 : 0)) : Option.none(),
    arp:
      active && beat % 2 === 1
        ? Option.fromNullishOr(chord[[0, 2, 1, 3, 2, 1, 3, 2][Math.floor(beat / 2)] ?? 0])
        : Option.none(),
    lead: Option.fromNullishOr(bar.lead[(intensity === 'clash' ? [0, 3, 6, 10, 14] : [0, 10]).indexOf(beat)]),
    percussion: intensity === 'clash' && (beat % 4 === 2 || beat === 15),
  }
})

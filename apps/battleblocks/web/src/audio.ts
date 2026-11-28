import { DuelEvent } from '@garage/battleblocks-domain'
import type { CardValue, Seat } from '@garage/battleblocks-domain'
import * as Option from 'effect/Option'

import { midiToHz, musicStep } from './music.ts'
import type { MusicIntensity } from './music.ts'

function makeBus(ctx: AudioContext) {
  const master = ctx.createDynamicsCompressor()
  master.connect(ctx.destination)
  const gain = () => {
    const bus = ctx.createGain()
    bus.gain.value = 0
    bus.connect(master)
    return bus
  }
  const sfx = gain()
  const music = gain()
  const buffer = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate)
  const samples = buffer.getChannelData(0)
  const random = new Uint16Array(4096)
  for (const i of samples.keys()) {
    const offset = i % random.length
    if (offset === 0) {
      crypto.getRandomValues(random)
    }
    samples[i] = (random[offset] ?? 32_768) / 32_768 - 1
  }
  function envelope(bus: GainNode, at: number, duration: number, volume: number) {
    const amp = ctx.createGain()
    amp.gain.setValueAtTime(0, at)
    amp.gain.linearRampToValueAtTime(volume, at + 0.003)
    amp.gain.exponentialRampToValueAtTime(0.0001, at + duration)
    amp.connect(bus)
    return amp
  }
  function tone(
    bus: GainNode,
    at: number,
    hz: number,
    end: number,
    duration: number,
    volume: number,
    type: OscillatorType = 'sine'
  ) {
    const osc = ctx.createOscillator()
    osc.type = type
    osc.frequency.setValueAtTime(hz, at)
    osc.frequency.exponentialRampToValueAtTime(end, at + duration)
    osc.connect(envelope(bus, at, duration, volume))
    osc.start(at)
    osc.stop(at + duration)
  }
  function noise(
    bus: GainNode,
    at: number,
    duration: number,
    volume: number,
    type: BiquadFilterType,
    hz: number,
    peak: number,
    end: number,
    q = 1
  ) {
    const source = ctx.createBufferSource()
    source.buffer = buffer
    const filter = ctx.createBiquadFilter()
    filter.type = type
    filter.Q.value = q
    filter.frequency.setValueAtTime(hz, at)
    filter.frequency.exponentialRampToValueAtTime(peak, at + duration * 0.4)
    filter.frequency.exponentialRampToValueAtTime(end, at + duration)
    source.connect(filter).connect(envelope(bus, at, duration, volume))
    source.start(at, (at % 1) * (1 - duration))
    source.stop(at + duration)
  }
  function foot(at: number) {
    noise(sfx, at, 0.045, 0.18, 'lowpass', 1800, 950, 430)
    tone(sfx, at, 235, 370, 0.13, 0.22, 'triangle')
  }
  function slash(at: number, strength: number) {
    noise(sfx, at, 0.16, strength, 'bandpass', 950, 7200, 1450, 4)
    tone(sfx, at + 0.035, 1320, 2093, 0.1, strength * 0.1)
  }
  function cadence(at: number, notes: ReadonlyArray<number>, spacing: number) {
    for (const [i, note] of notes.entries()) {
      tone(sfx, at + spacing * i, midiToHz(note), midiToHz(note), 0.36, 0.18, 'triangle')
    }
  }
  function play(event: DuelEvent, viewer: Option.Option<Seat>) {
    const at = ctx.currentTime
    DuelEvent.match(event, {
      Moved: () => foot(at),
      Retreated: () => {
        tone(sfx, at, 210, 120, 0.075, 0.15, 'triangle')
        noise(sfx, at + 0.07, 0.09, 0.29, 'highpass', 1500, 2400, 1800)
      },
      Pushed: () => {
        tone(sfx, at, 175, 85, 0.16, 0.3)
        noise(sfx, at + 0.02, 0.12, 0.22, 'bandpass', 1250, 1900, 450)
      },
      Dashed: () => {
        foot(at)
        cadence(at + 0.035, [72, 76, 79], 0.035)
        noise(sfx, at + 0.04, 0.23, 0.56, 'bandpass', 550, 4200, 780)
      },
      Struck: (e) => slash(at, e.strikeCount >= 2 || e.isDashing ? 0.84 : 0.6),
      Blocked: () => {
        tone(sfx, at, 220, 720, 0.09, 0.32, 'triangle')
        tone(sfx, at + 0.09, 720, 330, 0.19, 0.23)
      },
      HitLanded: () => {
        noise(sfx, at, 0.05, 0.3, 'lowpass', 3000, 4500, 700)
        cadence(at + 0.04, [72, 76, 79, 84], 0.06)
      },
      Recovered: () => cadence(at, [76, 79, 84], 0.12),
      DeckReshuffled: () => {
        for (const i of [0, 1, 2, 3, 4]) {
          tone(sfx, at + i * 0.036, 450 + i * 40, 220, 0.035, 0.13, 'triangle')
        }
      },
      RoundStarted: () => cadence(at, [79, 84], 0.15),
      RoundEnded: ({ winner }) => {
        const decided = Option.isSome(viewer) && Option.isSome(winner)
        cadence(
          at + 0.16,
          decided ? (viewer.value === winner.value ? [72, 76, 79, 84] : [79, 76, 72]) : [72, 79, 84],
          0.09
        )
      },
      MatchEnded: ({ winner }) =>
        cadence(
          at + 0.52,
          Option.isSome(viewer) && viewer.value !== winner ? [79, 76, 72, 60] : [72, 76, 79, 84, 88, 91],
          0.065
        ),
    })
  }
  function mallet(bus: GainNode, at: number, note: number, volume: number, decay: number) {
    const hz = midiToHz(note)
    tone(bus, at, hz, hz, decay, volume)
    tone(bus, at, hz * 4, hz * 4, decay / 6, volume * 0.3)
  }
  function select(card: CardValue = 1) {
    const note = { 1: 72, 2: 74, 3: 76, 4: 79, 5: 81 }[card]
    mallet(sfx, ctx.currentTime, note, 0.3, 0.29)
  }
  function score(at: number, step: number, intensity: MusicIntensity) {
    const { bass, arp, lead, percussion } = musicStep(step, intensity)
    if (Option.isSome(bass)) {
      mallet(music, at, bass.value, 0.43, 0.21)
    }
    if (Option.isSome(arp)) {
      mallet(music, at, arp.value, 0.15, 0.13)
    }
    if (Option.isSome(lead)) {
      mallet(music, at, lead.value, 0.18, 0.27)
    }
    if (percussion) {
      noise(music, at, 0.052, 0.34, 'bandpass', 1500, 2800, 960)
    }
  }
  return { ctx, sfx, music, score, play, select }
}

function preference(key: string) {
  try {
    return localStorage.getItem(key) !== '0'
  } catch {
    return true
  }
}
function save(key: string, enabled: boolean) {
  try {
    localStorage.setItem(key, enabled ? '1' : '0')
  } catch {
    // The current session still uses the selected setting.
  }
}

type AudioState = {
  bus?: ReturnType<typeof makeBus>
  timer?: number
  intensity: MusicIntensity
  next: number
  step: number
  music: boolean
  sfx: boolean
}
export function createAudio() {
  const state: AudioState = {
    intensity: 'calm',
    next: 0,
    step: 0,
    music: preference('battleblocks.music'),
    sfx: preference('battleblocks.sfx'),
  }

  function sync() {
    const bus = state.bus
    if (bus === undefined) {
      return
    }
    const audible = document.hidden === false && bus.ctx.state === 'running'
    const now = bus.ctx.currentTime
    bus.sfx.gain.value = audible && state.sfx ? 0.68 : 0
    if (audible && state.music) {
      if (state.timer !== undefined) {
        return
      }
      bus.music.gain.cancelScheduledValues(now)
      bus.music.gain.setValueAtTime(0, now)
      bus.music.gain.linearRampToValueAtTime(0.32, now + 0.35)
      state.next = now + 0.012
      function tick() {
        if (bus === undefined) {
          return
        }
        const time = bus.ctx.currentTime
        state.next = Math.max(state.next, time)
        while (state.next < time + 0.1) {
          bus.score(state.next, state.step, state.intensity)
          state.step = (state.step + 1) % 64
          state.next += 60 / (124 * 4)
        }
      }
      tick()
      state.timer = window.setInterval(tick, 30)
    } else {
      window.clearInterval(state.timer)
      delete state.timer
      bus.music.gain.cancelScheduledValues(now)
      bus.music.gain.setValueAtTime(0, now)
    }
  }
  function unlock() {
    if (typeof AudioContext === 'undefined' || document.hidden) {
      return
    }
    try {
      if (state.bus === undefined) {
        state.bus = makeBus(new AudioContext())
        state.bus.ctx.onstatechange = sync
      }
      const { ctx } = state.bus
      if (ctx.state === 'running') {
        sync()
      } else {
        void ctx.resume().then(sync, sync)
      }
    } catch {
      // Audio is optional on devices without an available output context.
    }
  }
  if (typeof document !== 'undefined') {
    document.addEventListener('visibilitychange', () => {
      if (document.hidden || state.bus === undefined) {
        sync()
      } else {
        unlock()
      }
    })
  }
  return {
    unlock,
    toggleSfx() {
      state.sfx = state.sfx === false
      save('battleblocks.sfx', state.sfx)
      unlock()
      return state.sfx
    },
    toggleMusic() {
      state.music = state.music === false
      save('battleblocks.music', state.music)
      unlock()
      return state.music
    },
    sfxEnabled: () => state.sfx,
    musicEnabled: () => state.music,
    setIntensity(intensity: MusicIntensity) {
      state.intensity = intensity
    },
    playSelect(card?: CardValue) {
      if (state.sfx && state.bus !== undefined && document.hidden === false) {
        state.bus.select(card)
      }
    },
    play(event: DuelEvent, viewer: Option.Option<Seat> = Option.none()) {
      const bus = state.bus
      if (bus === undefined || state.sfx === false || document.hidden) {
        return
      }
      bus.play(event, viewer)
      if (DuelEvent.guards.HitLanded(event) && state.timer !== undefined) {
        const now = bus.ctx.currentTime
        bus.music.gain.cancelScheduledValues(now)
        bus.music.gain.setValueAtTime(0.08, now)
        bus.music.gain.setValueAtTime(0.08, now + 0.18)
        bus.music.gain.linearRampToValueAtTime(0.32, now + 0.35)
      }
    },
  }
}

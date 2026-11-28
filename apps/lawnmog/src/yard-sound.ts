import type { EquippedTool, Tool } from './model.ts'

type Voice = Tool | 'steps'

const sampleRate = 16_000
const turn = Math.PI * 2

/** Each loop contains a full mechanical cycle or a pair of footfalls. */
function makeLoop(context: AudioContext, voice: Voice) {
  const duration = voice === 'steps' ? 0.98 : 1
  const buffer = context.createBuffer(1, Math.round(duration * sampleRate), sampleRate)
  const samples = buffer.getChannelData(0)
  let low = 0
  const noiseSamples = crypto.getRandomValues(new Int16Array(samples.length))
  let mid = 0
  for (let i = 0; i < samples.length; i++) {
    const t = i / sampleRate
    const noise = (noiseSamples[i] ?? 0) / 32_768
    low += 0.075 * (noise - low)
    mid += 0.46 * (noise - mid)
    const beat = (i / samples.length) * 2
    const heel = beat % 1
    const pulse = Math.min(1, heel * 95) * Math.exp(-heel * 15)
    let sample: number
    switch (voice) {
      case 'push':
      case 'riding':
      case 'self-propelled': {
        const riding = voice === 'riding'
        const phase = turn * t * (riding ? 36 : voice === 'push' ? 46 : 54) + 0.17 * Math.sin(turn * t * 3)
        const exhaust = Math.sin(phase) + 0.46 * Math.sin(2 * phase) + 0.19 * Math.sin(4 * phase)
        sample = exhaust * (riding ? 0.044 : 0.033) + low * (0.03 + 0.04 * (1 + Math.cos(phase)))
        break
      }
      case 'rake': {
        const scrape = Math.max(0, Math.sin(t * turn)) ** 1.4
        sample = scrape * ((noise - mid) * 0.065 + (mid - low) * (0.08 + 0.05 * Math.sin(t * turn * 29)))
        break
      }
      case 'handheld-blower':
        sample = (mid - low) * 0.095 + Math.sin(turn * t * 268) * 0.018 + low * 0.045
        break
      case 'backpack-blower': {
        const motor = turn * t * 84 + 0.09 * Math.sin(t * turn * 4)
        sample = low * 0.15 + mid * 0.05 + Math.sin(motor) * 0.036 + Math.sin(motor * 3) * 0.017
        break
      }
      case 'watering-can':
        sample = (mid - low) * 0.045 + Math.sin(turn * t * 740) * 0.025 * Math.exp(-((t * 17) % 1) * 12)
        break
      case 'reel':
        sample = (0.085 * low + 0.03 * mid) * (0.2 + 0.8 * Math.cos(turn * t * 7) ** 8)
        break
      case 'hose':
        sample = (mid - low) * 0.068 + low * 0.03
        break
      case 'sprinkler':
        sample = (mid - low) * (0.018 + 0.085 * Math.cos(turn * t * 4) ** 6)
        break
      case 'irrigation':
        sample = low * 0.085 + mid * (0.03 + 0.013 * Math.sin(turn * t))
        break
      case 'feed':
        sample = (noise - mid) * 0.052 * pulse
        break
      case 'drop-spreader':
        sample = (noise - mid) * 0.038 + mid * 0.055 * Math.cos(turn * t * 5) ** 8
        break
      case 'broadcast-spreader':
        sample = (noise - mid) * 0.05 + Math.sin(turn * t * 78) * 0.015
        break
      case 'pump-sprayer':
        sample = (mid - low) * (0.035 + pulse * 0.065)
        break
      case 'backpack-sprayer':
        sample = (noise - mid) * 0.06 + Math.sin(turn * t * 96) * 0.017
        break
      case 'treat':
        sample = (mid - low) * 0.09 * Math.min(1, heel * 30) * Math.exp(-heel * 5)
        break
      case 'steps':
        sample = (0.105 * low + 0.04 * Math.sin(turn * 68 * t)) * pulse * (beat < 1 ? 1 : 0.85)
        break
    }
    samples[i] = sample * Math.min(1, i / 64, (samples.length - 1 - i) / 64)
  }
  return buffer
}

function play(context: AudioContext, buffer: AudioBuffer) {
  const source = context.createBufferSource()
  const gain = context.createGain()
  const now = context.currentTime
  source.buffer = buffer
  source.loop = true
  source.connect(gain).connect(context.destination)
  gain.gain.setValueAtTime(0, now)
  gain.gain.linearRampToValueAtTime(1, now + 0.045)
  source.start()
  return () => {
    const release = context.currentTime
    const end = release + 0.055
    gain.gain.cancelScheduledValues(release)
    gain.gain.setValueAtTime(Math.min(1, (release - now) / 0.045), release)
    gain.gain.linearRampToValueAtTime(0, end)
    source.stop(end)
  }
}

type Playback = {
  context?: AudioContext
  active?: Tool
  stopTool?: () => void
  stopSteps?: () => void
}

export function createYardSound() {
  const state: Playback = {}
  const loops: Partial<Record<Voice, AudioBuffer>> = {}
  let muted = false
  let disposed = false
  let focused = document.hasFocus()
  function silence() {
    state.stopTool?.()
    state.stopSteps?.()
    delete state.active
    delete state.stopTool
    delete state.stopSteps
  }
  function blur() {
    focused = false
    silence()
  }
  function focus() {
    focused = true
  }
  function visibility() {
    if (document.hidden) {
      silence()
    }
  }
  window.addEventListener('blur', blur)
  window.addEventListener('focus', focus)
  document.addEventListener('visibilitychange', visibility)
  function start(audio: AudioContext, voice: Voice) {
    let buffer = loops[voice]
    if (buffer === undefined) {
      buffer = makeLoop(audio, voice)
      loops[voice] = buffer
    }
    return play(audio, buffer)
  }
  return {
    unlock() {
      if (disposed) {
        return
      }
      try {
        state.context ??= new AudioContext()
        if (state.context.state !== 'running') {
          void state.context.resume().catch(() => {})
        }
      } catch {
        // The browser can disable audio while the game remains available.
      }
    },
    update(tool: EquippedTool, working: boolean, walking: boolean) {
      if (state.context === undefined || state.context.state !== 'running' || muted || !focused || document.hidden) {
        return
      }
      const next = working ? (tool ?? undefined) : undefined
      if (state.active !== next) {
        state.stopTool?.()
        if (next === undefined) {
          delete state.stopTool
          delete state.active
        } else {
          state.stopTool = start(state.context, next)
          state.active = next
        }
      }
      if (walking && state.stopSteps === undefined) {
        state.stopSteps = start(state.context, 'steps')
      }
      if (!walking && state.stopSteps !== undefined) {
        state.stopSteps()
        delete state.stopSteps
      }
    },
    setMuted(value: boolean) {
      muted = value
      if (muted) {
        silence()
      }
    },
    dispose() {
      disposed = true
      window.removeEventListener('blur', blur)
      window.removeEventListener('focus', focus)
      document.removeEventListener('visibilitychange', visibility)
      silence()
      if (state.context !== undefined) {
        void state.context.close().catch(() => {})
      }
      delete state.context
    },
  }
}

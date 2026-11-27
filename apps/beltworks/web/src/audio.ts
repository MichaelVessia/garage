import * as Option from 'effect/Option'

import { element } from './hud.ts'
import { control } from './hud.ts'
export function createAudio() {
  let audio = Option.none<AudioContext>()
  let sound = true
  function activateAudio() {
    if (!sound || typeof AudioContext === 'undefined' || navigator.userActivation?.isActive === false) {
      return
    }
    const context = Option.getOrElse(audio, () => new AudioContext())
    audio = Option.some(context)
    if (context.state !== 'running') {
      void context.resume().catch(() => {})
    }
  }
  window.addEventListener('pointerdown', activateAudio, true)
  window.addEventListener('pointerup', activateAudio, true)
  window.addEventListener('click', activateAudio, true)
  window.addEventListener('keydown', activateAudio, true)
  function updateSoundControl() {
    control({
      id: 'sound',
      title: sound ? 'Sound on' : 'Sound off',
      path: sound ? 'M3 9h4l5-4v12l-5-4H3z M15 8q4 3 0 6m2-9q7 6 0 12' : 'M3 9h4l5-4v12l-5-4H3z M15 9l4 4m0-4-4 4',
    })
    element('sound').setAttribute('aria-pressed', String(sound))
  }
  updateSoundControl()
  element('sound').onclick = () => {
    sound = !sound
    if (sound) {
      activateAudio()
    } else if (Option.isSome(audio)) {
      void audio.value.close().catch(() => {})
      audio = Option.none()
    }
    updateSoundControl()
  }
  function chime(hz: number, delay = 0, duration = 0.19, type: OscillatorType = 'sine') {
    if (!sound || Option.isNone(audio) || audio.value.state !== 'running') {
      return
    }
    const tone = audio.value.createOscillator(),
      gain = audio.value.createGain()
    const start = audio.value.currentTime + delay
    tone.type = type
    tone.frequency.value = hz
    gain.gain.setValueAtTime(0.032, start)
    gain.gain.exponentialRampToValueAtTime(0.001, start + duration)
    tone.connect(gain).connect(audio.value.destination)
    tone.start(start)
    tone.stop(start + duration + 0.01)
  }
  const scale = [440, 493.88, 554.37, 659.25, 739.99]
  function beltNote(tileIndex: number, delay = 0) {
    const degree = Math.min(tileIndex, 10)
    chime((scale[degree % 5] ?? 440) * 2 ** (Math.floor(degree / 5) - 1), delay, 0.075, 'triangle')
  }
  function celebrate(root = 440) {
    for (const [i, ratio] of [1, 1.25, 1.5, 2].entries()) {
      chime(root * ratio, i * 0.085, i === 3 ? 0.35 : 0.15)
    }
  }
  return { chime, beltNote, celebrate, scale }
}

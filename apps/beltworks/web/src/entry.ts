import { Application } from 'pixi.js'

import { createAudio } from './audio.ts'
import { createEditor } from './editor.ts'
import { createEffects } from './effects.ts'
import { createFactory } from './factory.ts'
import { connectFactory } from './factorySync.ts'
import { createGuide } from './guide.ts'
import { element } from './hud.ts'
import { bindInput } from './input.ts'
import { startPlayback } from './playback.ts'
import { createPreview } from './preview.ts'
import { createViewport } from './viewport.ts'

import './feedback.css'

const field = element('field')
const app = new Application()
await app.init({
  resizeTo: field,
  autoDensity: true,
  resolution: Math.min(window.devicePixelRatio, 2),
  antialias: true,
  background: 0x0a_10_16,
  autoStart: false,
})
field.append(app.canvas)
const factory = createFactory({ app, field })
const overlay = createPreview(factory)
const audio = createAudio()
const effects = createEffects({ factory, audio })
const guide = createGuide(factory)
const viewport = createViewport({ factory, preview: overlay.preview })
const surface = { factory, overlay, audio, effects, guide, viewport }
const syncScore = () => connection.syncScore()
const editor = createEditor({ ...surface, syncScore })
const { refresh, choose, edit, undo, showBoard } = editor
const { clearStroke } = bindInput({ ...surface, refresh, choose, edit, undo, pause: () => pause() })
showBoard()
const connection = connectFactory({ factory, editor, guide, viewport, clearStroke })
const pause = startPlayback({ factory, effects, viewport, guide, refresh, syncScore })
await connection.restored

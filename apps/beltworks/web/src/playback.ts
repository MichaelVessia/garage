import { simulation, step } from '@garage/beltworks-domain'
import { FixedLoop, Result } from '@typeonce/ritmo'
import { BrowserTickSource } from '@typeonce/ritmo-browser'
import * as Cause from 'effect/Cause'

import { draw } from './board.ts'
import type { createEffects } from './effects.ts'
import type { Factory } from './factory.ts'
import type { createGuide } from './guide.ts'
import { control, element } from './hud.ts'
import type { createViewport } from './viewport.ts'
export function startPlayback({
  factory,
  effects,
  guide,
  viewport,
  refresh,
  syncScore,
}: {
  factory: Factory
  effects: ReturnType<typeof createEffects>
  guide: ReturnType<typeof createGuide>
  viewport: ReturnType<typeof createViewport>
  refresh: () => void
  syncScore: () => void
}) {
  const { app, runtime, state, inspection } = factory
  const { observe } = effects
  const { map, animateReveal } = viewport
  const { positionGuide } = guide
  let paused = false,
    speed = 1
  function pause() {
    if (inspection.visiting) {
      return
    }
    paused = !paused
    control({ id: 'pause', title: paused ? 'Play' : 'Pause', path: paused ? 'M6 3l12 8-12 8z' : 'M7 5v12m8-12v12' })
  }
  element('pause').onclick = pause
  element('speed').onclick = () => {
    if (inspection.visiting) {
      return
    }
    speed = speed === 4 ? 1 : speed * 2
    control({ id: 'speed', title: speed + '×' })
    element('speed').classList.toggle('active', speed > 1)
  }
  const frames = BrowserTickSource.make(window)
  const maxFrameSeconds = 5 * step.dt
  const loop = FixedLoop.start({
    source: FixedLoop.source((onTick) =>
      frames.subscribe(({ deltaMS }) => {
        const rate = inspection.visiting ? 1 : speed
        const elapsed =
          document.hidden || (paused && !inspection.visiting) ? 0 : Math.min(deltaMS, 1000 * maxFrameSeconds)
        onTick({ deltaMS: elapsed * rate })
      })
    ),
    step,
    maxStepsPerFrame: 20,
    maxFrameSeconds: 4 * maxFrameSeconds,
    update: (_, frame) => {
      const milestoneBefore = state.view.p.milestoneIndex
      const result = runtime.tick(simulation, observe)
      if (!result.ok || !frame.last) {
        return result
      }
      const drawn = runtime.tick(draw)
      if (!drawn.ok) {
        return drawn
      }
      refresh()
      if (!inspection.visiting && state.view.p.milestoneIndex > milestoneBefore) {
        syncScore()
      }
      return Result.success(undefined)
    },
    render: ({ alpha }) => {
      if (document.hidden) {
        return
      }
      const cameraMoved = map.draw(state.view.p.boardTier)
      if (paused && !inspection.visiting && !state.boardChanged && !cameraMoved) {
        return
      }
      if (!paused || inspection.visiting) {
        factory.board.interpolate(state.view.tick, state.view.p, alpha)
      }
      const now = performance.now()
      animateReveal(now)
      effects.animateEffects(now)
      positionGuide()
      app.render()
    },
    onFailure: (error) => {
      throw new Error(Cause.pretty(Cause.die(error)))
    },
  })
  if (!loop.ok) {
    throw new Error('Could not start factory clock')
  }

  return pause
}

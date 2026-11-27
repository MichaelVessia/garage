import { columns, boardBounds, rows } from '@garage/beltworks-domain'
import * as Arr from 'effect/Array'
import * as Option from 'effect/Option'
import { Graphics } from 'pixi.js'

import { expansionCamera } from './camera.ts'
import type { Camera } from './camera.ts'
import type { Factory } from './factory.ts'
import { element } from './hud.ts'
import { tile } from './machines.ts'
import { minimap } from './minimap.ts'
export function createViewport({
  factory: { field, app, board, state },
  preview,
}: {
  factory: Factory
  preview: () => void
}) {
  const filterForm = element('filter-picker')
  function boardViewport() {
    const top = element('bar').getBoundingClientRect().bottom + 12
    document.documentElement.style.setProperty('--drawer-top', Math.max(74, top) + 'px')
    const workshop = element('workshop')
    const reserved =
      window.innerWidth > 768 && workshop.hasAttribute('open') && element('workshop-content').hidden === false
    const w = Math.max(1, reserved ? workshop.getBoundingClientRect().left - 12 : field.clientWidth),
      h = Math.max(1, element('toolbar').getBoundingClientRect().top - 12 - top)
    return { width: w, height: h, top }
  }
  let viewport = boardViewport()
  const map = minimap({ board, viewport: () => viewport })
  function positionMinimap() {
    const panels = [element('toolbar'), filterForm]
    const top = Math.min(
      ...Arr.map(
        Arr.filter(panels, (panel) => panel.hidden === false),
        (panel) => panel.getBoundingClientRect().top
      )
    )
    element('minimap').style.bottom = field.clientHeight - top + 12 + 'px'
  }
  const popupLayout = new ResizeObserver(positionMinimap)
  popupLayout.observe(filterForm)
  type Reveal = { from: Camera; to: Camera; start: number }
  let reveal = Option.none<Reveal>()
  const perimeter = board.preview.addChild(new Graphics())
  function revealExpansion() {
    const { minX, maxX, minY, maxY } = boardBounds(state.view.p.boardTier)
    const w = (maxX - minX + 1) * tile
    const h = (maxY - minY + 1) * tile
    perimeter
      .clear()
      .roundRect(-w / 2, -h / 2, w, h, 8)
      .stroke({ color: 0x8f_ff_dc, width: 10, alpha: 0.25 })
      .roundRect(-w / 2, -h / 2, w, h, 8)
      .stroke({ color: 0xff_df_96, width: 3 })
    perimeter.position.set((columns / 2) * tile, (rows / 2) * tile)
  }
  function fitBoard(animated: boolean) {
    map.cancelPan()
    viewport = boardViewport()
    map.invalidate()
    const { width: w, height: h, top } = viewport
    element('minimap').style.right = field.clientWidth - w + 8 + 'px'
    positionMinimap()
    const { minX, maxX, minY, maxY } = boardBounds(state.view.p.boardTier)
    const scale = Math.min(w / ((maxX - minX + 1) * tile + 40), h / ((maxY - minY + 1) * tile + 40))
    const to = { scale, x: (w - columns * tile * scale) / 2, y: top + (h - rows * tile * scale) / 2 }
    if (animated) {
      reveal = Option.some({
        from: { x: board.world.x, y: board.world.y, scale: board.world.scale.x },
        to,
        start: performance.now(),
      })
    } else {
      reveal = Option.none()
      board.world.scale.set(scale)
      board.world.position.set(to.x, to.y)
    }
    map.draw(state.view.p.boardTier)
    state.hovered = Option.none()
    preview()
  }
  function center() {
    fitBoard(false)
  }
  const layout = new ResizeObserver(() => {
    app.resize()
    center()
  })
  for (const panel of [field, element('bar'), element('toolbar')]) {
    layout.observe(panel)
  }
  new MutationObserver(center).observe(element('workshop-content'), { attributes: true, attributeFilter: ['hidden'] })
  element('center').onclick = center
  function animateReveal(now: number) {
    state.boardChanged = Option.isSome(reveal)
    perimeter.visible = Option.isSome(reveal)
    if (Option.isSome(reveal)) {
      const elapsed = now - reveal.value.start
      const camera = expansionCamera({ from: reveal.value.from, to: reveal.value.to, elapsed })
      board.world.scale.set(camera.scale)
      board.world.position.set(camera.x, camera.y)
      perimeter.scale.set(0.7 + 0.3 * Math.min(1, elapsed / 450))
      perimeter.alpha = 1 - Math.max(0, elapsed - 450) / 380
      if (elapsed >= 830) {
        reveal = Option.none()
      }
    }
  }
  return {
    map,
    center,
    fitBoard,
    revealExpansion,
    animateReveal,
    cancelReveal: () => {
      reveal = Option.none()
    },
  }
}

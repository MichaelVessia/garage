import { boardBounds, columns, rows } from '@garage/beltworks-domain'
import type { BoardTier } from '@garage/beltworks-domain'
import * as Option from 'effect/Option'
import * as Str from 'effect/String'

import type { createBoard } from './board.ts'
import { oreColor, tile } from './machines.ts'

interface BoardViewport {
  top: number
  width: number
  height: number
}

export function mapCamera({ viewport, scale, x, y }: { viewport: BoardViewport; scale: number; x: number; y: number }) {
  return {
    x: viewport.width / 2 - x * columns * tile * scale,
    y: viewport.top + viewport.height / 2 - y * rows * tile * scale,
  }
}

const fraction = (value: number) => Math.max(0, Math.min(1, value))

export function minimap({ board, viewport }: { board: ReturnType<typeof createBoard>; viewport: () => BoardViewport }) {
  const canvas = document.querySelector<HTMLCanvasElement>('canvas#minimap')
  if (canvas === null) {
    throw new Error('Missing minimap canvas')
  }
  const ctx = canvas.getContext('2d')
  if (ctx === null) {
    throw new Error('Missing minimap drawing context')
  }
  const size = canvas.width / columns
  let destination = Option.none<ReturnType<typeof mapCamera>>()
  const pan = (e: PointerEvent) => {
    if (!canvas.hasPointerCapture(e.pointerId)) {
      return
    }
    const rect = canvas.getBoundingClientRect()
    destination = Option.some(
      mapCamera({
        viewport: viewport(),
        scale: board.world.scale.x,
        x: fraction((e.clientX - rect.left) / rect.width),
        y: fraction((e.clientY - rect.top) / rect.height),
      })
    )
  }
  canvas.onpointerdown = (e) => {
    if (e.isPrimary && e.button === 0) {
      canvas.setPointerCapture(e.pointerId)
      pan(e)
    }
  }
  canvas.onpointermove = pan
  let dirty = true
  let previousX = Number.NaN,
    previousY = Number.NaN,
    previousScale = Number.NaN
  return {
    cancelPan() {
      destination = Option.none()
    },
    invalidate() {
      dirty = true
    },
    draw(tier: BoardTier) {
      const hidden = tier < 2
      if (canvas.hidden !== hidden) {
        canvas.hidden = hidden
      }
      if (Option.isSome(destination) && !hidden) {
        const dx = destination.value.x - board.world.x
        const dy = destination.value.y - board.world.y
        if (Math.hypot(dx, dy) < 1 || window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
          board.world.position.set(destination.value.x, destination.value.y)
          destination = Option.none()
        } else {
          board.world.position.set(board.world.x + dx * 0.35, board.world.y + dy * 0.35)
        }
      }
      const { x, y, scale } = board.world
      if (canvas.hidden || (!dirty && previousX === x && previousY === y && previousScale === scale.x)) {
        return false
      }
      dirty = false
      previousX = x
      previousY = y
      previousScale = scale.x
      ctx.fillStyle = '#091017'
      ctx.fillRect(0, 0, canvas.width, canvas.height)
      const { minX, minY, maxX, maxY } = boardBounds(tier)
      ctx.fillStyle = '#293943'
      ctx.fillRect(minX * size, minY * size, (maxX - minX + 1) * size, (maxY - minY + 1) * size)
      for (const vein of board.veins.children) {
        if (vein.visible) {
          ctx.fillStyle = '#' + Str.padStart(6, '0')(oreColor(Number(vein.label)).toString(16))
          ctx.fillRect(Math.floor(vein.x / tile) * size, Math.floor(vein.y / tile) * size, size, size)
        }
      }
      for (const node of board.buildings.children) {
        if (node.visible) {
          const hub = node.state.kind === 'hub'
          const width = hub ? size * 2 : size - 1
          ctx.fillStyle = hub ? '#ffce80' : node.state.kind === 'belt' ? '#92a8b4' : '#76e3cc'
          ctx.fillRect((node.x / tile) * size - width / 2, (node.y / tile) * size - width / 2, width, width)
        }
      }
      const frame = viewport()
      const ratio = size / (tile * scale.x)
      const left = Math.max(0.5, -x * ratio)
      const top = Math.max(0.5, (frame.top - y) * ratio)
      const right = Math.min(canvas.width - 0.5, (frame.width - x) * ratio)
      const bottom = Math.min(canvas.height - 0.5, (frame.top + frame.height - y) * ratio)
      if (right > left && bottom > top) {
        ctx.fillStyle = '#ffffff0b'
        ctx.fillRect(left, top, right - left, bottom - top)
        ctx.strokeStyle = '#ffffffad'
        ctx.strokeRect(left, top, right - left, bottom - top)
      }
      return true
    },
  }
}

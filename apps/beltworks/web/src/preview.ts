import { findTunnelPartner, inBounds, key } from '@garage/beltworks-domain'
import type { BuildingState, Cell, Direction } from '@garage/beltworks-domain'
import * as Arr from 'effect/Array'
import * as Option from 'effect/Option'
import { Container, Graphics } from 'pixi.js'

import type { Factory } from './factory.ts'
import { area } from './factory.ts'
import { element } from './hud.ts'
import { inspectCell } from './inspector.ts'
import { label, Machine, tile } from './machines.ts'
import { machinePorts, ghostState, tools } from './tools.ts'
export function createPreview({ board, state, machineAt, tunnelAt, primaryTarget }: Factory) {
  const ghost = board.preview.addChild(new Machine())
  const border = board.preview.addChild(new Graphics())
  const portBadges = Arr.makeBy(3, () => {
    const badge = board.preview.addChild(new Container())
    badge
      .addChild(new Graphics())
      .roundRect(-22, -11, 44, 22, 6)
      .setFillStyle({ color: 0x10_1a_24, alpha: 0.9 })
      .fill()
      .stroke({ color: 0xff_ff_ff, width: 1.5 })
    const marker = badge.addChild(label({ text: '', size: 17, fill: 0xff_ff_ff }))
    return { badge, marker }
  })

  function previewPorts(state: BuildingState, cell: Cell, dir: Direction, alpha: number) {
    for (const [{ badge, marker }, port] of Arr.zip(portBadges, machinePorts({ state, cell, facing: dir }))) {
      badge.position.set((port.cell.gx + 0.5) * tile, (port.cell.gy + 0.5) * tile)
      badge.tint = port.color
      badge.alpha = alpha
      marker.text = port.text
      marker.style.fontSize = Math.min(19, 64 / port.text.length)
      badge.visible = true
    }
  }
  const measurement = element('measurement')
  function measure(width: number, height: number, count: number, unit: string) {
    measurement.textContent = width + '×' + height + ' · ' + count + ' ' + unit + (count === 1 ? '' : 's')
    measurement.hidden = false
  }
  function link(cell: Cell, partner: Cell) {
    const x = (cell.gx + 0.5) * tile,
      y = (cell.gy + 0.5) * tile
    const dx = (partner.gx - cell.gx) * tile,
      dy = (partner.gy - cell.gy) * tile
    const length = Math.hypot(dx, dy)
    for (let offset = 0; offset < length; offset += 12) {
      const end = Math.min(length, offset + 7)
      border
        .moveTo(x + (dx * offset) / length, y + (dy * offset) / length)
        .lineTo(x + (dx * end) / length, y + (dy * end) / length)
    }
    border.stroke({ width: 2, alpha: 0.65, color: 0x61_e7_ef })
  }
  const inspector = element('inspector')
  const rotateButton = element('rotate')
  const rotateLabel = document.createTextNode('')
  rotateButton.replaceChildren(...rotateButton.querySelectorAll('svg'), rotateLabel)
  function inspectHover() {
    const info = Option.isSome(state.hovered)
      ? inspectCell({ cell: state.hovered.value, board, p: state.view.p, index: state.view.index })
      : ''
    if (inspector.textContent !== info) {
      inspector.textContent = info
    }
  }
  function preview() {
    state.boardChanged = true
    inspectHover()
    board.setBeaconFocus(Option.getOrUndefined(state.hovered), Option.getOrUndefined(state.selectedBeacon))
    const direction = element('direction')
    direction.hidden = state.tool === 'select' || state.tool === 'erase' || state.tool === 'trash'
    direction.textContent =
      state.tool === 'beacon' ? 'Boosts Extractors and Combiners' : 'Facing ' + state.facing + ' · R to rotate'
    rotateButton.hidden = direction.hidden || state.tool === 'beacon'
    if (rotateLabel.data !== state.facing) {
      rotateLabel.data = state.facing
      rotateButton.setAttribute('aria-label', 'Rotate clockwise. Facing ' + state.facing)
    }
    for (const { badge } of portBadges) {
      badge.visible = false
    }
    board.beaconPreview.visible = false
    ghost.visible = false
    border.clear()
    measurement.hidden = true
    const stroke = Option.getOrUndefined(state.pendingStroke)
    if (stroke?.tool === 'belt' && Option.isSome(stroke.cell) && stroke.route.length > 0) {
      border.moveTo((stroke.cell.value.gx + 0.5) * tile, (stroke.cell.value.gy + 0.5) * tile)
      for (const cell of stroke.route) {
        border.lineTo((cell.gx + 0.5) * tile, (cell.gy + 0.5) * tile)
      }
      border.stroke({ width: 4, color: 0x7c_e3_b6, alpha: 0.8 })
    }
    if (Option.isSome(state.beltDrag)) {
      const { minX, maxX, minY, maxY } = state.beltDrag.value.bounds
      measure(maxX - minX + 1, maxY - minY + 1, state.beltDrag.value.placed, 'new belt')
    }
    const at = board.buildingAt(state.view.index.buildings)
    for (const node of board.buildings.children) {
      if (node.state.kind !== 'tunnelIn') {
        continue
      }
      const cell = { gx: Math.floor(node.x / tile), gy: Math.floor(node.y / tile) }
      const partner = findTunnelPartner({ cell, facing: node.facing, at })
      if (
        partner !== undefined &&
        (state.tool === 'tunnel' ||
          Option.exists(state.hovered, (h) => key(h) === key(cell) || key(h) === key(partner)))
      ) {
        link(cell, partner)
      }
    }
    if (Option.isNone(state.hovered)) {
      return
    }
    if (Option.isSome(state.eraseStart)) {
      const { minX, maxX, minY, maxY } = area({ start: state.eraseStart.value, end: state.hovered.value })
      const w = maxX - minX + 1,
        h = maxY - minY + 1
      border
        .rect(minX * tile, minY * tile, w * tile, h * tile)
        .setFillStyle({ color: 0xe5_4a_48, alpha: 0.3 })
        .fill()
        .stroke({ width: 3, color: 0xff_79_75 })
      let count = 0
      for (let gx = minX; gx <= maxX; gx++) {
        for (let gy = minY; gy <= maxY; gy++) {
          const machine = machineAt({ gx, gy })
          if (machine !== undefined && machine.state.kind !== 'hub') {
            count++
          }
        }
      }
      measure(w, h, count, 'building')
      return
    }
    if (state.tool === 'select') {
      const machine = machineAt(state.hovered.value)
      if (machine !== undefined) {
        previewPorts(machine.state, state.hovered.value, machine.facing, 0.72)
      }
      return
    }
    const k = key(state.hovered.value),
      occupied = state.view.index.buildings[k] !== undefined
    const valid =
      state.tool === 'erase'
        ? occupied && machineAt(state.hovered.value)?.state.kind !== 'hub'
        : Arr.some(tools, (item) => item.id === state.tool && item.unlock <= state.view.p.milestoneIndex) &&
          inBounds(state.hovered.value, state.view.p.boardTier) &&
          (!occupied || (state.tool === 'belt' && machineAt(state.hovered.value)?.state.kind === 'belt')) &&
          (state.tool !== 'extractor' || state.view.index.veins[k] !== undefined)
    const color = valid ? 0x7c_e3_b6 : 0xf1_7a_75
    const x = (state.hovered.value.gx + 0.5) * tile,
      y = (state.hovered.value.gy + 0.5) * tile
    const wash = { color, alpha: 0.16 }
    border
      .roundRect(x - 23, y - 23, 46, 46, 5)
      .setFillStyle(wash)
      .fill()
      .stroke({ width: 2, color })
    const tunnel = state.tool === 'tunnel' ? tunnelAt(state.hovered.value) : undefined
    if (valid && tunnel?.partner !== undefined) {
      link(state.hovered.value, tunnel.partner)
    }
    const building = ghostState({
      tool: state.tool === 'tunnel' ? (tunnel?.kind ?? 'tunnelIn') : state.tool,
      targetValue: primaryTarget(),
    })
    if (Option.isSome(building)) {
      ghost.update(building.value, state.facing)
      ghost.animate(state.view.tick, state.view.p)
      ghost.alpha = 0.67
      ghost.tint = color
      ghost.position.set(x, y)
      ghost.visible = true
      if (building.value.kind === 'beacon') {
        board.beaconPreview.position.set(x, y)
        board.beaconPreview.visible = true
      }
      previewPorts(building.value, state.hovered.value, state.facing, 0.92)
    }
  }
  return { preview, inspectHover, ghost, measurement, rotateButton }
}

import { milestone } from '@garage/beltworks-domain'
import * as Arr from 'effect/Array'
import * as Option from 'effect/Option'
import { Graphics } from 'pixi.js'

import type { Factory } from './factory.ts'
import { element } from './hud.ts'
import { tile } from './machines.ts'
import { starterGuide } from './onboarding.ts'
import { portColors } from './tools.ts'
const cellOf = (node: { x: number; y: number }) => ({ gx: Math.floor(node.x / tile), gy: Math.floor(node.y / tile) })

export function createGuide({ board, state, inspection }: Factory) {
  const hint = element('starter-hint')
  const hintText = element('starter-message')
  const dismissHint = element('dismiss-starter')
  const guideArrows = board.preview.addChildAt(new Graphics(), 0)
  let dismissedMilestone = Option.none<number>()
  const quota = milestone(0).requirements[0]?.quota ?? 8
  const touch = window.matchMedia('(pointer: coarse)')
  function currentGuide() {
    if (inspection.visiting || state.view.p.milestoneIndex > 1) {
      return { step: 'hidden' } as const
    }
    const vein = (value: string) =>
      Option.map(
        Arr.findFirst(board.veins.children, (node) => node.visible && node.label === value),
        cellOf
      )
    const combiners = Arr.flatMap(board.buildings.children, (node) =>
      node.state.kind === 'combiner' ? [{ ...cellOf(node), dir: node.facing, op: node.state.op }] : []
    )
    return starterGuide({
      p: state.view.p,
      vein: vein('1'),
      two: vein('2'),
      combiners,
      dismissed: Option.contains(dismissedMilestone, state.view.p.milestoneIndex),
      at: board.buildingAt(state.view.index.buildings),
      hasThree: state.view.p.milestoneIndex === 1 && Arr.some(board.items.children, (item) => item.value === 3),
    })
  }
  let guide = currentGuide()
  dismissHint.onclick = () => {
    dismissedMilestone = Option.some(state.view.p.milestoneIndex)
    animateBoard()
  }
  function animateBoard(updateGuide = true) {
    state.boardChanged = true
    if (updateGuide) {
      guide = currentGuide()
    }
    if (guide.step === 'hidden' && hint.hidden === true) {
      board.animate(state.view.tick, state.view.p)
      return
    }
    const message = {
      extract: '1. ' + (touch.matches ? 'Tap' : 'Click') + ' vein 1 to place Extractor',
      connect: '2. Drag belts right into the Hub',
      flowing: 'Flowing! Deliver ' + quota + ' to unlock Adder (+)',
      'mine-two': 'Mine vein 2 · Select Extractor',
      'place-adder': 'Place an Adder (+) facing north. Feed 1 into A (left) and 2 into B (right).',
      'back-belt': 'The back is blocked. Feed the Combiner from the left (A) and right (B).',
      recipe: '1 + 2 = 3 · Feed the side inputs. Send the output to the Hub.',
      waiting: '',
      hidden: '',
    }[guide.step]
    if (hintText.textContent !== message) {
      hintText.textContent = message
      hint.hidden = message.length === 0
      dismissHint.hidden = hint.hidden
      hint.dataset.step = guide.step
    }
    if (guideArrows.context.instructions.length > 0) {
      guideArrows.clear()
    }
    if (guide.step === 'place-adder') {
      for (const [cells, color] of [
        [guide.a, portColors.a],
        [guide.b, portColors.b],
      ] as const) {
        const first = cells[0]
        if (first === undefined) {
          continue
        }
        guideArrows.moveTo((first.gx + 0.5) * tile, (first.gy + 0.5) * tile)
        for (const cell of cells.slice(1)) {
          guideArrows.lineTo((cell.gx + 0.5) * tile, (cell.gy + 0.5) * tile)
        }
        guideArrows.stroke({ width: 6, color, alpha: 0.5 })
      }
      const x = (guide.cell.gx + 0.5) * tile,
        y = (guide.cell.gy + 0.5) * tile
      for (const offset of [-19, -4, 11]) {
        guideArrows
          .moveTo(x + offset, y - 19)
          .lineTo(x + offset + 8, y - 19)
          .moveTo(x + offset, y + 19)
          .lineTo(x + offset + 8, y + 19)
          .moveTo(x - 19, y + offset)
          .lineTo(x - 19, y + offset + 8)
          .moveTo(x + 19, y + offset)
          .lineTo(x + 19, y + offset + 8)
      }
      guideArrows
        .moveTo(x - 6, y)
        .lineTo(x + 6, y)
        .moveTo(x, y - 6)
        .lineTo(x, y + 6)
        .stroke({ color: portColors.output, width: 2, alpha: 0.8 })
    }
    if (guide.step === 'back-belt' || guide.step === 'mine-two') {
      const cell = guide.step === 'mine-two' ? guide.vein : guide.cell
      const pulse = 0.5 + 0.5 * Math.sin(state.view.tick * 0.07)
      guideArrows
        .circle((cell.gx + 0.5) * tile, (cell.gy + 0.5) * tile, 19 + 3 * pulse)
        .stroke({ color: portColors.b, width: 3, alpha: 0.6 + 0.4 * pulse })
    }
    if (guide.step === 'connect') {
      for (const cell of guide.cells) {
        const pulse = (state.view.tick % 45) / 45
        const x = (cell.gx + 0.5) * tile + pulse * 5 - 2.5
        const y = (cell.gy + 0.5) * tile
        guideArrows
          .moveTo(x - 17, y)
          .lineTo(x - 12, y)
          .moveTo(x - 7, y)
          .lineTo(x + 11, y)
          .moveTo(x + 3, y - 7)
          .lineTo(x + 11, y)
          .lineTo(x + 3, y + 7)
          .stroke({ color: 0x87_ff_d6, width: 3, alpha: 0.8 + 0.2 * Math.sin(pulse * Math.PI) })
      }
    }
    board.animate(state.view.tick, state.view.p, guide.step === 'extract')
  }
  function positionGuide() {
    if (guide.step === 'extract' || guide.step === 'mine-two') {
      const x = board.world.x + (guide.vein.gx + 0.5) * tile * board.world.scale.x
      const y = board.world.y + (guide.vein.gy - 0.25) * tile * board.world.scale.y
      hint.style.setProperty('--anchor-x', x + 'px')
      hint.style.setProperty('--anchor-y', y + 'px')
    }
  }
  return {
    animateBoard,
    positionGuide,
    get current() {
      return guide
    },
    get dismissed() {
      return dismissedMilestone
    },
    set dismissed(value) {
      dismissedMilestone = value
    },
  }
}

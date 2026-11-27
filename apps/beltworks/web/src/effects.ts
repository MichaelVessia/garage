import {
  CommandRejected,
  MedalUnlocked,
  Game,
  ItemCrafted,
  ItemDelivered,
  MilestoneCompleted,
  columns,
  milestone,
  key,
  offsets,
  rows,
} from '@garage/beltworks-domain'
import * as Arr from 'effect/Array'
import { Graphics, GraphicsContext } from 'pixi.js'
import type { Container } from 'pixi.js'

import type { createAudio } from './audio.ts'
import type { Factory } from './factory.ts'
import { element } from './hud.ts'
import { label, tile, oreColor } from './machines.ts'
import { medalInfo } from './medals.ts'
let noticeTimer = 0
export function notify(message: string) {
  element('notice').textContent = message
  window.clearTimeout(noticeTimer)
  noticeTimer = window.setTimeout(() => {
    element('notice').textContent = ''
  }, 2600)
}
let bannerTimer = 0
function milestoneBanner(index: number, bonus: number) {
  const banner = element('milestone-banner')
  element('milestone-title').textContent = 'Milestone ' + (index + 1) + ' Complete! · +' + bonus + ' ✦ Bonus'
  element('milestone-reward').textContent =
    index === 0 ? 'Unlocked Adder (+) & Speed Upgrades' : milestone(index).reward
  element('quick-upgrade').hidden = index !== 0
  banner.hidden = false
  window.clearTimeout(bannerTimer)
  bannerTimer = window.setTimeout(() => {
    banner.hidden = true
  }, 5000)
}
export function createEffects({
  factory: { board, state },
  audio: { chime, celebrate, scale },
}: {
  factory: Factory
  audio: ReturnType<typeof createAudio>
}) {
  const hubCell = key({ gx: columns / 2 - 1, gy: rows / 2 - 1 })
  const hubX = (columns / 2) * tile
  const hubY = (rows / 2) * tile
  let lastDeliveryChime = -Infinity
  let deliveryNote = 0
  let lastIntake = -Infinity
  const spark = new GraphicsContext().poly([0, -5, 2.3, 0, 0, 5, -2.3, 0]).fill(0xff_ff_ff)
  const intakeRing = new GraphicsContext().circle(0, 0, 16).stroke({ color: 0xff_ff_ff, width: 2 })
  const milestoneRing = new GraphicsContext().circle(0, 0, 54).stroke({ color: 0xff_ff_ff, width: 5 })
  function emit(node: Container, dx: number, dy: number, ring: boolean, duration: number) {
    return board.fx.addChild(Object.assign(node, { born: performance.now(), dx, dy, ring, duration }))
  }
  function burst(x: number, y: number, count: number, color: number, ripple: 'none' | 'intake' | 'milestone') {
    const milestoneBurst = ripple === 'milestone'
    const reach = milestoneBurst ? 106 : 32
    const duration = milestoneBurst ? 820 : 420
    for (let i = 0; i < count; i++) {
      const angle = (i * Math.PI * 2) / count + (performance.now() % 1000) / 1000
      const node = new Graphics({ context: spark, rotation: angle, tint: color })
      emit(node, Math.cos(angle) * reach, Math.sin(angle) * reach, false, duration).position.set(x, y)
    }
    if (ripple !== 'none') {
      const ring = new Graphics({ context: milestoneBurst ? milestoneRing : intakeRing, tint: color })
      emit(ring, 0, 0, true, duration).position.set(x, y)
    }
  }
  let rejected = false
  const observe = Game.Schedule(
    Game.System(
      'Beltworks/Feedback',
      {
        events: {
          delivery: Game.System.readEvent(ItemDelivered),
          craft: Game.System.readEvent(ItemCrafted),
          complete: Game.System.readEvent(MilestoneCompleted),
          medal: Game.System.readEvent(MedalUnlocked),
          reject: Game.System.readEvent(CommandRejected),
        },
      },
      ({ events }) => {
        for (const delivery of events.delivery.all()) {
          lastIntake = performance.now()
          const x = (delivery.gx + 0.5) * tile
          const y = (delivery.gy + 0.5) * tile
          const side = offsets[delivery.intakeSide]
          const edgeX = x + (side.gx * tile) / 2
          const edgeY = y + (side.gy * tile) / 2
          burst(edgeX, edgeY, 4, oreColor(delivery.value), 'intake')
          if (delivery.sparksEarned > 0) {
            const gain = label({ text: '+' + delivery.sparksEarned + ' ✦', size: 18, fill: 0xff_df_88 })
            emit(gain, 0, -38, false, 720).position.set(x, y - 12)
          }
          if (delivery.matchedTarget && lastIntake - lastDeliveryChime >= 110) {
            if (lastIntake - lastDeliveryChime >= 4000) {
              deliveryNote = 0
            }
            chime((scale[deliveryNote % 5] ?? 440) * (deliveryNote < 5 ? 1 : 2))
            deliveryNote = (deliveryNote + 1) % 8
            lastDeliveryChime = lastIntake
          }
        }
        for (const craft of events.craft.all()) {
          const color = oreColor(craft.result)
          burst(
            (craft.gx + 0.5) * tile,
            (craft.gy + 0.5) * tile,
            craft.firstTarget ? 10 : 4,
            color,
            craft.firstTarget ? 'intake' : 'none'
          )
          if (craft.firstTarget) {
            notify('First ' + craft.result + ' crafted!')
          }
        }
        for (const event of events.complete.all()) {
          burst(hubX, hubY, 20, 0xff_cd_58, 'milestone')
          celebrate()
          milestoneBanner(event.milestoneIndex, event.bonusSparks)
        }
        const medals = events.medal.all()
        if (medals.length > 0 && events.complete.all().length === 0) {
          notify(
            'Medal · ' +
              Arr.join(
                Arr.map(medals, (event) => medalInfo[event.medal][0]),
                ' + '
              )
          )
          celebrate(523.25)
        }
        for (const event of events.reject.all()) {
          rejected = true
          notify(event.reason)
        }
      }
    )
  )
  function animateEffects(now: number) {
    for (let i = board.mounting.length - 1; i >= 0; i--) {
      const node = board.mounting[i]
      if (node === undefined) {
        continue
      }
      const t = (now - node.mounted) / 140
      if (node.destroyed || t >= 1) {
        board.mounting.splice(i, 1)
        if (!node.destroyed) {
          node.scale.set(1)
        }
      } else {
        state.boardChanged = true
        node.scale.set(
          t < 0.68 ? 0.78 + 0.27 * Math.sin(((t / 0.68) * Math.PI) / 2) : 1.05 - (0.05 * (t - 0.68)) / 0.32
        )
      }
      if (node.state.kind === 'belt' && !node.destroyed) {
        board.resizeBelt(node)
      }
    }
    const intake = (now - lastIntake) / 230
    const hubId = state.view.index.buildings[hubCell]
    const hub = hubId === undefined ? undefined : board.machines.get(hubId)
    if (hub !== undefined && intake < 1) {
      state.boardChanged = true
      hub.scale.set(1 + 0.12 * Math.sin(Math.PI * intake) * (1 - intake))
    } else if (hub !== undefined && now - hub.mounted >= 140 && hub.scale.x !== 1) {
      hub.scale.set(1)
    }
    for (let i = board.fx.children.length - 1; i >= 0; i--) {
      state.boardChanged = true
      const node = board.fx.getChildAt(i)

      const t = Math.min(1, (now - node.born) / node.duration)
      node.position.x += node.dx * (node.alpha - (1 - t))
      node.position.y += node.dy * (node.alpha - (1 - t))
      node.scale.set(node.ring ? 0.6 + t * 1.4 : 1 - t * 0.45)
      node.alpha = 1 - t
      if (t === 1) {
        node.destroy({ children: true })
      }
    }
  }
  return {
    observe,
    animateEffects,
    get rejected() {
      return rejected
    },
    resetRejection() {
      rejected = false
    },
  }
}

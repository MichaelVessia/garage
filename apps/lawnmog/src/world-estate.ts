import { Container3D } from '@pixi/3d'
import * as Arr from 'effect/Array'
import * as Option from 'effect/Option'

import type { BlockView } from './model.ts'
import { estateColumn, spacing } from './street-layout.ts'
import { cottage, panel, solid } from './world-art.ts'
import { gardener } from './world-gardener.ts'
import { awardPosition, ceremonyRoute } from './world-judging.ts'
import { equipment } from './world-tools.ts'

function plaque(parent: Container3D, title: string, subtitle: string, y: number, width: number) {
  const face = panel(parent, 0, y, 0, width, width * 0.3, 512, 154)
  function write(caption: string, color: string) {
    const ctx = face.ctx
    ctx.fillStyle = color
    ctx.fillRect(0, 0, 512, 154)
    ctx.strokeStyle = '#e9c77e'
    ctx.lineWidth = 5
    ctx.strokeRect(5, 5, 502, 144)
    ctx.textAlign = 'center'
    ctx.fillStyle = '#ffefc3'
    ctx.font = 'bold 62px Georgia'
    ctx.fillText(title, 256, 74, 478)
    ctx.font = 'bold 36px sans-serif'
    ctx.fillText(caption, 256, 125, 476)
    face.texture.source.update()
  }
  write(subtitle, '#203d36')
  return { ...face, write }
}

export function createEstate(root: Container3D) {
  const yard = root.addChild(new Container3D({ x: estateColumn * spacing }))
  solid(yard, 0x72_98_50, 0, -0.2, -2, 14, 0.38, 15)
  solid(yard, 0xd6_cb_b2, 0, -0.04, 6, 14, 0.13, 2)
  solid(yard, 0x45_53_59, 0, -0.21, 12, 14, 0.18, 10)
  solid(yard, 0xe4_c5_79, 0, -0.11, 12, 2.8, 0.02, 0.11)
  const house = yard.addChild(new Container3D())
  house.scale.set(1.4, 1.36, 1)
  cottage({ parent: house, id: 3 })
  // The front gable projects from the roof above the entrance.
  solid(house, 0xea_d6_ad, 0, 4.32, -6.5, 2.2, 1.48, 2.3)
  solid(house, 0xfa_e9_c8, 0, 4.46, -5.31, 1.36, 1.09, 0.15)
  solid(house, 0x5f_91_a1, 0, 4.46, -5.21, 1.15, 0.9, 0.07)
  solid(house, 0xfa_e9_c8, 0, 4.46, -5.16, 0.09, 0.94, 0.04)
  solid(house, 0xfa_e9_c8, 0, 4.46, -5.16, 1.18, 0.08, 0.04)
  for (let course = 0; course < 5; course++) {
    solid(house, 0xea_d6_ad, 0, 5.1 + course * 0.09, -5.38, 1.96 - course * 0.36, 0.12, 0.18)
  }
  for (const side of [-1, 1]) {
    solid(house, 0x57_5e_68, side * 0.6, 5.24, -6.43, 1.52, 0.19, 2.78).rotation.z = -side * 0.49
  }
  for (let row = 0; row < 8; row++) {
    solid(yard, row % 2 === 0 ? 0x4d_95_46 : 0x75_aa_50, 0, 0.01, row * 1.25 - 4.375, 10, 0.04, 1.25)
  }
  for (const side of [-1, 1]) {
    for (let i = 0; i < 4; i++) {
      solid(yard, 0x31_64_48, side * 5.8, 0.45, 4 - i * 2.5, 1, 0.9, 2.35)
      solid(yard, 0x48_7d_4b, side * 5.8, 1.02, 4 - i * 2.5, 0.9, 1.1, 0.9, 'leaf')
    }
  }
  const sign = yard.addChild(new Container3D({ x: -3.9, z: 5.4 }))
  solid(sign, 0x81_58_38, 0, 0.56, -0.08, 0.16, 1.12, 0.16)
  const estateSign = plaque(sign, 'The Standards Committee', 'RESIDENCE OF THE HOA PRESIDENT', 1.35, 3)
  const karen = gardener({ parent: root, shirt: 0xb0_44_68, inspector: true, grips: [{ x: 0.32, y: 1, z: -0.43 }] })
  karen.node.position.set(1.5, 0, 4.7)
  const award = root.addChild(new Container3D())
  solid(award, 0xb0_81_28, 0, 0.69, 0, 0.13, 1.38, 0.14)
  solid(award, 0xfc_cc_54, 0, 1.29, 0, 2.28, 0.85, 0.12)
  const ribbon = panel(award, 0, 1.29, 0.07, 2.17, 0.76, 512, 178)
  const ink = ribbon.ctx
  ink.fillStyle = '#ffe19a'
  ink.fillRect(0, 0, 512, 178)
  ink.strokeStyle = '#9e712a'
  ink.lineWidth = 7
  ink.strokeRect(7, 7, 498, 164)
  ink.textAlign = 'center'
  ink.fillStyle = '#61411b'
  ink.font = 'bold 28px Georgia'
  ink.fillText('★  CLOVER LANE  ★', 256, 51)
  ink.font = 'bold 56px Georgia'
  ink.fillText('Yard of the Week', 256, 128, 470)
  ribbon.texture.source.update()
  let winningIndex = -1
  let inspect = ceremonyRoute({ lots: [], nextJudgingAt: 0, yardWinner: null })
  const chair = plaque(karen.node, 'Karen', 'HOA PRESIDENT', 2.13, 1.6)
  const brows = Arr.map([-1, 1], (side) => {
    solid(karen.head, 0x33_29_23, side * 0.092, 0.018, -0.177, 0.033, 0.036, 0.019)
    return solid(karen.head, 0x74_49_32, side * 0.097, 0.065, -0.181, 0.12, 0.029, 0.024)
  })
  const blush = solid(karen.head, 0xe5_76_65, 0, -0.045, -0.176, 0.31, 0.054, 0.018)
  const pile = yard.addChild(new Container3D({ x: 0.15, z: 4.05 }))
  const fallen = [0xbd_56_22, 0xe6_9a_37, 0xad_48_26, 0xd6_73_2a]
  for (let i = 0; i < 22; i++) {
    const angle = i * 2.4,
      radius = Math.sqrt(i / 22) * 0.87
    const leaf = solid(
      pile,
      fallen[i % 4] ?? 0xc4_6c_2a,
      Math.cos(angle) * radius,
      0.09 + (1 - radius) * 0.17,
      Math.sin(angle) * radius,
      0.38,
      0.1,
      0.23,
      'leaf'
    )
    leaf.rotation.y = angle
    leaf.rotation.z = Math.cos(angle) * 0.3
  }
  const moods = [
    ['HOA PRESIDENT', '#203d36'],
    ['I SAW THAT.', '#774d32'],
    ['CITATION ISSUED', '#903f30'],
    ['EMERGENCY BOARD MEETING', '#ac322f'],
  ] as const
  let lastMood = -1,
    lastLeaves = -1,
    lastCaption = ''
  const crew = Arr.map(['Jorge', 'Miguel'] as const, (name, i) => {
    const node = yard.addChild(new Container3D({ x: -2.2 + 4.4 * i }))
    const tool = equipment({ parent: node, tool: i === 0 ? 'reel' : 'hose' })
    const body = gardener({ parent: node, shirt: i === 0 ? 0x48_86_94 : 0xcc_90_47, grips: tool.grips })
    const label = plaque(node, name, i === 0 ? 'MOWING' : 'WATERING', 2.12, 1.38)
    return { node, body, tool, label }
  })
  return {
    setJudging(view: Pick<BlockView, 'lots' | 'nextJudgingAt' | 'yardWinner'>) {
      inspect = ceremonyRoute(view)
      winningIndex = Option.getOrElse(
        Arr.findFirstIndex(view.lots, (lot) => lot.id === view.yardWinner),
        () => -1
      )
    },
    update(t: number, dt: number, x: number, z: number, anger: number, estateLeaves: number) {
      yard.visible = Math.abs(x - yard.x) < spacing * 4
      const pose = inspect(performance.timeOrigin + performance.now())
      if (winningIndex >= 0) {
        const sign = awardPosition(winningIndex)
        const size = pose.planted ? 1 : 0.7
        award.scale.set(size, size, size)
        award.position.set(
          pose.planted ? sign.x : pose.x + 0.43 * Math.cos(pose.facing),
          pose.planted ? 0 : 0.52,
          pose.planted ? sign.z : pose.z - 0.43 * Math.sin(pose.facing)
        )
        award.rotation.y = pose.planted ? (sign.side === 1 ? 0 : Math.PI) : pose.facing
      }
      award.visible = winningIndex >= 0 && Math.abs(x - award.x) < spacing * 4
      karen.node.visible = Math.abs(x - pose.x) < spacing * 4
      karen.node.x = pose.x
      karen.node.z = pose.z
      const mood = Math.min(3, Math.ceil(anger / 35))
      if (mood !== lastMood || lastCaption !== pose.caption) {
        const [caption, color] = moods[mood] ?? moods[0]
        chair.write(pose.caption === '' ? caption : pose.caption, color)
        lastCaption = pose.caption
        blush.visible = mood > 0
        for (const [i, brow] of brows.entries()) {
          brow.rotation.z = (i === 0 ? -1 : 1) * mood * 0.19
        }
        lastMood = mood
      }
      if (lastLeaves !== estateLeaves) {
        pile.visible = estateLeaves > 0
        const size = 0.25 + Math.min(1.6, Math.sqrt(estateLeaves / 65))
        pile.scale.set(size, size, size)
        lastLeaves = estateLeaves
      }
      const stamp = Math.sin(t * (2.8 + mood))
      karen.stride(pose.walking ? Math.sin(t * 8) : mood * 0.27 * stamp)
      karen.head.rotation.y = mood * 0.07 * stamp
      karen.head.rotation.x = -mood * 0.065
      karen.node.y = Math.max(0, stamp) * 0.023 * mood
      const localX = x - yard.x
      const facing = Math.atan2(x - karen.node.x, z - karen.node.z)
      karen.node.rotation.y = pose.caption !== '' ? pose.facing : facing + Math.PI
      chair.mesh.rotation.y = facing - karen.node.rotation.y
      if (!yard.visible) {
        return
      }
      for (const [i, member] of crew.entries()) {
        const phase = t * 0.38 + i * Math.PI
        member.node.z = Math.sin(phase) * 2.65
        member.node.rotation.y = Math.cos(phase) < 0 ? 0 : Math.PI
        member.body.stride(Math.sin(t * 5 + i))
        member.tool.animate(t, dt * Math.abs(Math.cos(phase)), dt, true)
        member.label.mesh.rotation.y = Math.atan2(localX - member.node.x, z - member.node.z) - member.node.rotation.y
      }
    },
    dispose() {
      ribbon.dispose()
      estateSign.dispose()
      chair.dispose()
      for (const member of crew) {
        member.label.dispose()
      }
    },
  }
}

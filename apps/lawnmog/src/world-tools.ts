import { Container3D } from '@pixi/3d'
import * as Arr from 'effect/Array'

import { solid } from './world-art.ts'
import type { Grip } from './world-gardener.ts'

export type { Tool as WorldTool } from './model.ts'
import type { Tool as WorldTool } from './model.ts'
export const reach = 1.7
const iron = 0x35_46_40,
  steel = 0xaa_a9_94,
  rubber = 0x29_34_32,
  red = 0xb9_53_39,
  gold = 0xf0_b9_59
function tire(parent: Container3D, x: number, z: number, r: number) {
  solid(parent, rubber, x, r, z, r * 2, 0.2, r * 2, 'round').rotation.z = Math.PI / 2
  // Cylinder height lies along local Y.
  const hub = solid(parent, steel, x + Math.sign(x) * 0.07, r, z, r * 0.86, 0.13, r * 0.86, 'round')
  hub.rotation.z = Math.PI / 2
}
function reelMower(node: Container3D) {
  const reel = node.addChild(new Container3D({ y: 0.24, z: -reach }))
  for (const side of [-1, 1]) {
    tire(node, side * 0.48, -reach, 0.245)
    solid(node, red, side * 0.38, 0.25, -reach, 0.07, 0.12, 0.55)
    solid(node, steel, side * 0.29, 0.72, -1.29, 0.05, 1.28, 0.05).rotation.x = 0.7
    solid(reel, red, side * 0.31, 0, 0, 0.36, 0.045, 0.36, 'round').rotation.z = Math.PI / 2
  }
  solid(node, rubber, 0, 1.2, -0.89, 0.68, 0.06, 0.06)
  solid(node, steel, 0, 0.105, -reach + 0.2, 0.79, 0.045, 0.14)
  solid(reel, iron, 0, 0, 0, 0.91, 0.075, 0.075)
  for (let blade = 0; blade < 5; blade++) {
    for (let section = 0; section < 3; section++) {
      const angle = (blade * Math.PI * 2) / 5 + (section - 1) * 0.4
      const mount = reel.addChild(new Container3D({ x: (section - 1) * 0.22 }))
      mount.rotation.x = angle
      solid(mount, steel, 0, 0.17, 0, 0.24, 0.032, 0.06).rotation.y = -0.31
    }
  }
  return reel
}

const canGrip = { x: 0.32, y: 1.02, z: -0.79 }
const rose = { y: -0.09, z: -0.62 }
function wateringCan(node: Container3D) {
  const can = node.addChild(new Container3D(canGrip))
  const green = 0x47_91_79
  solid(can, green, 0, -0.32, 0, 0.37, 0.35, 0.52, 'round')
  solid(can, steel, 0, -0.15, 0, 0.37, 0.035, 0.52, 'round')
  solid(can, iron, 0, -0.13, 0, 0.24, 0.02, 0.36, 'round')
  for (const z of [-0.17, 0.17]) {
    solid(can, green, 0, -0.075, z, 0.055, 0.18, 0.055)
  }
  solid(can, rubber, 0, 0, 0, 0.07, 0.065, 0.38)
  solid(can, green, 0, -0.24, -0.4, 0.09, 0.51, 0.1, 'round').rotation.x = -0.93
  solid(can, gold, 0, rose.y, rose.z, 0.21, 0.075, 0.2, 'round').rotation.x = -0.93
  return can
}

function rod(parent: Container3D, from: Grip, to: Grip, radius: number, color: number) {
  const dx = to.x - from.x,
    dy = to.y - from.y,
    dz = to.z - from.z
  const length = Math.hypot(dx, dy, dz)
  const joint = parent.addChild(
    new Container3D({ x: (from.x + to.x) / 2, y: (from.y + to.y) / 2, z: (from.z + to.z) / 2 })
  )
  joint.rotation.y = Math.atan2(dx, dz)
  solid(joint, color, 0, 0, 0, radius * 2, length, radius * 2, 'round').rotation.x = Math.acos(dy / length)
}

function spreaderModel(node: Container3D, broadcast: boolean) {
  const width = broadcast ? 0.67 : 0.93
  const paint = broadcast ? 0xdd_86_2e : 0x59_92_65
  for (const side of [-1, 1]) {
    tire(node, side * (width / 2 + 0.09), -reach, 0.22)
    rod(node, { x: side * 0.29, y: 1.19, z: -0.89 }, { x: side * 0.29, y: 0.22, z: -reach }, 0.025, steel)
  }
  solid(node, rubber, 0, 1.2, -0.89, 0.68, 0.065, 0.065)
  const shape = broadcast ? 'round' : 'box'
  solid(node, paint, 0, 0.63, -reach, width, 0.34, 0.58, shape)
  solid(node, cream, 0, 0.81, -reach, width * 0.87, 0.038, 0.49, shape)
  solid(node, paint, 0, 0.42, -reach, width * 0.76, 0.18, 0.43, shape)
  solid(node, iron, 0, 0.28, -reach, broadcast ? 0.1 : width, 0.18, 0.17)
  if (broadcast) {
    const disc = node.addChild(new Container3D({ y: 0.23, z: -reach }))
    solid(disc, iron, 0, 0, 0, 0.68, 0.04, 0.68, 'round')
    solid(disc, gold, 0, 0.035, 0, 0.62, 0.055, 0.055)
    return disc
  }
  return undefined
}

const sprayGrip = { x: 0.32, y: 1.02, z: -0.65 }
const nozzle = { x: 0.23, y: 0.7, z: -1.49 }
const carryGrip = { x: -0.39, y: 0.91, z: -0.24 }
function sprayerModel(node: Container3D, backpack: boolean) {
  const x = backpack ? 0 : carryGrip.x
  const y = backpack ? 1.05 : 0.54
  const z = backpack ? 0.27 : carryGrip.z
  const width = backpack ? 0.58 : 0.29
  solid(node, 0xa7_d0_b9, x, y, z, width, 0.51, 0.32, 'round')
  solid(node, 0x2e_73_69, x, y - 0.24, z, width, 0.12, 0.33, 'round')
  solid(node, iron, x, y + 0.28, z, width * 0.64, 0.1, 0.21, 'round')
  if (backpack) {
    for (const side of [-1, 1]) {
      solid(node, rubber, side * 0.18, 1.37, -0.02, 0.07, 0.06, 0.48)
      solid(node, rubber, side * 0.18, 1.16, -0.24, 0.07, 0.48, 0.05)
    }
  } else {
    solid(node, steel, x, y + 0.34, z, 0.047, 0.08, 0.047)
    solid(node, rubber, carryGrip.x, carryGrip.y, carryGrip.z, 0.22, 0.052, 0.06)
  }
  const bend = { x: 0.33, y: 0.54, z: -0.27 }
  rod(node, { x: x + width / 2, y: y - 0.1, z }, bend, 0.023, rubber)
  rod(node, bend, sprayGrip, 0.023, rubber)
  rod(node, sprayGrip, nozzle, 0.019, steel)
  solid(node, iron, sprayGrip.x, sprayGrip.y, sprayGrip.z, 0.1, 0.12, 0.18)
  solid(node, gold, nozzle.x, nozzle.y, nozzle.z, backpack ? 0.17 : 0.09, 0.07, 0.09)
}

function rakeModel(node: Container3D) {
  const grip = { x: 0.22, y: 1.13, z: -0.58 }
  const shaft = node.addChild(new Container3D(grip))
  const socket = { x: -0.15, y: -0.89, z: -1.08 }
  rod(shaft, { x: 0.04, y: 0.23, z: 0.28 }, socket, 0.028, 0xa7_78_47)
  for (let tooth = -5; tooth <= 5; tooth++) {
    const tip = { x: socket.x + tooth * 0.078, y: -1.09, z: -1.4 + Math.abs(tooth) * 0.016 }
    rod(shaft, socket, tip, 0.013, steel)
    solid(shaft, iron, tip.x, tip.y + 0.005, tip.z + 0.045, 0.027, 0.03, 0.105)
  }
  solid(shaft, red, socket.x, -1.015, -1.27, 0.58, 0.052, 0.06)
  return {
    node,
    grips: [grip],
    animate(t: number, _distance: number, dt: number, working: boolean) {
      const phase = t * Math.PI * 2
      const blend = 1 - Math.exp(-dt * 16)
      shaft.rotation.x += ((working ? (1 - Math.cos(phase)) * 0.13 : 0.16) - shaft.rotation.x) * blend
      shaft.rotation.y += ((working ? Math.sin(phase) * 0.27 : 0) - shaft.rotation.y) * blend
    },
  }
}

function blowerModel(node: Container3D, backpack: boolean) {
  const grip = { x: 0.35, y: 0.95, z: -0.58 }
  const casing = backpack ? red : 0xe3_98_42
  const tubeStart = { x: 0.38, y: 0.8, z: -0.62 }
  const nozzle = { x: 0.31, y: 0.35, z: -1.62 }
  if (backpack) {
    solid(node, rubber, 0, 1.1, 0.17, 0.58, 0.73, 0.18)
    solid(node, casing, 0, 1.22, 0.35, 0.64, 0.52, 0.4, 'round')
    solid(node, cream, 0, 0.88, 0.36, 0.53, 0.17, 0.36)
    for (const side of [-1, 1]) {
      solid(node, rubber, side * 0.19, 1.39, -0.07, 0.08, 0.075, 0.44)
      solid(node, rubber, side * 0.19, 1.15, -0.31, 0.08, 0.48, 0.05)
    }
    const elbow = { x: 0.51, y: 0.73, z: 0.05 }
    rod(node, { x: 0.26, y: 1, z: 0.33 }, elbow, 0.12, iron)
    rod(node, elbow, tubeStart, 0.093, rubber)
  } else {
    solid(node, casing, grip.x, 0.81, -0.48, 0.41, 0.23, 0.42, 'round').rotation.z = Math.PI / 2
    solid(node, rubber, grip.x + 0.12, 0.81, -0.48, 0.26, 0.034, 0.26, 'round').rotation.z = Math.PI / 2
    solid(node, iron, grip.x, 0.89, -0.38, 0.08, 0.18, 0.09)
  }
  rod(node, tubeStart, nozzle, backpack ? 0.097 : 0.078, rubber)
  solid(node, casing, grip.x, 0.88, grip.z, 0.11, 0.24, 0.13).rotation.x = -0.26
  solid(node, rubber, grip.x, grip.y, grip.z, 0.1, 0.08, 0.24)
  const leaves = Array.from({ length: backpack ? 16 : 9 }, (_, i) =>
    solid(node, i % 2 === 0 ? 0xcf_75_30 : 0xcd_9d_43, 0, 0, 0, 0.084, 0.018, 0.15, 'leaf')
  )
  return {
    node,
    grips: [grip],
    animate(t: number, _distance: number, _dt: number, working: boolean) {
      const throwDistance = backpack ? 3.7 : 2.1
      for (const [i, leaf] of leaves.entries()) {
        leaf.visible = working
        if (working) {
          const f = (t * 1.28 + i / leaves.length) % 1
          const spread = Math.cos(i * 3.79)
          leaf.position.set(
            nozzle.x + spread * (0.13 + f * 0.77),
            0.055 + Math.sin(f * Math.PI) * (0.44 + spread * 0.21),
            nozzle.z - f * throwDistance
          )
          leaf.rotation.x = t * 9 + i
          leaf.rotation.y = f * 5 + i
        }
      }
    },
  }
}

export function equipment({ parent, tool }: { parent: Container3D; tool: WorldTool }) {
  const node = parent.addChild(new Container3D())
  if (tool === 'rake') {
    return rakeModel(node)
  }
  if (tool === 'handheld-blower' || tool === 'backpack-blower') {
    return blowerModel(node, tool === 'backpack-blower')
  }
  const reel = tool === 'reel' ? reelMower(node) : undefined
  const can = tool === 'watering-can' ? wateringCan(node) : undefined
  const mowing = tool === 'reel' || tool === 'push' || tool === 'self-propelled' || tool === 'riding'
  const watering = tool === 'watering-can' || tool === 'hose' || tool === 'sprinkler' || tool === 'irrigation'
  const spreader = tool === 'drop-spreader' || tool === 'broadcast-spreader'
  const sprayer = tool === 'pump-sprayer' || tool === 'backpack-sprayer'
  const disc = spreader ? spreaderModel(node, tool === 'broadcast-spreader') : undefined
  if (sprayer) {
    sprayerModel(node, tool === 'backpack-sprayer')
  } else if (mowing && reel === undefined) {
    const riding = tool === 'riding',
      assisted = tool !== 'push'
    const body = riding ? 0x35_82_6a : assisted ? 0xda_92_3e : red
    const width = riding ? 1.25 : 0.9
    solid(node, iron, 0, 0.18, -reach, width + 0.08, 0.15, 0.76)
    solid(node, body, 0, 0.29, -reach, width, 0.2, 0.83)
    solid(node, iron, 0, 0.48, -reach, 0.54, 0.29, 0.49)
    solid(node, body, 0, 0.64, -reach, 0.52, 0.08, 0.48)
    for (let i = 0; i < 5; i++) {
      solid(node, iron, -0.16 + i * 0.08, 0.686, -reach, 0.036, 0.016, 0.27)
    }
    for (const x of [-1, 1]) {
      for (const z of [-0.27, 0.27]) {
        tire(node, x * width * 0.52, -reach + z, riding ? 0.23 : 0.15)
      }
      if (!riding) {
        solid(node, steel, 0.3 * x, 0.78, -1.29, 0.042, 1.17, 0.042).rotation.x = 0.76
      }
    }
    if (riding) {
      solid(node, body, 0, 0.59, -1.03, 0.74, 0.64, 0.96)
      solid(node, iron, 0, 1.01, -0.79, 0.14, 0.62, 0.13).rotation.x = 0.34
      solid(node, rubber, 0, 1.25, -0.72, 0.46, 0.055, 0.26, 'round')
      solid(node, iron, 0, 0.32, -0.3, 0.92, 0.11, 1.18)
      solid(node, body, 0, 0.53, -0.1, 0.47, 0.42, 0.64)
      solid(node, rubber, 0, 0.77, -0.08, 0.6, 0.13, 0.56)
      solid(node, rubber, 0, 0.94, 0.16, 0.6, 0.4, 0.1)
      for (const side of [-1, 1]) {
        tire(node, side * 0.47, 0.01, 0.32)
      }
      solid(node, cream, 0, 0.93, -1.02, 0.34, 0.02, 0.14)
    } else {
      solid(node, rubber, 0, 1.2, -0.89, 0.67, 0.055, 0.055)
      if (assisted) {
        solid(node, iron, 0, 0.43, -1.06, 0.59, 0.42, 0.72)
        solid(node, gold, 0.24, 1.24, -0.89, 0.13, 0.1, 0.1)
      }
    }
  } else if (!mowing && !spreader && can === undefined) {
    const equipmentColor = watering ? 0x46_84_76 : tool === 'feed' ? 0xe7_b4_4f : 0xae_72_59
    if (tool === 'feed' || tool === 'treat') {
      solid(node, equipmentColor, 0.36, 0.88, -0.8, 0.36, 0.49, 0.37, 'round')
      solid(node, cream, 0.36, 0.87, -0.8, 0.365, 0.17, 0.375, 'round')
      solid(node, iron, 0.36, 1.16, -0.81, 0.22, 0.11, 0.23, 'round')
    } else {
      for (let i = 0; i < 6; i++) {
        solid(
          node,
          0x32_7b_65,
          0.4 + i * 0.045,
          0.74 - i * 0.08,
          -0.63 + i * 0.1,
          0.125,
          0.14,
          0.24,
          'round'
        ).rotation.x = 0.95
      }
    }
    solid(node, iron, 0.32, 1.02, -0.79, 0.13, 0.3, 0.16).rotation.x = -0.42
    solid(node, equipmentColor, 0.3, 1.16, -0.93, 0.19, 0.16, 0.39)
    solid(node, gold, 0.3, 1.16, -1.15, 0.19, 0.18, 0.13)
    if (tool !== 'hose') {
      solid(node, steel, 0.3, 1.16, -1.3, 0.08, 0.08, 0.33)
      solid(node, iron, 0.3, 1.16, -1.49, tool === 'irrigation' ? 0.47 : 0.26, 0.12, 0.12)
    }
  }
  const grips: ReadonlyArray<Grip> =
    mowing || spreader
      ? Arr.map([-1, 1], (side) =>
          tool === 'riding' ? { x: side * 0.18, y: 1.25, z: -0.72 } : { x: side * 0.29, y: 1.2, z: -0.89 }
        )
      : tool === 'pump-sprayer'
        ? [carryGrip, sprayGrip]
        : sprayer
          ? [sprayGrip]
          : [canGrip]
  const particles = Array.from({ length: 14 }, () =>
    solid(
      node,
      watering ? 0x9a_dd_f1 : sprayer ? 0xbe_e8_d7 : mowing ? 0x9d_b6_59 : gold,
      0,
      0,
      0,
      0.035,
      0.035,
      watering ? 0.105 : 0.055,
      'leaf'
    )
  )
  return {
    node,
    grips,
    animate(t: number, distance: number, dt: number, working: boolean) {
      if (reel !== undefined) {
        reel.rotation.x -= working ? Math.max(distance, dt * 0.7) * 13 : distance * 13
      }
      if (disc !== undefined && working) {
        disc.rotation.y += dt * 23
      }
      if (can !== undefined) {
        can.rotation.x += ((working ? -0.68 : 0) - can.rotation.x) * (1 - Math.exp(-12 * dt))
      }
      const moving = distance > 0
      node.y =
        reel !== undefined || can !== undefined
          ? 0
          : Math.sin(t * (working ? 58 : 9)) * (working ? 0.014 : moving ? 0.009 : 0)
      for (const [i, p] of particles.entries()) {
        p.visible = working
        if (!working) {
          continue
        }
        const f = (t * (watering ? 1.7 : 2.4) + i / particles.length) % 1
        const spread = Math.sin(i * 41.37)
        if (mowing) {
          p.position.set(-0.43 - f * 0.46, 0.2 + Math.sin(Math.PI * f) * 0.26, -reach + spread * 0.28 + f * 0.31)
        } else if (spreader) {
          const width = disc === undefined ? 0.45 : 0.11 + f * 1.35
          p.position.set(
            spread * width,
            0.28 * (1 - f * f),
            -reach + Math.cos(i) * f * (disc === undefined ? 0.13 : 0.86)
          )
        } else if (sprayer) {
          p.position.set(
            nozzle.x + spread * f * (tool === 'backpack-sprayer' ? 1.15 : 0.62),
            nozzle.y * (1 - f),
            nozzle.z - f * 0.55
          )
        } else if (can !== undefined) {
          const cos = Math.cos(can.rotation.x),
            sin = Math.sin(can.rotation.x)
          const y = canGrip.y + rose.y * cos - rose.z * sin
          const z = canGrip.z + rose.y * sin + rose.z * cos
          p.position.set(canGrip.x * (1 - f) + spread * f * 0.16, y * (1 - f * f), z - (reach + z) * f)
        } else {
          p.position.set(
            0.3 * (1 - f) + spread * f * 0.19,
            1.16 * (1 - f * f),
            -1.18 - (reach - 1.18) * f + 0.12 * Math.cos(i) * f
          )
        }
      }
    },
  }
}
const cream = 0xf8_e6_bd

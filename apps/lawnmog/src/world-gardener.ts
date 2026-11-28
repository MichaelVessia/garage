import { Container3D } from '@pixi/3d'
import * as Arr from 'effect/Array'
import * as Option from 'effect/Option'

import { solid } from './world-art.ts'

export type Grip = { x: number; y: number; z: number }
const denim = 0x37_56_61,
  leather = 0x69_49_32,
  glove = 0xc3_98_56,
  skin = 0xcc_93_6a

function armSegment(parent: Container3D, from: Grip, to: Grip, color: number, width: number) {
  const dx = to.x - from.x,
    dy = to.y - from.y,
    dz = to.z - from.z
  const joint = parent.addChild(new Container3D(from))
  joint.rotation.y = Math.atan2(dx, dz)
  const length = Math.hypot(dx, dy, dz)
  const bone = joint.addChild(new Container3D())
  bone.rotation.x = -Math.atan2(dy, Math.hypot(dx, dz))
  solid(bone, color, 0, 0, length / 2, width, width, length + 0.055)
}

export function gardener({
  parent,
  shirt,
  grips = [],
  riding = false,
  inspector = false,
}: {
  parent: Container3D
  shirt: number
  grips?: ReadonlyArray<Grip>
  inspector?: boolean
  riding?: boolean
}) {
  const node = parent.addChild(new Container3D())
  const waist = riding ? 0.94 : 0.82
  const z = -0.12
  solid(node, denim, 0, waist, z, 0.48, 0.25, 0.34)
  solid(node, shirt, 0, waist + 0.29, z, 0.55, 0.51, 0.34)
  solid(node, denim, 0, waist + 0.14, z - 0.16, 0.39, 0.28, 0.056)
  for (const side of [-1, 1]) {
    solid(node, denim, side * 0.13, waist + 0.3, z + 0.16, 0.075, 0.47, 0.052).rotation.z = -side * 0.18
    solid(node, denim, side * 0.16, waist + 0.39, z - 0.15, 0.07, 0.26, 0.065)
    solid(node, 0xdf_b6_63, side * 0.16, waist + 0.28, z - 0.19, 0.046, 0.046, 0.022)
  }
  const head = node.addChild(new Container3D({ y: waist + 0.7, z }))
  solid(head, skin, 0, 0, 0, 0.37, 0.39, 0.34)
  solid(head, 0x56_40_30, 0, 0.06, 0.14, 0.38, 0.23, 0.09)
  if (inspector) {
    const blond = 0xe8_c6_78
    solid(head, blond, 0, 0.19, 0.04, 0.48, 0.29, 0.48, 'leaf')
    solid(head, 0x96_72_49, 0, 0.02, 0.15, 0.42, 0.26, 0.17)
    solid(head, blond, -0.17, 0, -0.09, 0.16, 0.52, 0.28).rotation.z = -0.21
    solid(head, 0xff_df_96, -0.045, 0.12, -0.17, 0.38, 0.15, 0.15).rotation.z = 0.36
    solid(node, leather, 0.35, 1.01, -0.47, 0.3, 0.4, 0.04).rotation.x = -0.23
    solid(node, 0xff_f8_df, 0.35, 1.01, -0.5, 0.25, 0.34, 0.02).rotation.x = -0.23
  } else {
    solid(head, 0xd4_af_69, 0, 0.15, -0.022, 0.65, 0.065, 0.58, 'round')
    solid(head, 0xc6_9c_56, 0, 0.23, 0, 0.43, 0.17, 0.4, 'round')
    solid(head, leather, 0, 0.18, 0, 0.44, 0.054, 0.41, 'round')
  }
  const legs = Arr.map([-1, 1], (side) => {
    const hip = node.addChild(new Container3D({ x: side * (riding ? 0.31 : 0.14), y: waist - 0.02, z }))
    solid(hip, denim, 0, -0.18, 0, 0.22, 0.4, 0.25)
    const knee = hip.addChild(new Container3D({ y: -0.36 }))
    solid(knee, denim, 0, -0.15, 0, 0.2, 0.34, 0.23)
    solid(knee, leather, 0, -0.34, -0.048, 0.235, 0.19, 0.36)
    const shoulder = { x: side * 0.28, y: waist + 0.45, z }
    const grip = Option.getOrUndefined(Arr.findFirst(grips, (point) => Math.sign(point.x) === side))
    const hand = grip ?? { x: side * 0.36, y: waist - 0.13, z: z - 0.09 }
    const elbow = {
      x: side * 0.42,
      y: (shoulder.y + hand.y) / 2 - (grip === undefined ? 0 : 0.18),
      z: (shoulder.z + hand.z) / 2 + 0.05,
    }
    armSegment(node, shoulder, elbow, shirt, 0.185)
    armSegment(node, elbow, hand, skin, 0.134)
    solid(node, glove, hand.x, hand.y, hand.z, 0.16, 0.15, 0.18)
    return { side, hip, knee }
  })
  function stride(swing: number) {
    for (const { side, hip, knee } of legs) {
      hip.rotation.x = riding ? 1.24 : swing * side * 0.48
      knee.rotation.x = riding ? -1.37 : -Math.max(0, -swing * side) * 0.36
    }
  }
  stride(0)
  return { node, head, stride }
}

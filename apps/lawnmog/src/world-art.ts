import {
  Container3D,
  CubeGeometry,
  CylinderGeometry,
  FlatMaterial,
  Geometry3D,
  IcosahedronGeometry,
  Material3D,
  Mesh3D,
  PlaneGeometry,
} from '@pixi/3d'
import * as MutableHashMap from 'effect/MutableHashMap'
import * as Option from 'effect/Option'
import { Texture } from 'pixi.js'

import type { Lawn, LotView, Season } from './model.ts'
import { lotOrigin, signPosition, turfSize } from './street-layout.ts'

type WorldLot = LotView

const cube = new CubeGeometry()
const stone = new IcosahedronGeometry({ radius: 0.5, detail: 0 })
const wheel = new CylinderGeometry({ radiusTop: 0.5, radiusBottom: 0.5, height: 1, radialSegments: 12 })
const shapes = { box: cube, leaf: stone, round: wheel }
const plane = new PlaneGeometry({ flipV: true })
const palette = MutableHashMap.empty<number, Material3D>()
function paint(color: number) {
  let surface = Option.getOrUndefined(MutableHashMap.get(palette, color))
  if (surface === undefined) {
    surface = new Material3D({ baseColor: color, roughness: 0.94, specular: { factor: 0.08 } })
    MutableHashMap.set(palette, color, surface)
  }
  return surface
}
// @effect-diagnostics-next-line missingPipeableSignature:off -- Mesh placement uses explicit coordinates and dimensions.
export function solid(
  parent: Container3D,
  color: number,
  x: number,
  y: number,
  z: number,
  w: number,
  h: number,
  d: number,
  shape: 'box' | 'leaf' | 'round' = 'box'
) {
  return parent.addChild(
    new Mesh3D({
      geometry: shapes[shape],
      material: paint(color),
      x,
      y,
      z,
      scale: { x: w, y: h, z: d },
    })
  )
}
// @effect-diagnostics-next-line missingPipeableSignature:off -- The face uses explicit placement and canvas dimensions.
export function panel(
  parent: Container3D,
  x: number,
  y: number,
  z: number,
  w: number,
  h: number,
  width: number,
  height: number
) {
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d')
  if (ctx === null) {
    throw new Error('Cannot paint Clover Lane.')
  }
  const texture = Texture.from(canvas, true)
  const material = new FlatMaterial({ baseColorTexture: texture })
  const mesh = parent.addChild(new Mesh3D({ geometry: plane, material, x, y, z, scale: { x: w, y: h, z: 1 } }))
  return {
    ctx,
    mesh,
    texture,
    dispose() {
      material.destroy()
      texture.destroy(true)
    },
  }
}
const cream = 0xf8_e6_bd
const timber = 0x81_58_38
const canopies = {
  spring: [0xb7_ce_75, 0x9c_c8_68, 0xc7_d8_84, 0xb4_c9_63],
  summer: [0x58_7c_44, 0x84_a6_4a, 0xa1_b8_53, 0x64_8e_52],
  autumn: [0xdc_87_32, 0xb8_53_32, 0xe8_b4_43, 0xb9_7e_30],
}
function tree(parent: Container3D, x: number, z: number, size: number, seed: number) {
  solid(parent, timber, x, size * 0.4, z, 0.42, size * 0.8, 0.4, 'round')
  for (const side of [-1, 1]) {
    solid(parent, timber, x + side * size * 0.12, size * 0.7, z + side * 0.11, 0.17, size * 0.5, 0.18).rotation.z =
      -side * 0.58
  }
  const upper = solid(
    parent,
    canopies.summer[seed % 4] ?? 0x73_93_42,
    x,
    size * 0.88,
    z,
    size * 0.95,
    size * 1.0,
    size * 0.94,
    'leaf'
  )
  const lower = solid(
    parent,
    canopies.summer[(seed + 1) % 4] ?? 0x84_99_42,
    x + size * 0.27,
    size * 0.76,
    z + 0.4,
    size * 0.74,
    size * 0.68,
    size * 0.78,
    'leaf'
  )
  return (season: Season) => {
    upper.visible = season !== 'winter'
    lower.visible = upper.visible
    if (season !== 'winter') {
      upper.material = paint(canopies[season][seed % 4] ?? 0x73_93_42)
      lower.material = paint(canopies[season][(seed + 1) % 4] ?? 0x84_99_42)
    }
  }
}
const houses = [0xe5_ab_78, 0x96_b5_b1, 0xbb_c4_97, 0xe5_bd_80, 0xca_a6_a0]
export function cottage({ parent, id }: { parent: Container3D; id: number }) {
  const wall = houses[id % houses.length] ?? cream,
    roof = id % 2 === 1 ? 0x57_5e_68 : 0x8d_57_49
  solid(parent, wall, 0, 1.7, -8, 8, 3.4, 4.8)
  solid(parent, cream, 0, 0.27, -8, 8.2, 0.54, 4.98)
  for (let course = 0; course < 13; course++) {
    solid(parent, wall, 0, 0.43 + course * 0.23, -5.58, 8, 0.036, 0.085)
  }
  for (const side of [-1, 1]) {
    solid(parent, roof, 0, 3.96, -8 + side * 1.35, 8.65, 0.28, 3.15).rotation.x = side * 0.41
    solid(parent, cream, 0, 3.4, -8 + side * 2.73, 8.7, 0.2, 0.16)
    const x = side * 2.35
    solid(parent, cream, x, 1.95, -5.54, 1.75, 1.45, 0.2)
    solid(parent, 0x65_95_a1, x, 1.95, -5.4, 1.52, 1.24, 0.12)
    solid(parent, cream, x, 1.95, -5.32, 0.1, 1.26, 0.06)
    solid(parent, cream, x, 1.96, -5.32, 1.56, 0.09, 0.06)
    for (const edge of [-1, 1]) {
      solid(parent, roof, x + edge * 1.03, 1.95, -5.46, 0.25, 1.44, 0.11)
    }
    solid(parent, timber, x, 1.19, -5.3, 1.7, 0.24, 0.43)
    for (let k = 0; k < 5; k++) {
      solid(parent, 0x58_7c_44, x - 0.63 + k * 0.31, 1.36, -5.23, 0.42, 0.32, 0.37, 'leaf')
      solid(parent, k % 2 === 1 ? 0xff_c6_4e : 0xf2_80_79, x - 0.61 + k * 0.31, 1.49, -5.13, 0.2, 0.19, 0.18, 'leaf')
    }
  }
  solid(parent, 0x87_5e_4c, 2.7, 4.38, -8.7, 0.79, 1.95, 0.76)
  solid(parent, roof, 2.7, 5.38, -8.7, 0.96, 0.22, 0.92)
  solid(parent, cream, 0, 1.48, -5.49, 1.34, 2.56, 0.23)
  solid(parent, 0x45_6d_62, 0, 1.44, -5.32, 1.15, 2.4, 0.14)
  solid(parent, 0x91_bd_c2, 0, 1.95, -5.23, 0.72, 0.77, 0.08)
  solid(parent, 0xd8_ac_59, 0.37, 1.23, -5.19, 0.11, 0.12, 0.1, 'leaf')
  solid(parent, roof, 0, 2.95, -5.07, 2.29, 0.16, 1.25).rotation.x = 0.13
  for (const x of [-0.98, 0.98]) {
    solid(parent, cream, x, 1.52, -4.58, 0.1, 2.7, 0.1)
  }
  solid(parent, 0xd1_bf_9d, 0, 0.16, -5.13, 2.35, 0.32, 1.6)
}
function grass(ctx: CanvasRenderingContext2D, lot: WorldLot, cell: number, lawn: Lawn) {
  const size = ctx.canvas.width / 8
  const col = cell % 8,
    row = Math.floor(cell / 8),
    left = col * size,
    top = row * size
  const stripes = { checker: row + col, diagonal: row - col, crosscut: row + Math.floor(col / 2), straight: col }[
    lawn.pattern
  ]
  const stripe = (stripes % 2 === 0 ? 1 : -1) * lawn.definition * 0.13
  const dry = (100 - lawn.moisture) * 0.52,
    sick = lawn.disease * 0.55
  const r = 56 + dry + sick + stripe + 0.45 * (100 - lawn.height)
  const g = 116 + lawn.fertility * 0.33 + stripe - lawn.disease * 0.28 + (100 - lawn.height) * 0.18
  ctx.fillStyle = 'rgb(' + r + ' ' + g + ' ' + (44 + lawn.moisture * 0.19) + ')'
  ctx.fillRect(left, top, size, size)
  let seed = lot.id * 9337 + cell * 797 + 1
  function random() {
    seed = (Math.imul(seed, 1_664_525) + 1_013_904_223) >>> 0
    return seed / 4_294_967_296
  }
  for (let i = 0; i < 170; i++) {
    const x = left + random() * (size - 3),
      y = top + random() * (size - 5) + 5
    ctx.fillStyle = i % 4 === 0 ? '#f2ef9e63' : '#25483138'
    ctx.beginPath()
    ctx.moveTo(x, y)
    ctx.lineTo(x + 1.6, y)
    ctx.lineTo(x + 2.7, y - 1 - lawn.height * 0.047)
    ctx.fill()
  }
  // Draw dandelion rosettes on the existing lawn texture.
  for (let i = 0; i < Math.ceil(lawn.weeds / 14); i++) {
    const x = left + 7 + random() * (size - 14)
    const y = top + 7 + random() * (size - 14)
    const rotation = random() * Math.PI
    for (let petal = 0; petal < 6; petal++) {
      const angle = rotation + (petal * Math.PI) / 3
      const dx = Math.cos(angle),
        dy = Math.sin(angle)
      ctx.fillStyle = petal % 2 === 0 ? '#315e2b' : '#487c35'
      ctx.beginPath()
      ctx.moveTo(x, y)
      ctx.lineTo(x + dx * 3 - dy * 1.8, y + dy * 3 + dx * 1.8)
      ctx.lineTo(x + dx * 6, y + dy * 6)
      ctx.lineTo(x + dx * 3 + dy * 1.1, y + dy * 3 - dx * 1.1)
      ctx.fill()
    }
    ctx.fillStyle = '#f9cd46'
    ctx.beginPath()
    ctx.arc(x + 0.5, y - 0.8, 2.15, 0, 2 * Math.PI)
    ctx.fill()
  }
}
// Grass blades and folded leaves share one dynamic mesh per lot.
function grassBlades(parent: Container3D, index: number) {
  const perCell = 40
  const leafCount = 10
  const leafStart = 64 * perCell * 3
  const vertices = leafStart + 64 * leafCount * 6
  const positions = new Float32Array(vertices * 3)
  const colors = new Uint8Array(vertices * 4)
  let seed = index * 773 + 41
  function random() {
    seed = (Math.imul(seed, 1_664_525) + 1_013_904_223) >>> 0
    return seed / 4_294_967_296
  }
  for (let cell = 0; cell < 64; cell++) {
    for (let i = 0; i < perCell; i++) {
      const blade = cell * perCell + i
      const x = ((cell % 8) + random()) * 1.25 - 5
      const z = (Math.floor(cell / 8) + random()) * 1.25 - 5
      const dx = 0.013 + random() * 0.01,
        dz = (random() - 0.5) * 0.065
      positions.set([x - dx, 0.026, z - dz, x + dx, 0.026, z + dz, x + dx * 1.8, 0.21, z + 0.02], blade * 9)
      const glint = Math.floor(random() * 25)
      colors.set([14, 34, 8, 255, 14, 34, 8, 255, 38 + glint, 68 + glint, 16 + glint, 255], blade * 12)
    }
  }
  const leafColors = [
    [182, 62, 12],
    [204, 115, 19],
    [143, 37, 14],
    [176, 76, 21],
  ] as const
  for (let cell = 0; cell < 64; cell++) {
    const pileX = ((cell % 8) + 0.36 + random() * 0.28) * 1.25 - 5
    const pileZ = (Math.floor(cell / 8) + 0.36 + random() * 0.28) * 1.25 - 5
    for (let i = 0; i < leafCount; i++) {
      const first = leafStart + (cell * leafCount + i) * 6
      const x = pileX + (random() - 0.5) * 0.6,
        z = pileZ + (random() - 0.5) * 0.6
      const angle = random() * Math.PI * 2
      const dx = Math.cos(angle) * 0.16,
        dz = Math.sin(angle) * 0.16
      // Two triangles meet along the leaf vein. The far half is darker.
      const tip = [x - dx, 0, z - dz],
        stem = [x + dx, 0, z + dz]
      positions.set(
        [...tip, x - dz * 0.53, 0, z + dx * 0.53, ...stem, ...stem, x + dz * 0.46, 0, z - dx * 0.46, ...tip],
        first * 3
      )
      const [r, g, b] = leafColors[i % 4] ?? leafColors[0]
      for (let v = 0; v < 6; v++) {
        colors.set([r, g * (v < 3 ? 1 : 0.7), b, 255], (first + v) * 4)
      }
    }
  }
  const geometry = new Geometry3D({ positions, colors, dynamic: true, interleave: false })
  const mat = new FlatMaterial({ vertexColors: true, doubleSided: true })
  parent.addChild(new Mesh3D({ geometry, material: mat }))
  return {
    update(cell: number, height: number, leaves: number) {
      for (let i = 0; i < perCell; i++) {
        positions[(cell * perCell + i) * 9 + 7] = 0.032 + (height / 100) ** 1.45 * (0.09 + (i % 7) * 0.025)
      }
      const visible = Math.ceil(Math.sqrt(leaves / 100) * leafCount)
      for (let i = 0; i < leafCount; i++) {
        const first = leafStart + (cell * leafCount + i) * 6
        const y = 0.052 + i * leaves * 0.00012
        for (let v = 0; v < 6; v++) {
          positions[(first + v) * 3 + 1] = i < visible ? y + (v === 1 || v === 4 ? 0 : 0.026) : -0.04
        }
      }
    },
    upload() {
      geometry.attributes.aPosition?.buffer.update()
    },
    dispose() {
      geometry.destroy()
      mat.destroy()
    },
  }
}
export function buildLot({ root, index }: { root: Container3D; index: number }) {
  const origin = lotOrigin(index)
  const node = root.addChild(new Container3D({ x: origin.x, z: origin.z }))
  node.rotation.y = origin.side === 1 ? 0 : Math.PI
  solid(node, 0x82_9e_52, 0, -0.2, -2, 14, 0.38, 15)
  solid(node, 0xd6_cb_b2, 0, -0.04, 6, 14, 0.13, 2)
  solid(node, 0xe6_dc_c5, 0, -0.08, 7, 14, 0.22, 0.18)
  if (origin.side === 1) {
    solid(node, 0x45_53_59, 0, -0.21, 12, 14, 0.18, 10)
    for (const x of [-4, 3]) {
      solid(node, 0xe4_c5_79, x, -0.11, 12, 2.8, 0.02, 0.11)
    }
  }
  for (const x of [-5, -1.5, 2, 5.5]) {
    solid(node, 0xa5_9e_8d, x, 0.031, 6, 0.025, 0.008, 1.94)
  }
  cottage({ parent: node, id: index })
  const frontTree = tree(node, -5.6, -5.9, 4.6, index)
  const backTree = tree(node, 5.8, -9, 5.1, index + 1)
  let lastSeason: Season = 'summer'
  for (let i = 0; i < 6; i++) {
    solid(node, 0x65_7f_46, 5.94, 0.58, -4.8 + i * 1.48, 1.54, 1.39, 2, 'leaf')
  }
  for (let i = 0; i < 8; i++) {
    solid(node, 0xcb_bf_a6, -5.99, 0.02, -4.5 + i * 1.32, 1.08, 0.08, 1.11)
  }
  const lawn = panel(node, 0, 0.024, 0, turfSize, turfSize, 512, 512)
  lawn.mesh.rotation.x = -Math.PI / 2
  const blades = grassBlades(node, index)
  const { x: signX, z: signZ } = signPosition
  for (const x of [signX - 0.79, signX + 0.79]) {
    solid(node, timber, x, 0.71, signZ - 0.11, 0.14, 1.42, 0.17)
  }
  solid(node, cream, signX, 1.19, signZ, 2.27, 0.87, 0.13)
  const sign = panel(node, signX, 1.19, signZ + 0.08, 2.19, 0.78, 512, 182)
  const sprinkler = node.addChild(new Container3D())
  solid(sprinkler, 0x2c_69_58, 0, 0.1, 0, 0.38, 0.16, 0.38, 'round')
  solid(sprinkler, 0xdb_ad_5e, 0, 0.25, 0, 0.12, 0.24, 0.12, 'round')
  solid(sprinkler, 0x56_82_8c, 0, 0.36, 0, 0.42, 0.08, 0.08)
  const heaps = MutableHashMap.empty<number, Container3D>()
  function updateHeaps(lot: WorldLot) {
    const amounts = MutableHashMap.empty<number, number>()
    for (const pile of lot.returnPiles) {
      MutableHashMap.set(
        amounts,
        pile.cell,
        (Option.getOrUndefined(MutableHashMap.get(amounts, pile.cell)) ?? 0) + pile.amount
      )
    }
    for (const [cell, heap] of heaps) {
      if (!MutableHashMap.has(amounts, cell)) {
        heap.destroy({ children: true })
        MutableHashMap.remove(heaps, cell)
      }
    }
    for (const [cell, amount] of amounts) {
      let heap = Option.getOrUndefined(MutableHashMap.get(heaps, cell))
      if (heap === undefined) {
        heap = node.addChild(
          new Container3D({ x: ((cell % 8) + 0.5) * 1.25 - 5, z: (Math.floor(cell / 8) + 0.5) * 1.25 - 5 })
        )
        solid(heap, 0xa9_46_1e, 0, 0.19, 0, 1.12, 0.55, 1.05, 'leaf')
        for (let i = 0; i < 12; i++) {
          const angle = i * 2.4
          const radius = Math.sqrt(i / 12) * 0.48
          const leaf = solid(
            heap,
            i % 2 === 1 ? 0xde_77_27 : 0xf3_b9_4b,
            Math.sin(angle) * radius,
            0.46 - radius * 0.63,
            Math.cos(angle) * radius,
            0.34,
            0.12,
            0.23,
            'leaf'
          )
          leaf.rotation.y = angle
        }
        MutableHashMap.set(heaps, cell, heap)
      }
      const size = 0.8 + Math.min(0.42, amount / 100)
      heap.scale.set(size, size, size)
    }
  }
  let lastLot = Option.none<WorldLot>()
  return {
    node,
    update(lot: WorldLot, season: Season) {
      if (season !== lastSeason) {
        frontTree(season)
        backTree(season)
        lastSeason = season
      }
      updateHeaps(lot)
      const previous = Option.getOrUndefined(lastLot)
      if (previous?.name !== lot.name || previous.hoa.lastResult !== lot.hoa.lastResult) {
        const ctx = sign.ctx
        ctx.fillStyle = '#193e35'
        ctx.fillRect(0, 0, 512, 182)
        ctx.strokeStyle = '#e3c27a'
        ctx.lineWidth = 3
        ctx.strokeRect(9, 9, 494, 164)
        ctx.textAlign = 'center'
        ctx.fillStyle = '#e4c985'
        ctx.font = 'bold 28px sans-serif'
        const inspected = lot.hoa.lastResult !== 'pending'
        ctx.fillText(String(100 + lot.id) + '  •  CLOVER LANE', 256, inspected ? 46 : 60)
        ctx.fillStyle = '#fff4d9'
        ctx.font = 'bold 60px Georgia, serif'
        ctx.fillText(lot.name, 256, inspected ? 104 : 138, 465)
        if (inspected) {
          const cited = lot.hoa.lastResult === 'cited'
          ctx.fillStyle = cited ? '#f9bc82' : '#c4e2a4'
          ctx.fillRect(12, 121, 488, 48)
          ctx.fillStyle = '#213829'
          ctx.font = 'bold 30px sans-serif'
          ctx.fillText(cited ? 'HOA CITATION' : 'HOA APPROVED', 256, 156)
        }
        sign.texture.source.update()
      }
      let dirty = false
      for (let i = 0; i < 64; i++) {
        const patch = lot.patches[i] ?? lot.lawn
        const old = previous?.patches[i] ?? previous?.lawn
        if (
          old !== undefined &&
          old.height === patch.height &&
          old.weeds === patch.weeds &&
          old.leaves === patch.leaves &&
          old.fertility === patch.fertility &&
          old.disease === patch.disease &&
          old.moisture === patch.moisture &&
          old.pattern === patch.pattern &&
          old.definition === patch.definition
        ) {
          continue
        }
        grass(lawn.ctx, lot, i, patch)
        blades.update(i, patch.height, patch.leaves)
        dirty = true
      }
      if (dirty) {
        lawn.texture.source.update()
        blades.upload()
      }
      sprinkler.visible = lot.sprinkler !== null
      if (lot.sprinkler !== null) {
        sprinkler.position.set(
          ((lot.sprinkler % 8) + 0.5) * 1.25 - 5,
          0,
          (Math.floor(lot.sprinkler / 8) + 0.5) * 1.25 - 5
        )
      }
      lastLot = Option.some(lot)
    },
    dispose() {
      node.destroy({ children: true })
      blades.dispose()
      sign.dispose()
      lawn.dispose()
    },
  }
}

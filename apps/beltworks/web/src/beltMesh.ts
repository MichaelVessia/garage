import * as Arr from 'effect/Array'
import * as Rec from 'effect/Record'
import { Container, Mesh, MeshGeometry } from 'pixi.js'
import type { Texture } from 'pixi.js'

import type { Machine } from './machines.ts'

const corners = [
  [-1, -1],
  [1, -1],
  [1, 1],
  [-1, 1],
] as const

type Quad = { geometry: MeshGeometry; index: number; c: number; s: number }
function positionQuad(node: Machine, { geometry, index, c, s }: Quad) {
  for (const [corner, [x, y]] of corners.entries()) {
    const i = index * 8 + 2 * corner
    geometry.positions[i] = node.x + (x * c - y * s) * node.scale.x
    geometry.positions[i + 1] = node.y + (x * s + y * c) * node.scale.y
  }
}

// All belts of a given shape use the same atlas frame. Their vertices stay on the GPU between edits.
export function beltMeshes() {
  const layer = new Container<Mesh<MeshGeometry>>()
  type Batch = { mesh: Mesh<MeshGeometry>; frames: Array<Texture> }
  let quads = new WeakMap<Machine, Quad>()
  let batches: Array<Batch> = []
  function rebuild(belts: ReadonlyArray<Machine>) {
    for (const { mesh } of batches) {
      const geometry = mesh.geometry
      mesh.destroy()
      geometry.destroy(true)
    }
    batches = []
    quads = new WeakMap()
    const shapes = Arr.groupBy(belts, (belt) => String(belt.frames?.[0]?.source.uid))
    for (const group of Rec.values(shapes)) {
      const frames = group[0].frames
      const first = frames?.[0]
      if (frames === undefined || first === undefined) {
        continue
      }
      const positions = new Float32Array(group.length * 8)
      const uvs = new Float32Array(positions.length)
      const indices = new Uint32Array(group.length * 6)
      const geometry = new MeshGeometry({ positions, uvs, indices })
      for (const [index, node] of group.entries()) {
        const angle = node.plate.rotation
        const c = (Math.cos(angle) * first.width) / 2
        const s = (Math.sin(angle) * first.width) / 2
        const quad = { geometry, index, c, s }
        positionQuad(node, quad)
        quads.set(node, quad)
        uvs.set([0, 0, 1, 0, 1, 1, 0, 1], index * 8)
        const v = index * 4
        indices.set([v, v + 1, v + 2, v, v + 2, v + 3], index * 6)
      }
      geometry.batchMode = 'no-batch'
      const mesh = layer.addChild(new Mesh({ geometry, texture: first }))
      batches.push({ mesh, frames })
    }
  }
  function scroll(distance: number) {
    const phase = (Math.max(0, distance) * 3) % 1
    for (const { mesh, frames } of batches) {
      const texture = frames[Math.floor(phase * frames.length)]
      if (texture !== undefined) {
        mesh.texture = texture
      }
    }
  }
  function resize(node: Machine) {
    const quad = quads.get(node)
    if (quad !== undefined) {
      positionQuad(node, quad)
      quad.geometry.getBuffer('aPosition').update()
    }
  }
  return { layer, rebuild, scroll, resize }
}

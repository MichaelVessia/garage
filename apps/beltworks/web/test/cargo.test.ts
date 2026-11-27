import { assert, it } from '@effect/vitest'

import { Cargo } from '../src/cargo.ts'
import { tile } from '../src/machines.ts'

it('places cargo on the curve at each render fraction', () => {
  const cargo = new Cargo(7)
  cargo.move({ gx: 0, gy: 0, fromDir: 'W', prevProgress: 400, progress: 600 }, 'N', 1)
  cargo.interpolate(0.5)
  assert.equal(cargo.x, 0.375 * tile)
  assert.equal(cargo.y, 0.375 * tile)
  cargo.interpolate(0.75)
  assert.isAbove(cargo.x, 0.375 * tile)
  assert.isBelow(cargo.y, 0.375 * tile)
})

it('crosses a tile boundary once and carries excess distance onto the next belt', () => {
  const cargo = new Cargo(1)
  cargo.move({ gx: 1, gy: 2, fromDir: 'W', prevProgress: 800, progress: 900 }, 'E', 1)
  cargo.move({ gx: 2, gy: 2, fromDir: 'W', prevProgress: 0, progress: 100 }, 'S', 2)
  cargo.interpolate(0)
  assert.closeTo(cargo.x, 1.9 * tile, 1e-6)
  cargo.interpolate(0.5)
  assert.equal(cargo.x, 2 * tile)
  assert.equal(cargo.y, 2.5 * tile)
  cargo.interpolate(1)
  assert.isAbove(cargo.x, 2 * tile)
  assert.isAbove(cargo.y, 2.5 * tile)
})

it('keeps cargo below the floor during a tunnel transfer', () => {
  const cargo = new Cargo(3)
  cargo.move({ gx: 1, gy: 1, fromDir: 'W', prevProgress: 700, progress: 900 }, 'E', 4, 'tunnelIn')
  cargo.move({ gx: 6, gy: 1, fromDir: 'W', prevProgress: 0, progress: 100 }, 'E', 5, 'tunnelOut')
  cargo.interpolate(0.25)
  assert.isBelow(cargo.x, 2 * tile)
  assert.equal(cargo.alpha, 0)
  cargo.interpolate(0.75)
  assert.isAbove(cargo.x, 6 * tile)
  assert.equal(cargo.alpha, 0)
})

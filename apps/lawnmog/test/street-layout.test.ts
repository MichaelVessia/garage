import { expect, it } from 'vitest'

import { estateColumn, estateIndex, lotColumn, lotOrigin, spacing, streetIndex } from '../src/street-layout.ts'

it('adds pairs on alternate ends and keeps every lawn reachable on its own side', () => {
  expect(streetIndex({ column: estateColumn, opposite: false })).toBe(estateIndex)
  expect(streetIndex({ column: estateColumn, opposite: true })).toBe(6)
  expect(lotOrigin(6)).toMatchObject({ x: estateColumn * spacing, side: -1 })
  expect(lotColumn(0)).toBe(estateColumn - 1)
  expect(lotColumn(2)).toBe(estateColumn + 1)
  for (let i = 0; i < 128; i++) {
    const { x, side } = lotOrigin(i)
    expect(streetIndex({ column: x / spacing, opposite: side === -1 })).toBe(i)
    const neighbor = streetIndex({ column: lotColumn(i), opposite: side === 1 })
    expect(Math.abs(neighbor - i)).toBe(i === 6 ? 6 - estateIndex : 1)
    expect(lotOrigin(neighbor).x).toBe(x)
  }
})

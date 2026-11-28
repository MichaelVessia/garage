export const spacing = 14
export const oppositeZ = 24
export const turfSize = 10
export const signPosition = { x: -5.8, z: 5.55 }
export const estateColumn = 1
export const estateIndex = -2

// The first six homes keep their positions. The seventh faces the HOA.
const oppositeHome = 6
const pairedIndex = (index: number) => (index > oppositeHome ? index - 1 : index)
export function lotColumn(index: number) {
  if (index === oppositeHome) {
    return estateColumn
  }
  const pair = Math.floor(pairedIndex(index) / 2)
  const distance = Math.floor(pair / 2) + 1
  return estateColumn + (pair % 2 === 0 ? -distance : distance)
}

export function streetIndex({ column, opposite }: { column: number; opposite: boolean }) {
  const offset = column - estateColumn
  if (offset === 0) {
    return opposite ? oppositeHome : estateIndex
  }
  const slot = (Math.abs(offset) - 1) * 4 + (offset > 0 ? 2 : 0) + (opposite ? 1 : 0)
  return slot < oppositeHome ? slot : slot + 1
}

export function lotOrigin(index: number) {
  const side = index !== oppositeHome && pairedIndex(index) % 2 === 0 ? 1 : -1
  return { x: (index < 0 ? estateColumn : lotColumn(index)) * spacing, z: side === 1 ? 0 : oppositeZ, side }
}

import * as Arr from 'effect/Array'
import * as Rec from 'effect/Record'

import {
  Building,
  Facing,
  Game,
  GridCell,
  GridIndex,
  Item,
  OnTile,
  ResourceVein,
  WorldPosition,
  Progression,
  inBounds,
  key,
} from './model.ts'
import type { Cell } from './model.ts'

function matchesIndex<T extends { readonly id: number }>(
  entries: ReadonlyArray<T>,
  index: Readonly<Record<string, number>>,
  cell: (entity: T) => Cell
) {
  return entries.length === Rec.size(index) && Arr.every(entries, (e) => index[key(cell(e))] === e.id)
}
const { Query } = Game
export const savedBoard = Game.Inspector(
  'Beltworks/CheckSavedBoard',
  {
    resources: { progress: Game.System.readResource(Progression), index: Game.System.readResource(GridIndex) },
    queries: {
      veins: Query({ selection: { cell: Query.read(GridCell) }, with: [ResourceVein] }),
      buildings: Query({ selection: { cell: Query.read(GridCell), state: Query.read(Building) }, with: [Facing] }),
      items: Query({ selection: { cell: Query.read(OnTile) }, with: [Item, WorldPosition] }),
    },
  },
  ({ resources, queries }) => {
    const { buildings, veins, items } = queries
    const index = resources.index.get()
    const structures = buildings.each()
    const deposits = veins.each()
    const cargo = items.each()
    const hubs = ['17,12', '18,12', '17,13', '18,13']
    const carriers = Rec.fromEntries(
      Arr.map(structures, (e) => [key(buildings.data.cell.get(e)), buildings.data.state.get(e).kind])
    )
    const valid =
      matchesIndex(structures, index.buildings, (e) => buildings.data.cell.get(e)) &&
      matchesIndex(deposits, index.veins, (e) => veins.data.cell.get(e)) &&
      matchesIndex(cargo, index.items, (e) => items.data.cell.get(e)) &&
      Arr.every(hubs, (k) => carriers[k] === 'hub') &&
      Arr.every(structures, (e) => {
        const k = key(buildings.data.cell.get(e))
        const kind = buildings.data.state.get(e).kind
        return (
          inBounds(buildings.data.cell.get(e), resources.progress.get().boardTier) &&
          (kind !== 'hub' || Arr.contains(hubs, k)) &&
          (kind !== 'extractor' || index.veins[k] !== undefined)
        )
      }) &&
      Arr.every(cargo, (e) => {
        const carrier = carriers[key(items.data.cell.get(e))]
        return (
          carrier === 'belt' ||
          carrier === 'filter' ||
          carrier === 'splitter' ||
          carrier === 'merger' ||
          carrier === 'tunnelIn' ||
          carrier === 'tunnelOut'
        )
      })
    return { valid, count: structures.length + deposits.length + cargo.length }
  }
)

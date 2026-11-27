import { blueprintEntry, clockwise } from '@garage/beltworks-domain'
import type { BlueprintEntry, BuildingState, Cell, Direction } from '@garage/beltworks-domain'
import * as Arr from 'effect/Array'
import * as Option from 'effect/Option'
import * as Result from 'effect/Result'
import * as S from 'effect/Schema'

export function area({ start, end }: { start: Cell; end: Cell }) {
  return {
    minX: Math.min(start.gx, end.gx),
    maxX: Math.max(start.gx, end.gx),
    minY: Math.min(start.gy, end.gy),
    maxY: Math.max(start.gy, end.gy),
  }
}

export function captureBlueprint({
  start,
  end,
  machineAt,
}: {
  start: Cell
  end: Cell
  machineAt: (cell: Cell) => Option.Option<{ state: BuildingState; facing: Direction }>
}): Array<BlueprintEntry> {
  const { minX, maxX, minY, maxY } = area({ start, end })
  const entries: Array<BlueprintEntry> = []
  for (let gy = minY; gy <= maxY; gy++) {
    for (let gx = minX; gx <= maxX; gx++) {
      const machine = machineAt({ gx, gy })
      if (Option.isNone(machine)) {
        continue
      }
      const { state, facing } = machine.value
      if (state.kind === 'hub') {
        continue
      }
      const offset = { dx: gx - minX, dy: gy - minY, dir: facing }
      if (state.kind === 'combiner') {
        entries.push({ ...offset, kind: state.kind, op: state.op })
      } else if (state.kind === 'filter') {
        entries.push({ ...offset, kind: state.kind, targetValue: state.targetValue })
      } else {
        entries.push({ ...offset, kind: state.kind })
      }
    }
  }
  return entries
}

export function rotateBlueprint(entries: ReadonlyArray<BlueprintEntry>): Array<BlueprintEntry> {
  const bottom = Math.max(0, ...Arr.map(entries, (entry) => entry.dy))
  const left = Math.min(...Arr.map(entries, (entry) => entry.dx))
  const top = Math.min(...Arr.map(entries, (entry) => entry.dy))
  return Arr.map(entries, (entry) => ({
    ...entry,
    dx: left + bottom - entry.dy,
    dy: top + entry.dx - left,
    dir: clockwise[entry.dir],
  }))
}

const libraryKey = 'beltworks:blueprints:v1'
const slot = S.NullOr(S.Array(blueprintEntry).check(S.isMinLength(1), S.isMaxLength(936)))
const libraryJson = S.fromJsonString(S.Tuple([slot, slot, slot, slot]))

export function blueprintLibrary(storage: () => Pick<Storage, 'getItem' | 'setItem'>) {
  let slots: typeof libraryJson.Type = [null, null, null, null]
  try {
    const raw = storage().getItem(libraryKey)
    if (raw !== null) {
      const parsed = S.decodeResult(libraryJson)(raw)
      if (Result.isSuccess(parsed)) {
        slots = parsed.success
      }
    }
  } catch {
    // Empty slots are available when saved data is invalid or storage is disabled.
  }
  return {
    read: (index: number) => slots[index] ?? null,
    write(index: number, entries: ReadonlyArray<BlueprintEntry>) {
      if (!Number.isInteger(index) || index < 0 || index >= slots.length) {
        return false
      }
      const next: [...typeof slots] = [...slots]
      next[index] = entries
      try {
        const encoded = S.encodeResult(libraryJson)(next)
        if (Result.isFailure(encoded)) {
          return false
        }
        storage().setItem(libraryKey, encoded.success)
        slots = next
        return true
      } catch {
        return false
      }
    },
  }
}

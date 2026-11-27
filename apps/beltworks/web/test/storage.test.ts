import { assert, it } from '@effect/vitest'
import {
  createRuntime,
  Game,
  Progression,
  initialResources,
  enqueue,
  simulation,
  exportSave,
} from '@garage/beltworks-domain'

import { editHistory } from '../src/history.ts'
import { loadBoard, saveBoard } from '../src/storage.ts'
const blank = () => {
  const r = Game.Runtime.make({ services: Game.Runtime.services(), resources: initialResources() })
  if (!r.ok) {
    throw new Error('Invalid runtime')
  }
  return r.value
}
it('restores the saved factory including production time and buildings', () => {
  const source = createRuntime(0)
  enqueue({ type: 'placeBuilding', kind: 'belt', gx: 14, gy: 10, dir: 'S' })(source)
  source.tick(simulation)
  const data = new Map<string, string>()
  const store = () => ({
    getItem: (k: string) => data.get(k) ?? null,
    setItem: (k: string, v: string) => {
      data.set(k, v)
    },
  })
  assert.isTrue(saveBoard(store)(source))
  assert.isTrue(data.has('beltworks:save:v7'))
  const dest = blank()
  loadBoard(store)(dest)
  assert.deepEqual(exportSave(dest), exportSave(source))
  const legacy = data.get('beltworks:save:v7')
  for (const key of ['beltworks:save:v6', 'beltworks:save:v5']) {
    data.clear()
    if (legacy !== undefined) {
      data.set(key, legacy)
    }
    const fresh = blank()
    loadBoard(store)(fresh)
    assert.deepEqual(exportSave(fresh), exportSave(source))
  }
})
it.each([null, '{', '{}'])('creates a fresh board for missing or corrupt storage (%s)', (raw) => {
  const dest = blank()
  loadBoard(() => ({ getItem: () => raw, setItem: () => {} }))(dest)
  assert.deepEqual(exportSave(dest), exportSave(createRuntime(0)))
})

it('undoes the most recent 25 edits and restores the complete prior snapshot', () => {
  const r = createRuntime(0)
  const history = editHistory(r)
  for (let n = 0; n < 26; n++) {
    history.record(exportSave(r))
    r.tick(simulation)
  }
  const before = exportSave(r)
  history.record(before)
  enqueue({ type: 'placeBuilding', gx: 14, gy: 10, dir: 'S', kind: 'belt' })(r)
  r.tick(simulation)
  assert.isTrue(history.undo())
  assert.deepEqual(exportSave(r), before)
  for (let n = 0; n < 24; n++) {
    assert.isTrue(history.undo())
  }
  assert.isFalse(history.undo())
})

it('keeps a medal after undo restores an earlier factory', () => {
  const r = createRuntime(0)
  const history = editHistory(r)
  history.record(exportSave(r))
  r.tick(
    Game.Schedule(
      Game.System('Test/EarnMedal', { resources: { p: Game.System.writeResource(Progression) } }, ({ resources }) => {
        const p = resources.p.get()
        resources.p.set({ ...p, meta: { ...p.meta, medals: ['blueprintArchitect'] } })
      })
    )
  )
  assert.isTrue(history.undo())
  const current = r.inspect(
    Game.Inspector(
      'Test/RestoredMedals',
      { resources: { p: Game.System.readResource(Progression) } },
      ({ resources }) => resources.p.get().meta.medals
    )
  )
  assert.deepEqual(current, ['blueprintArchitect'])
})

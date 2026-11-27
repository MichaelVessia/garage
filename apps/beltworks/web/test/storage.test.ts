import { assert, it } from '@effect/vitest'
import { createRuntime, Game, initialResources, enqueue, simulation, exportSave } from '@garage/beltworks-domain'

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
  enqueue({ type: 'placeBuilding', kind: 'belt', gx: 8, gy: 6, dir: 'S' })(source)
  source.tick(simulation)
  const data = new Map<string, string>()
  const store = () => ({
    getItem: (k: string) => data.get(k) ?? null,
    setItem: (k: string, v: string) => {
      data.set(k, v)
    },
  })
  assert.isTrue(saveBoard(store)(source))
  assert.isTrue(data.has('beltworks:save:v3'))
  const dest = blank()
  loadBoard(store)(dest)
  assert.deepEqual(exportSave(dest), exportSave(source))
  const legacy = data.get('beltworks:save:v3')
  data.clear()
  if (legacy !== undefined) {
    data.set('beltworks:save:v2', legacy)
  }
  const fresh = blank()
  loadBoard(store)(fresh)
  assert.deepEqual(exportSave(fresh), exportSave(createRuntime(0)))
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
  enqueue({ type: 'placeBuilding', gx: 8, gy: 6, dir: 'S', kind: 'belt' })(r)
  r.tick(simulation)
  assert.isTrue(history.undo())
  assert.deepEqual(exportSave(r), before)
  for (let n = 0; n < 24; n++) {
    assert.isTrue(history.undo())
  }
  assert.isFalse(history.undo())
})

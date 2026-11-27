import { assert, it } from '@effect/vitest'
import { createRuntime, exportSave, simulation } from '@garage/beltworks-domain'
import { vi } from 'vitest'

import { leaderboardPlayerId } from '../src/cloud.ts'
import { factoryInspection } from '../src/inspection.ts'
import { loadBoard, saveBoard } from '../src/storage.ts'

it('runs a shared factory while keeping the player save for reload, posting, and return', () => {
  const local = new Map<string, string>()
  const storage = () => ({
    getItem: (key: string) => local.get(key) ?? null,
    setItem: (key: string, value: string) => {
      local.set(key, value)
    },
  })
  const runtime = createRuntime(2)
  const own = exportSave(runtime)
  const inspection = factoryInspection(runtime)
  const upload = vi.fn()
  function autosave() {
    inspection.saveHome((home) => {
      upload(exportSave(home))
      saveBoard(storage)(home)
    })
  }
  autosave()
  const guest = exportSave(createRuntime(7))
  inspection.enter(guest)
  assert.deepEqual(exportSave(runtime), guest)
  runtime.tick(simulation)
  assert.notDeepEqual(exportSave(runtime), guest)
  autosave()
  assert.equal(upload.mock.calls.length, 1)
  const reload = createRuntime(0)
  loadBoard(storage)(reload)
  assert.deepEqual(exportSave(reload), own)
  assert.deepEqual(inspection.getSave(), own)
  inspection.enter(exportSave(createRuntime(8)))
  inspection.leave()
  assert.deepEqual(exportSave(runtime), own)
  runtime.tick(simulation)
  autosave()
  loadBoard(storage)(reload)
  assert.deepEqual(exportSave(reload), exportSave(runtime))
  assert.deepEqual(upload.mock.lastCall, [exportSave(runtime)])
})

it('keeps the current factory when a shared snapshot is invalid', () => {
  const runtime = createRuntime(4)
  const own = exportSave(runtime)
  const inspection = factoryInspection(runtime)
  assert.throws(() => inspection.enter({}), 'Invalid shared factory')
  assert.isFalse(inspection.visiting)
  assert.deepEqual(exportSave(runtime), own)
})

it('keeps the leaderboard identity independent of the private cloud save key', () => {
  const keys = new Map([['beltworks:player-id:v4', 'private-save-key']])
  vi.stubGlobal('localStorage', {
    getItem: (key: string) => keys.get(key) ?? null,
    setItem: (key: string, value: string) => keys.set(key, value),
  })
  try {
    const id = leaderboardPlayerId()
    assert.notEqual(id, 'private-save-key')
    assert.equal(leaderboardPlayerId(), id)
    assert.equal(keys.get('beltworks:player-id:v4'), 'private-save-key')
  } finally {
    vi.unstubAllGlobals()
  }
})

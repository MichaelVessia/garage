import { assert, it } from '@effect/vitest'
import { SabnzbdApi } from '@garage/sabnzbd'
import * as Effect from 'effect/Effect'
import * as Layer from 'effect/Layer'
import * as Ref from 'effect/Ref'
import * as Stream from 'effect/Stream'

import { SabnzbdToolkit, SabnzbdToolkitHandlers } from '../src/tools/sabnzbd.js'

const makeApiLayer = Effect.gen(function* () {
  const queueLimits = yield* Ref.make<ReadonlyArray<number>>([])
  const historyLimits = yield* Ref.make<ReadonlyArray<number>>([])
  const mutations = yield* Ref.make<ReadonlyArray<string>>([])
  const api = SabnzbdApi.of({
    status: () => Effect.succeed({ version: '4.5.3', paused: false, haveWarnings: false }),
    version: () => Effect.succeed({ version: '4.5.3' }),
    queue: ({ limit }) =>
      Ref.update(queueLimits, (limits) => [...limits, limit]).pipe(
        Effect.as({
          status: 'Downloading',
          count: 1,
          totalRecords: 12,
          slots: [{ nzoId: 'SABnzbd_nzo_abc', filename: 'Linux.ISO.2026', status: 'Downloading' }],
        })
      ),
    history: ({ limit }) =>
      Ref.update(historyLimits, (limits) => [...limits, limit]).pipe(
        Effect.as({ count: 0, totalRecords: 0, slots: [] })
      ),
    pause: () => Ref.update(mutations, (calls) => [...calls, 'pause']).pipe(Effect.as({ action: 'pause', ok: true })),
    resume: () =>
      Ref.update(mutations, (calls) => [...calls, 'resume']).pipe(Effect.as({ action: 'resume', ok: true })),
    delete: (nzoId, options) =>
      Ref.update(mutations, (calls) => [...calls, `delete:${nzoId}:${options.deleteFiles}`]).pipe(
        Effect.as({ action: 'delete', ok: true, nzoId, deleteFiles: options.deleteFiles })
      ),
    serverStats: () => Effect.succeed({ servers: {} }),
  })

  return { layer: Layer.succeed(SabnzbdApi, api), queueLimits, historyLimits, mutations }
})

it.effect('runs a bounded queue request through the SABnzbd package operation', () =>
  Effect.gen(function* () {
    const fake = yield* makeApiLayer
    const toolkit = yield* SabnzbdToolkit.pipe(Effect.provide(SabnzbdToolkitHandlers))
    const results = yield* toolkit
      .handle('sabnzbd_queue', { limit: 5 })
      .pipe(Effect.flatMap(Stream.runCollect), Effect.provide(fake.layer))

    assert.deepStrictEqual(yield* Ref.get(fake.queueLimits), [5])
    assert.strictEqual(results.length, 1)
    assert.deepStrictEqual(results[0]?.encodedResult, {
      status: 'Downloading',
      count: 1,
      totalRecords: 12,
      slots: [{ nzoId: 'SABnzbd_nzo_abc', filename: 'Linux.ISO.2026', status: 'Downloading' }],
    })
  })
)

it.effect('adapts pause, resume, and confirmed deletion without bypassing file safety', () =>
  Effect.gen(function* () {
    const fake = yield* makeApiLayer
    const toolkit = yield* SabnzbdToolkit.pipe(Effect.provide(SabnzbdToolkitHandlers))

    yield* toolkit.handle('sabnzbd_pause', {}).pipe(Effect.flatMap(Stream.runCollect), Effect.provide(fake.layer))
    yield* toolkit.handle('sabnzbd_resume', {}).pipe(Effect.flatMap(Stream.runCollect), Effect.provide(fake.layer))
    const unsafeDelete = yield* toolkit
      .handle('sabnzbd_delete', {
        nzoId: 'SABnzbd_nzo_unsafe',
        deleteFiles: true,
        confirmDeleteFiles: false,
      })
      .pipe(Effect.flatMap(Stream.runCollect), Effect.provide(fake.layer), Effect.flip)

    assert.deepStrictEqual(yield* Ref.get(fake.mutations), ['pause', 'resume'])
    if (unsafeDelete._tag !== 'GarageMcpToolError') {
      return assert.fail(`expected GarageMcpToolError, received ${unsafeDelete._tag}`)
    }
    assert.strictEqual(unsafeDelete.code, 'SABNZBD_DELETE_CONFIRMATION_REQUIRED')

    yield* toolkit
      .handle('sabnzbd_delete', {
        nzoId: 'SABnzbd_nzo_confirmed',
        deleteFiles: true,
        confirmDeleteFiles: true,
      })
      .pipe(Effect.flatMap(Stream.runCollect), Effect.provide(fake.layer))

    assert.deepStrictEqual(yield* Ref.get(fake.mutations), ['pause', 'resume', 'delete:SABnzbd_nzo_confirmed:true'])
  })
)

it.effect('adapts every read tool to its SABnzbd package operation', () =>
  Effect.gen(function* () {
    const fake = yield* makeApiLayer
    const toolkit = yield* SabnzbdToolkit.pipe(Effect.provide(SabnzbdToolkitHandlers))
    const statusResults = yield* toolkit
      .handle('sabnzbd_status', {})
      .pipe(Effect.flatMap(Stream.runCollect), Effect.provide(fake.layer))
    const versionResults = yield* toolkit
      .handle('sabnzbd_version', {})
      .pipe(Effect.flatMap(Stream.runCollect), Effect.provide(fake.layer))
    const historyResults = yield* toolkit
      .handle('sabnzbd_history', { limit: 25 })
      .pipe(Effect.flatMap(Stream.runCollect), Effect.provide(fake.layer))
    const statsResults = yield* toolkit
      .handle('sabnzbd_server_stats', {})
      .pipe(Effect.flatMap(Stream.runCollect), Effect.provide(fake.layer))

    assert.deepStrictEqual(statusResults[0]?.encodedResult, {
      version: '4.5.3',
      paused: false,
      haveWarnings: false,
    })
    assert.deepStrictEqual(versionResults[0]?.encodedResult, { version: '4.5.3' })
    assert.deepStrictEqual(historyResults[0]?.encodedResult, { count: 0, totalRecords: 0, slots: [] })
    assert.deepStrictEqual(statsResults[0]?.encodedResult, { servers: {} })
    assert.deepStrictEqual(yield* Ref.get(fake.historyLimits), [25])
  })
)

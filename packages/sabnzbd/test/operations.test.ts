import { assert, it } from '@effect/vitest'
import * as Effect from 'effect/Effect'
import * as Layer from 'effect/Layer'
import * as Ref from 'effect/Ref'

import {
  SabnzbdApi,
  SabnzbdConfig,
  deleteQueueItem,
  envMissing,
  history,
  pause,
  queue,
  resume,
  serverStats,
  status,
  version,
} from '../src/index.js'
import type { DeleteOptions, LimitOptions } from '../src/index.js'

const ConfigLayer = Layer.succeed(SabnzbdConfig, {
  get: () => Effect.fail(envMissing('SABNZBD_URL')),
})

const makeApiLayer = Effect.gen(function* () {
  const queueOptions = yield* Ref.make<ReadonlyArray<LimitOptions>>([])
  const historyOptions = yield* Ref.make<ReadonlyArray<LimitOptions>>([])
  const deleteCalls = yield* Ref.make<ReadonlyArray<{ readonly nzoId: string; readonly options: DeleteOptions }>>([])
  const api = SabnzbdApi.of({
    status: () =>
      Effect.succeed({
        version: '4.5.3',
        uptime: '1d',
        paused: false,
        pausedAll: false,
        speedlimit: '0',
        speedlimitAbs: '0',
        diskspace1Norm: '1 TB',
        haveWarnings: false,
        warnings: [],
      }),
    version: () => Effect.succeed({ version: '4.5.3' }),
    queue: (options) =>
      Ref.update(queueOptions, (records) => [...records, options]).pipe(
        Effect.as({
          status: 'Downloading',
          paused: false,
          speed: '5 MB/s',
          speedlimit: '0',
          timeleft: '00:10:00',
          mb: '1000',
          mbleft: '100',
          noofslots: 1,
          count: 1,
          totalRecords: 22,
          slots: [
            {
              nzoId: 'SABnzbd_nzo_abc',
              filename: 'Linux.ISO.2026',
              status: 'Downloading',
              priority: 'Normal',
              category: 'software',
              mb: '1000',
              mbleft: '100',
              percentage: '90',
              timeleft: '00:10:00',
            },
          ],
        })
      ),
    history: (options) =>
      Ref.update(historyOptions, (records) => [...records, options]).pipe(
        Effect.as({
          totalSize: '10 GB',
          monthSize: '4 GB',
          weekSize: '1 GB',
          daySize: '100 MB',
          noofslots: 44,
          count: 1,
          totalRecords: 44,
          slots: [
            {
              nzoId: 'SABnzbd_nzo_done',
              name: 'Linux ISO Done',
              status: 'Completed',
              category: 'software',
              bytes: 1024,
              failMessage: '',
              storage: '/downloads/Linux ISO Done',
              completed: 1_766_000_000,
            },
          ],
        })
      ),
    pause: () => Effect.succeed({ action: 'pause', ok: true }),
    resume: () => Effect.succeed({ action: 'resume', ok: true }),
    delete: (nzoId, options) =>
      Ref.update(deleteCalls, (records) => [...records, { nzoId, options }]).pipe(
        Effect.as({ action: 'delete', ok: true, nzoId, deleteFiles: options.deleteFiles })
      ),
    serverStats: () =>
      Effect.succeed({
        total: 1000,
        month: 400,
        week: 100,
        day: 10,
        servers: { 'news.example.test': { total: 1000, month: 400, week: 100, day: 10 } },
      }),
  })

  return { layer: Layer.succeed(SabnzbdApi, api), queueOptions, historyOptions, deleteCalls }
})

it.effect('returns status, version, queue, history, and server stats without preflight config reads', () =>
  Effect.gen(function* () {
    const fake = yield* makeApiLayer
    const layer = Layer.mergeAll(ConfigLayer, fake.layer)

    const statusResult = yield* status.pipe(Effect.provide(layer))
    const versionResult = yield* version.pipe(Effect.provide(layer))
    const queueResult = yield* queue({ limit: 5 }).pipe(Effect.provide(layer))
    const historyResult = yield* history({ limit: 25 }).pipe(Effect.provide(layer))
    const statsResult = yield* serverStats.pipe(Effect.provide(layer))
    const queueOptions = yield* Ref.get(fake.queueOptions)
    const historyOptions = yield* Ref.get(fake.historyOptions)

    assert.strictEqual(statusResult.version, '4.5.3')
    assert.deepStrictEqual(versionResult, { version: '4.5.3' })
    assert.strictEqual(queueResult.totalRecords, 22)
    assert.strictEqual(historyResult.totalRecords, 44)
    assert.deepStrictEqual(queueOptions, [{ limit: 5 }])
    assert.deepStrictEqual(historyOptions, [{ limit: 25 }])
    assert.strictEqual(statsResult.servers['news.example.test']?.day, 10)
  })
)

it.effect('runs queue mutations through the API service without preflight config reads', () =>
  Effect.gen(function* () {
    const fake = yield* makeApiLayer
    const layer = Layer.mergeAll(ConfigLayer, fake.layer)

    const pauseResult = yield* pause.pipe(Effect.provide(layer))
    const resumeResult = yield* resume.pipe(Effect.provide(layer))
    const deleteResult = yield* deleteQueueItem('SABnzbd_nzo_abc', { deleteFiles: true }).pipe(Effect.provide(layer))
    const deleteCalls = yield* Ref.get(fake.deleteCalls)

    assert.deepStrictEqual(pauseResult, { action: 'pause', ok: true })
    assert.deepStrictEqual(resumeResult, { action: 'resume', ok: true })
    assert.deepStrictEqual(deleteResult, {
      action: 'delete',
      ok: true,
      nzoId: 'SABnzbd_nzo_abc',
      deleteFiles: true,
    })
    assert.deepStrictEqual(deleteCalls, [{ nzoId: 'SABnzbd_nzo_abc', options: { deleteFiles: true } }])
  })
)

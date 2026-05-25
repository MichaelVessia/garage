import { assert, it } from '@effect/vitest'
import { SabnzbdApi, SabnzbdConfig, envMissing } from '@garage/sabnzbd'
import type { DeleteOptions, LimitOptions } from '@garage/sabnzbd'
import { Effect, Layer, Redacted, Ref } from 'effect'

import { executeSabnzbd } from '../src/index.js'

const ConfigLayer = Layer.succeed(SabnzbdConfig, {
  get: () =>
    Effect.succeed({
      url: 'http://sabnzbd.example.test',
      apiKey: Redacted.make('secret'),
    }),
})

const MissingConfigLayer = Layer.succeed(SabnzbdConfig, {
  get: () => Effect.fail(envMissing('SABNZBD_URL')),
})

const makeApiLayer = Effect.gen(function* () {
  const queueOptions = yield* Ref.make<ReadonlyArray<LimitOptions>>([])
  const historyOptions = yield* Ref.make<ReadonlyArray<LimitOptions>>([])
  const deleteCalls = yield* Ref.make<ReadonlyArray<{ readonly nzoId: string; readonly options: DeleteOptions }>>([])
  const layer = Layer.effect(
    SabnzbdApi,
    Effect.gen(function* () {
      const config = yield* SabnzbdConfig
      const configured = <A>(effect: Effect.Effect<A>) => config.get().pipe(Effect.andThen(effect))
      return SabnzbdApi.of({
        status: () =>
          configured(
            Effect.succeed({ version: '4.5.3', uptime: '1d', paused: false, pausedAll: false, haveWarnings: false })
          ),
        version: () => configured(Effect.succeed({ version: '4.5.3' })),
        queue: (options) =>
          configured(
            Ref.update(queueOptions, (records) => [...records, options]).pipe(
              Effect.as({
                status: 'Downloading',
                paused: false,
                count: 1,
                totalRecords: 22,
                slots: [{ nzoId: 'SABnzbd_nzo_abc', filename: 'Linux.ISO.2026', status: 'Downloading' }],
              })
            )
          ),
        history: (options) =>
          configured(
            Ref.update(historyOptions, (records) => [...records, options]).pipe(
              Effect.as({
                totalSize: '10 GB',
                noofslots: 44,
                count: 1,
                totalRecords: 44,
                slots: [{ nzoId: 'SABnzbd_nzo_done', name: 'Linux ISO Done', status: 'Completed' }],
              })
            )
          ),
        pause: () => configured(Effect.succeed({ action: 'pause', ok: true })),
        resume: () => configured(Effect.succeed({ action: 'resume', ok: true })),
        delete: (nzoId, options) =>
          configured(
            Ref.update(deleteCalls, (records) => [...records, { nzoId, options }]).pipe(
              Effect.as({ action: 'delete', ok: true, nzoId, deleteFiles: options.deleteFiles })
            )
          ),
        serverStats: () =>
          configured(
            Effect.succeed({
              total: 1000,
              month: 400,
              week: 100,
              day: 10,
              servers: { 'news.example.test': { total: 1000, month: 400, week: 100, day: 10 } },
            })
          ),
      })
    })
  )

  return { layer, queueOptions, historyOptions, deleteCalls }
})

it.effect('root command returns a self-documenting command tree and health summary', () =>
  Effect.gen(function* () {
    const fake = yield* makeApiLayer
    const envelope = yield* executeSabnzbd([]).pipe(Effect.provide(fake.layer.pipe(Layer.provideMerge(ConfigLayer))))

    assert.strictEqual(envelope.ok, true)
    if (!envelope.ok) {
      assert.fail('expected success envelope')
    }
    if (!('commands' in envelope.result)) {
      assert.fail('expected root command result')
    }

    assert.strictEqual(envelope.command, 'sabnzbd')
    assert.deepStrictEqual(envelope.result.health, { configured: true, version: '4.5.3', paused: false })
    assert.deepStrictEqual(
      envelope.result.commands.map((command) => command.command),
      [
        'sabnzbd',
        'sabnzbd status',
        'sabnzbd version',
        'sabnzbd queue [--limit <n>]',
        'sabnzbd history [--limit <n>]',
        'sabnzbd pause',
        'sabnzbd resume',
        'sabnzbd delete <nzo-id> [--files] [--confirm-delete-files]',
        'sabnzbd server-stats',
      ]
    )
  })
)

it.effect('root command still returns the command tree when credentials are missing', () =>
  Effect.gen(function* () {
    const fake = yield* makeApiLayer
    const envelope = yield* executeSabnzbd([]).pipe(
      Effect.provide(fake.layer.pipe(Layer.provideMerge(MissingConfigLayer)))
    )

    assert.strictEqual(envelope.ok, true)
    if (!envelope.ok) {
      assert.fail('expected success envelope')
    }
    if (!('health' in envelope.result)) {
      assert.fail('expected root command result')
    }

    assert.deepStrictEqual(envelope.result.health, { configured: false })
    assert.deepStrictEqual(envelope.next_actions, [
      {
        command: 'sabnzbd',
        description: 'Open a fresh shell after SABNZBD_URL and SABNZBD_API_KEY are exported',
      },
    ])
  })
)

it.effect('missing env on subcommands renders a recoverable error envelope', () =>
  Effect.gen(function* () {
    const fake = yield* makeApiLayer
    const envelope = yield* executeSabnzbd(['status']).pipe(
      Effect.provide(fake.layer.pipe(Layer.provideMerge(MissingConfigLayer)))
    )

    assert.deepStrictEqual(envelope, {
      ok: false,
      command: 'sabnzbd status',
      error: {
        code: 'SABNZBD_ENV_MISSING',
        message: 'SABNZBD_URL is not set',
      },
      fix: 'Open a fresh shell so sops-nix exports SABNZBD_URL and SABNZBD_API_KEY from modules/programs/shell.nix.',
      next_actions: [{ command: 'sabnzbd', description: 'Show available commands' }],
    })
  })
)

it.effect('queue and history commands pass bounded limits', () =>
  Effect.gen(function* () {
    const fake = yield* makeApiLayer
    const layer = fake.layer.pipe(Layer.provideMerge(ConfigLayer))

    yield* executeSabnzbd(['queue', '--limit', '5']).pipe(Effect.provide(layer))
    yield* executeSabnzbd(['history', '25']).pipe(Effect.provide(layer))
    const queueOptions = yield* Ref.get(fake.queueOptions)
    const historyOptions = yield* Ref.get(fake.historyOptions)

    assert.deepStrictEqual(queueOptions, [{ limit: 5 }])
    assert.deepStrictEqual(historyOptions, [{ limit: 25 }])
  })
)

it.effect('delete with files requires explicit confirmation', () =>
  Effect.gen(function* () {
    const fake = yield* makeApiLayer
    const layer = fake.layer.pipe(Layer.provideMerge(ConfigLayer))

    const blocked = yield* executeSabnzbd(['delete', 'SABnzbd_nzo_abc', '--files']).pipe(Effect.provide(layer))
    const allowed = yield* executeSabnzbd(['delete', 'SABnzbd_nzo_abc', '--files', '--confirm-delete-files']).pipe(
      Effect.provide(layer)
    )
    const deleteCalls = yield* Ref.get(fake.deleteCalls)

    assert.deepStrictEqual(blocked, {
      ok: false,
      command: 'sabnzbd delete SABnzbd_nzo_abc --files',
      error: {
        code: 'SABNZBD_DELETE_CONFIRMATION_REQUIRED',
        message: 'Deleting downloaded files requires --confirm-delete-files',
      },
      fix: 'Re-run with --confirm-delete-files only if you intend to delete downloaded files from disk.',
      next_actions: [
        {
          command: 'sabnzbd delete <nzo-id>',
          description: 'Delete the queue item while keeping downloaded files',
          params: { 'nzo-id': { value: 'SABnzbd_nzo_abc', description: 'SABnzbd NZO ID' } },
        },
      ],
    })
    assert.strictEqual(allowed.ok, true)
    assert.deepStrictEqual(deleteCalls, [{ nzoId: 'SABnzbd_nzo_abc', options: { deleteFiles: true } }])
  })
)

it.effect('pause, resume, version, and server-stats dispatch to operations', () =>
  Effect.gen(function* () {
    const fake = yield* makeApiLayer
    const layer = fake.layer.pipe(Layer.provideMerge(ConfigLayer))

    const versionEnvelope = yield* executeSabnzbd(['version']).pipe(Effect.provide(layer))
    const pauseEnvelope = yield* executeSabnzbd(['pause']).pipe(Effect.provide(layer))
    const resumeEnvelope = yield* executeSabnzbd(['resume']).pipe(Effect.provide(layer))
    const statsEnvelope = yield* executeSabnzbd(['server-stats']).pipe(Effect.provide(layer))

    assert.strictEqual(versionEnvelope.ok, true)
    assert.strictEqual(pauseEnvelope.ok, true)
    assert.strictEqual(resumeEnvelope.ok, true)
    assert.strictEqual(statsEnvelope.ok, true)
  })
)

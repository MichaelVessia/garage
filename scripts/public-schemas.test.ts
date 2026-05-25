import { assert, it } from '@effect/vitest'
import { Schema } from 'effect'

import { ProtectionToggleOptionsSchema } from '../packages/adguard/src/index.js'
import { BookInfoRecordSchema } from '../packages/autocaliweb/src/index.js'
import { ReloadResultSchema } from '../packages/caddy/src/index.js'
import { CliEnvelopeSchema, successEnvelope } from '../packages/cli-protocol/src/index.js'
import { AlbumInfoSchema } from '../packages/immich/src/index.js'
import { RunTaskResultSchema } from '../packages/jellyfin/src/index.js'
import { DeleteRequestResultSchema } from '../packages/jellyseerr/src/index.js'
import { SearchOptionsSchema as ProwlarrSearchOptionsSchema } from '../packages/prowlarr/src/index.js'
import { MovieLookupResultSchema } from '../packages/radarr/src/index.js'
import { ActionResultSchema, DeleteOptionsSchema } from '../packages/sabnzbd/src/index.js'
import {
  SeriesLookupResultSchema,
  decodeError as sonarrDecodeError,
  unreachable as sonarrUnreachable,
} from '../packages/sonarr/src/index.js'
import {
  StatusResultSchema as TailscaleStatusResultSchema,
  commandFailed as tailscaleCommandFailed,
  decodeError as tailscaleDecodeError,
} from '../packages/tailscale/src/index.js'
import { SubscriptionResultSchema } from '../packages/tubearchivist/src/index.js'

it('exports public schemas for normalized models and envelopes', () => {
  assert.deepStrictEqual(
    Schema.decodeUnknownSync(SeriesLookupResultSchema)({
      title: 'Linux ISO Weekly',
      tvdbId: 371_980,
      tvdbUrl: 'https://thetvdb.com/dereferrer/series/371980',
    }),
    {
      title: 'Linux ISO Weekly',
      tvdbId: 371_980,
      tvdbUrl: 'https://thetvdb.com/dereferrer/series/371980',
    }
  )
  assert.deepStrictEqual(
    Schema.decodeUnknownSync(MovieLookupResultSchema)({
      title: 'Linux ISO Weekly',
      tmdbId: 95_396,
      tmdbUrl: 'https://themoviedb.org/movie/95396',
    }),
    {
      title: 'Linux ISO Weekly',
      tmdbId: 95_396,
      tmdbUrl: 'https://themoviedb.org/movie/95396',
    }
  )
  assert.deepStrictEqual(
    Schema.decodeUnknownSync(AlbumInfoSchema)({
      id: 'album-1',
      assets: { count: 0, records: [] },
      moreAssetsAvailable: false,
    }),
    {
      id: 'album-1',
      assets: { count: 0, records: [] },
      moreAssetsAvailable: false,
    }
  )
  assert.deepStrictEqual(
    Schema.decodeUnknownSync(TailscaleStatusResultSchema)({
      peerCount: 0,
      onlinePeerCount: 0,
      exitNodeCount: 0,
      health: [],
      peers: { count: 0, records: [] },
    }),
    {
      peerCount: 0,
      onlinePeerCount: 0,
      exitNodeCount: 0,
      health: [],
      peers: { count: 0, records: [] },
    }
  )
  assert.deepStrictEqual(
    Schema.decodeUnknownSync(SubscriptionResultSchema)({ target: 'UC123', subscribed: true, response: {} }),
    { target: 'UC123', subscribed: true, response: {} }
  )
  assert.deepStrictEqual(
    Schema.decodeUnknownSync(BookInfoRecordSchema)({
      authors: [],
      languages: [],
      categories: [],
      downloads: [],
      formats: [],
      tags: [],
    }),
    {
      authors: [],
      languages: [],
      categories: [],
      downloads: [],
      formats: [],
      tags: [],
    }
  )
  assert.deepStrictEqual(Schema.decodeUnknownSync(ReloadResultSchema)({ reloaded: true, httpStatus: 200 }), {
    reloaded: true,
    httpStatus: 200,
  })
  assert.deepStrictEqual(
    Schema.decodeUnknownSync(RunTaskResultSchema)({ started: true, taskId: 'task-1', httpStatus: 204 }),
    {
      started: true,
      taskId: 'task-1',
      httpStatus: 204,
    }
  )
  assert.deepStrictEqual(
    Schema.decodeUnknownSync(DeleteRequestResultSchema)({ deleted: true, requestId: 1, httpStatus: 200 }),
    { deleted: true, requestId: 1, httpStatus: 200 }
  )
  assert.deepStrictEqual(
    Schema.decodeUnknownSync(ActionResultSchema)({ action: 'delete', ok: true, deleteFiles: false }),
    {
      action: 'delete',
      ok: true,
      deleteFiles: false,
    }
  )
  assert.deepStrictEqual(
    Schema.decodeUnknownSync(CliEnvelopeSchema(Schema.String))(successEnvelope({ command: 'test', result: 'ok' })),
    { ok: true, command: 'test', result: 'ok', next_actions: [] }
  )
})

it('rejects invalid public options at runtime', () => {
  assert.throws(() => Schema.decodeUnknownSync(ProwlarrSearchOptionsSchema)({ limit: 10, protocol: 'invalid' }))
  assert.throws(() => Schema.decodeUnknownSync(ProtectionToggleOptionsSchema)({ state: 'invalid' }))
  assert.throws(() => Schema.decodeUnknownSync(DeleteOptionsSchema)({ deleteFiles: 'yes' }))
})

it('preserves underlying causes on transport, process, and decode errors', () => {
  const transportCause = new Error('socket closed')
  const decodeCause = new Error('unexpected shape')
  const processCause = new Error('spawn failed')

  assert.strictEqual(Reflect.get(sonarrUnreachable('network failed', transportCause), 'cause'), transportCause)
  assert.strictEqual(Reflect.get(sonarrDecodeError('decode failed', decodeCause), 'cause'), decodeCause)
  assert.strictEqual(
    Reflect.get(tailscaleCommandFailed('tailscale status', 1, 'failed', processCause), 'cause'),
    processCause
  )
  assert.strictEqual(Reflect.get(tailscaleDecodeError('json failed', decodeCause), 'cause'), decodeCause)
})

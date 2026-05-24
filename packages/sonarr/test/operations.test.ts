import { assert, it } from '@effect/vitest'
import { Effect, Layer, Option, Ref } from 'effect'

import {
  SonarrApi,
  SonarrConfig,
  addSeries,
  calendar,
  config,
  exists,
  history,
  missing,
  queue,
  removeSeries,
  search,
  status,
} from '../src/index.js'

const rootFolders = [{ id: 1, path: '/tv', freeSpace: 1_000_000 }]
const qualityProfiles = [{ id: 1, name: 'HD-1080p' }]
const severanceLookup = {
  title: 'Severance',
  year: 2022,
  tvdbId: 371_980,
  tvdbUrl: 'https://thetvdb.com/dereferrer/series/371980',
}
const severanceSeries = { id: 42, title: 'Severance', tvdbId: 371_980, year: 2022 }

const ConfigLayer = Layer.succeed(SonarrConfig, {
  get: Effect.succeed({
    url: 'http://sonarr.lan',
    apiKey: 'secret',
    defaultQualityProfileId: 1,
  }),
})

const makeApiLayer = Effect.gen(function* () {
  const removedDeleteFiles = yield* Ref.make<ReadonlyArray<boolean>>([])
  const addedSearchFlags = yield* Ref.make<ReadonlyArray<boolean>>([])
  const api = SonarrApi.of({
    status: Effect.succeed({ appName: 'Sonarr', version: '4.0.0' }),
    rootFolders: Effect.succeed(rootFolders),
    qualityProfiles: Effect.succeed(qualityProfiles),
    lookupSeries: (query) => Effect.succeed(query === 'Severance' ? [severanceLookup] : []),
    lookupSeriesByTvdbId: (tvdbId) => Effect.succeed(tvdbId === 371_980 ? Option.some(severanceLookup) : Option.none()),
    getSeriesByTvdbId: (tvdbId) => Effect.succeed(tvdbId === 371_980 ? Option.some(severanceSeries) : Option.none()),
    addSeries: (_lookup, options) =>
      Ref.update(addedSearchFlags, (flags) => [...flags, options.searchForMissingEpisodes]).pipe(
        Effect.as(severanceSeries)
      ),
    removeSeries: (_seriesId, options) =>
      Ref.update(removedDeleteFiles, (flags) => [...flags, options.deleteFiles]).pipe(Effect.asVoid),
    queue: Effect.succeed([
      { title: 'Episode 1', seriesTitle: 'Severance', status: 'downloading' },
      { title: 'Episode 2', seriesTitle: 'Severance', status: 'queued' },
    ]),
    calendar: (_days) => Effect.succeed([{ title: 'Tomorrow', seriesTitle: 'Severance', airDateUtc: '2026-05-24' }]),
    missing: Effect.succeed([
      { title: 'Missing 1', seriesTitle: 'Severance', airDateUtc: '2026-05-20' },
      { title: 'Missing 2', seriesTitle: 'Severance', airDateUtc: '2026-05-21' },
    ]),
    history: Effect.succeed([
      { title: 'Grabbed 1', seriesTitle: 'Severance', eventType: 'grabbed' },
      { title: 'Imported 1', seriesTitle: 'Severance', eventType: 'downloadFolderImported' },
    ]),
  })

  return {
    layer: Layer.succeed(SonarrApi, api),
    removedDeleteFiles,
    addedSearchFlags,
  }
})

it.effect('reads status through the SonarrApi service', () =>
  Effect.gen(function* () {
    const fake = yield* makeApiLayer
    const result = yield* status.pipe(Effect.provide(Layer.mergeAll(ConfigLayer, fake.layer)))

    assert.deepStrictEqual(result, { appName: 'Sonarr', version: '4.0.0' })
  })
)

it.effect('returns bounded search results with TVDB URLs', () =>
  Effect.gen(function* () {
    const fake = yield* makeApiLayer
    const result = yield* search('Severance', { limit: 10 }).pipe(
      Effect.provide(Layer.mergeAll(ConfigLayer, fake.layer))
    )

    assert.deepStrictEqual(result, {
      query: 'Severance',
      count: 1,
      results: [severanceLookup],
    })
  })
)

it.effect('reports whether a TVDB id already exists', () =>
  Effect.gen(function* () {
    const fake = yield* makeApiLayer
    const result = yield* exists(371_980).pipe(Effect.provide(Layer.mergeAll(ConfigLayer, fake.layer)))

    assert.deepStrictEqual(result, {
      tvdbId: 371_980,
      exists: true,
      series: severanceSeries,
    })
  })
)

it.effect('adds a resolved series with default quality and disabled search when requested', () =>
  Effect.gen(function* () {
    const fake = yield* makeApiLayer
    const result = yield* addSeries(371_980, { searchForMissingEpisodes: false }).pipe(
      Effect.provide(Layer.mergeAll(ConfigLayer, fake.layer))
    )
    const searchFlags = yield* Ref.get(fake.addedSearchFlags)

    assert.deepStrictEqual(result, {
      added: true,
      series: severanceSeries,
      qualityProfileId: 1,
      rootFolderPath: '/tv',
      searchForMissingEpisodes: false,
    })
    assert.deepStrictEqual(searchFlags, [false])
  })
)

it.effect('removes a series and preserves files by default', () =>
  Effect.gen(function* () {
    const fake = yield* makeApiLayer
    const result = yield* removeSeries(371_980, { deleteFiles: false }).pipe(
      Effect.provide(Layer.mergeAll(ConfigLayer, fake.layer))
    )
    const deleteFlags = yield* Ref.get(fake.removedDeleteFiles)

    assert.deepStrictEqual(result, { removed: true, tvdbId: 371_980, deleteFiles: false })
    assert.deepStrictEqual(deleteFlags, [false])
  })
)

it.effect('bounds list operations at the requested limit', () =>
  Effect.gen(function* () {
    const fake = yield* makeApiLayer
    const layer = Layer.mergeAll(ConfigLayer, fake.layer)

    assert.deepStrictEqual(yield* queue({ limit: 1 }).pipe(Effect.provide(layer)), {
      count: 1,
      records: [{ title: 'Episode 1', seriesTitle: 'Severance', status: 'downloading' }],
    })
    assert.deepStrictEqual(yield* missing({ limit: 1 }).pipe(Effect.provide(layer)), {
      count: 1,
      records: [{ title: 'Missing 1', seriesTitle: 'Severance', airDateUtc: '2026-05-20' }],
    })
    assert.deepStrictEqual(yield* history({ limit: 1 }).pipe(Effect.provide(layer)), {
      count: 1,
      records: [{ title: 'Grabbed 1', seriesTitle: 'Severance', eventType: 'grabbed' }],
    })
  })
)

it.effect('passes calendar day windows to the API', () =>
  Effect.gen(function* () {
    const fake = yield* makeApiLayer
    const result = yield* calendar({ days: 14 }).pipe(Effect.provide(Layer.mergeAll(ConfigLayer, fake.layer)))

    assert.deepStrictEqual(result, {
      days: 14,
      count: 1,
      records: [{ title: 'Tomorrow', seriesTitle: 'Severance', airDateUtc: '2026-05-24' }],
    })
  })
)

it.effect('returns root folders and quality profiles for config inspection', () =>
  Effect.gen(function* () {
    const fake = yield* makeApiLayer
    const result = yield* config.pipe(Effect.provide(Layer.mergeAll(ConfigLayer, fake.layer)))

    assert.deepStrictEqual(result, { rootFolders, qualityProfiles })
  })
)

import { assert, it } from '@effect/vitest'
import * as Effect from 'effect/Effect'
import * as Layer from 'effect/Layer'
import * as Logger from 'effect/Logger'
import * as Option from 'effect/Option'
import * as Redacted from 'effect/Redacted'
import * as References from 'effect/References'

import { notFound, SonarrApi, SonarrConfig, status } from '../src/index.js'

it.effect('annotates operation logs with package and operation', () =>
  Effect.gen(function* () {
    const annotations: Array<Record<string, unknown>> = []
    const logger = Logger.make((options) => {
      annotations.push({ ...options.fiber.getRef(References.CurrentLogAnnotations) })
    })

    const ConfigLayer = Layer.succeed(SonarrConfig, {
      get: () =>
        Effect.succeed({ url: 'http://sonarr.test', apiKey: Redacted.make('key'), defaultQualityProfileId: 1 }),
    })
    const ApiLayer = Layer.succeed(
      SonarrApi,
      SonarrApi.of({
        status: () => Effect.logInfo('status called').pipe(Effect.as({ appName: 'Sonarr', version: '1.0.0' })),
        rootFolders: () => Effect.succeed([]),
        qualityProfiles: () => Effect.succeed([]),
        lookupSeries: () => Effect.succeed([]),
        lookupSeriesByTvdbId: () => Effect.succeed(Option.none()),
        getSeriesByTvdbId: () => Effect.succeed(Option.none()),
        addSeries: () => Effect.fail(notFound('unused')),
        removeSeries: () => Effect.void,
        queue: () => Effect.succeed({ count: 0, totalRecords: 0, records: [] }),
        calendar: () => Effect.succeed([]),
        missing: () => Effect.succeed({ count: 0, totalRecords: 0, records: [] }),
        history: () => Effect.succeed({ count: 0, totalRecords: 0, records: [] }),
      })
    )

    yield* status.pipe(Effect.provide(Layer.mergeAll(ConfigLayer, ApiLayer, Logger.layer([logger]))))

    assert.deepStrictEqual(annotations[0], { package: '@garage/sonarr', operation: 'status' })
  })
)

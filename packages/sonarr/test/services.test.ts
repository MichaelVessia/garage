import { assert, it } from '@effect/vitest'
import { ConfigProvider, Effect, Layer, Ref } from 'effect'

import { SonarrConfig, SonarrConfigLive } from '../src/index.js'

it.effect('SonarrConfigLive caches resolved configuration values per layer instance', () =>
  Effect.gen(function* () {
    const reads = yield* Ref.make(0)
    const env: Readonly<Record<string, string>> = {
      SONARR_URL: 'http://sonarr.test',
      SONARR_API_KEY: 'secret',
      SONARR_DEFAULT_QUALITY_PROFILE: '7',
    }
    const provider = ConfigProvider.make((path) =>
      Ref.update(reads, (count) => count + 1).pipe(
        Effect.map(() => {
          const value = env[path.join('_')]
          return value === undefined ? undefined : ConfigProvider.makeValue(value)
        })
      )
    )
    const layer = Layer.mergeAll(SonarrConfigLive, ConfigProvider.layer(provider))
    yield* Effect.gen(function* () {
      const config = yield* SonarrConfig

      assert.deepStrictEqual(yield* config.get(), {
        url: 'http://sonarr.test',
        apiKey: 'secret',
        defaultQualityProfileId: 7,
      })
      assert.deepStrictEqual(yield* config.get(), {
        url: 'http://sonarr.test',
        apiKey: 'secret',
        defaultQualityProfileId: 7,
      })
    }).pipe(Effect.provide(layer))
    assert.strictEqual(yield* Ref.get(reads), 3)
  })
)

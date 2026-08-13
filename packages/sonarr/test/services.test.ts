import { assert, it } from '@effect/vitest'
import * as ConfigProvider from 'effect/ConfigProvider'
import * as Effect from 'effect/Effect'
import * as Layer from 'effect/Layer'
import * as Redacted from 'effect/Redacted'
import * as Ref from 'effect/Ref'

import { SonarrConfig, SonarrConfigLive } from '../src/index.js'

const fixtureValue = (key: string): string | undefined => {
  if (key === 'SONARR_URL') {
    return 'http://sonarr.test'
  }
  if (key === 'SONARR_API_KEY') {
    return 'secret'
  }
  if (key === 'SONARR_DEFAULT_QUALITY_PROFILE') {
    return '7'
  }
  return undefined
}

const assertConfig = (actual: {
  readonly url: string
  readonly apiKey: Redacted.Redacted
  readonly defaultQualityProfileId: number
}): void => {
  assert.strictEqual(actual.url, 'http://sonarr.test')
  assert.strictEqual(Redacted.value(actual.apiKey), 'secret')
  assert.strictEqual(actual.defaultQualityProfileId, 7)
}

it.effect('SonarrConfigLive caches resolved configuration values per layer instance', () =>
  Effect.gen(function* () {
    const reads = yield* Ref.make(0)
    const provider = ConfigProvider.make((path) =>
      Ref.update(reads, (count) => count + 1).pipe(
        Effect.map(() => {
          const value = fixtureValue(path.join('_'))
          return value === undefined ? undefined : ConfigProvider.makeValue(value)
        })
      )
    )
    const layer = Layer.mergeAll(SonarrConfigLive, ConfigProvider.layer(provider))
    yield* Effect.gen(function* () {
      const config = yield* SonarrConfig

      assertConfig(yield* config.get())
      assertConfig(yield* config.get())
    }).pipe(Effect.provide(layer))
    assert.strictEqual(yield* Ref.get(reads), 3)
  })
)

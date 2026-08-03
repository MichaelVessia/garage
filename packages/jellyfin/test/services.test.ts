import { assert, it } from '@effect/vitest'
import * as ConfigProvider from 'effect/ConfigProvider'
import * as Effect from 'effect/Effect'
import * as Layer from 'effect/Layer'
import * as Redacted from 'effect/Redacted'

import { JellyfinConfig, JellyfinConfigLive } from '../src/index.js'

const loadConfig = (env: Readonly<Record<string, string>>) =>
  Effect.gen(function* () {
    const service = yield* JellyfinConfig
    const config = yield* service.get()
    return { ...config, apiKey: Redacted.value(config.apiKey) }
  }).pipe(Effect.provide(Layer.mergeAll(JellyfinConfigLive, ConfigProvider.layer(ConfigProvider.fromEnv({ env })))))

it.effect('JellyfinConfigLive reads JELLYFIN_USER_ID as an optional non-secret value', () =>
  Effect.gen(function* () {
    const required = {
      JELLYFIN_URL: 'http://jellyfin.example.test',
      JELLYFIN_API_KEY: 'secret',
    }

    assert.deepStrictEqual(yield* loadConfig(required), {
      url: 'http://jellyfin.example.test',
      apiKey: 'secret',
    })
    assert.deepStrictEqual(yield* loadConfig({ ...required, JELLYFIN_USER_ID: 'viewer' }), {
      url: 'http://jellyfin.example.test',
      apiKey: 'secret',
      userId: 'viewer',
    })

    assert.deepStrictEqual(yield* loadConfig({ ...required, JELLYFIN_USER_ID: '' }), {
      url: 'http://jellyfin.example.test',
      apiKey: 'secret',
    })
  })
)

import { assert, it } from '@effect/vitest'
import * as ConfigProvider from 'effect/ConfigProvider'
import * as Effect from 'effect/Effect'
import * as Layer from 'effect/Layer'
import * as Redacted from 'effect/Redacted'

import { AutocaliwebConfig, AutocaliwebConfigLive } from '../packages/autocaliweb/src/index.js'
import { SabnzbdConfig, SabnzbdConfigLive } from '../packages/sabnzbd/src/index.js'

const envLayer = (env: Readonly<Record<string, string>>) => ConfigProvider.layer(ConfigProvider.fromEnv({ env }))

const assertRedactedValue = (actual: Redacted.Redacted, expected: string): void => {
  assert.isTrue(Redacted.isRedacted(actual))
  assert.strictEqual(Redacted.value(actual), expected)
}

it.effect('redacts secret config values from retained live integration layers', () =>
  Effect.gen(function* () {
    const autocaliweb = yield* Effect.gen(function* () {
      const config = yield* AutocaliwebConfig
      return yield* config.get()
    }).pipe(
      Effect.provide(
        Layer.mergeAll(
          AutocaliwebConfigLive,
          envLayer({
            AUTOCALIWEB_URL: 'http://autocaliweb.test',
            AUTOCALIWEB_USERNAME: 'admin',
            AUTOCALIWEB_PASSWORD: 'secret',
          })
        )
      )
    )
    assertRedactedValue(autocaliweb.password, 'secret')

    const sabnzbd = yield* Effect.gen(function* () {
      const config = yield* SabnzbdConfig
      return yield* config.get()
    }).pipe(
      Effect.provide(
        Layer.mergeAll(SabnzbdConfigLive, envLayer({ SABNZBD_URL: 'http://sabnzbd.test', SABNZBD_API_KEY: 'secret' }))
      )
    )
    assertRedactedValue(sabnzbd.apiKey, 'secret')
  })
)

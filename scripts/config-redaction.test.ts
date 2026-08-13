import { assert, it } from '@effect/vitest'
import * as ConfigProvider from 'effect/ConfigProvider'
import * as Effect from 'effect/Effect'
import * as Layer from 'effect/Layer'
import * as Redacted from 'effect/Redacted'

import { AdguardConfig, AdguardConfigLive } from '../packages/adguard/src/index.js'
import { AutocaliwebConfig, AutocaliwebConfigLive } from '../packages/autocaliweb/src/index.js'
import { ImmichConfig, ImmichConfigLive } from '../packages/immich/src/index.js'
import { JellyfinConfig, JellyfinConfigLive } from '../packages/jellyfin/src/index.js'
import { JellyseerrConfig, JellyseerrConfigLive } from '../packages/jellyseerr/src/index.js'
import { ProwlarrConfig, ProwlarrConfigLive } from '../packages/prowlarr/src/index.js'
import { RadarrConfig, RadarrConfigLive } from '../packages/radarr/src/index.js'
import { SabnzbdConfig, SabnzbdConfigLive } from '../packages/sabnzbd/src/index.js'
import { SonarrConfig, SonarrConfigLive } from '../packages/sonarr/src/index.js'
import { TubearchivistConfig, TubearchivistConfigLive } from '../packages/tubearchivist/src/index.js'

const envLayer = (env: Readonly<Record<string, string>>) => ConfigProvider.layer(ConfigProvider.fromEnv({ env }))

const assertRedactedValue = (actual: Redacted.Redacted, expected: string): void => {
  assert.isTrue(Redacted.isRedacted(actual))
  assert.strictEqual(Redacted.value(actual), expected)
}

it.effect('redacts secret config values from live config layers', () =>
  Effect.gen(function* () {
    const adguard = yield* Effect.gen(function* () {
      const config = yield* AdguardConfig
      return yield* config.get()
    }).pipe(
      Effect.provide(
        Layer.mergeAll(
          AdguardConfigLive,
          envLayer({ ADGUARD_URL: 'http://adguard.test', ADGUARD_USERNAME: 'admin', ADGUARD_PASSWORD: 'secret' })
        )
      )
    )
    assertRedactedValue(adguard.password, 'secret')

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

    const immich = yield* Effect.gen(function* () {
      const config = yield* ImmichConfig
      return yield* config.get()
    }).pipe(
      Effect.provide(
        Layer.mergeAll(ImmichConfigLive, envLayer({ IMMICH_URL: 'http://immich.test', IMMICH_API_KEY: 'secret' }))
      )
    )
    assertRedactedValue(immich.apiKey, 'secret')

    const jellyfin = yield* Effect.gen(function* () {
      const config = yield* JellyfinConfig
      return yield* config.get()
    }).pipe(
      Effect.provide(
        Layer.mergeAll(
          JellyfinConfigLive,
          envLayer({ JELLYFIN_URL: 'http://jellyfin.test', JELLYFIN_API_KEY: 'secret' })
        )
      )
    )
    assertRedactedValue(jellyfin.apiKey, 'secret')

    const jellyseerr = yield* Effect.gen(function* () {
      const config = yield* JellyseerrConfig
      return yield* config.get()
    }).pipe(
      Effect.provide(
        Layer.mergeAll(
          JellyseerrConfigLive,
          envLayer({ JELLYSEERR_URL: 'http://jellyseerr.test', JELLYSEERR_API_KEY: 'secret' })
        )
      )
    )
    assertRedactedValue(jellyseerr.apiKey, 'secret')

    const prowlarr = yield* Effect.gen(function* () {
      const config = yield* ProwlarrConfig
      return yield* config.get()
    }).pipe(
      Effect.provide(
        Layer.mergeAll(
          ProwlarrConfigLive,
          envLayer({ PROWLARR_URL: 'http://prowlarr.test', PROWLARR_API_KEY: 'secret' })
        )
      )
    )
    assertRedactedValue(prowlarr.apiKey, 'secret')

    const radarr = yield* Effect.gen(function* () {
      const config = yield* RadarrConfig
      return yield* config.get()
    }).pipe(
      Effect.provide(
        Layer.mergeAll(
          RadarrConfigLive,
          envLayer({ RADARR_URL: 'http://radarr.test', RADARR_API_KEY: 'secret', RADARR_DEFAULT_QUALITY_PROFILE: '7' })
        )
      )
    )
    assertRedactedValue(radarr.apiKey, 'secret')

    const sabnzbd = yield* Effect.gen(function* () {
      const config = yield* SabnzbdConfig
      return yield* config.get()
    }).pipe(
      Effect.provide(
        Layer.mergeAll(SabnzbdConfigLive, envLayer({ SABNZBD_URL: 'http://sabnzbd.test', SABNZBD_API_KEY: 'secret' }))
      )
    )
    assertRedactedValue(sabnzbd.apiKey, 'secret')

    const sonarr = yield* Effect.gen(function* () {
      const config = yield* SonarrConfig
      return yield* config.get()
    }).pipe(
      Effect.provide(
        Layer.mergeAll(
          SonarrConfigLive,
          envLayer({ SONARR_URL: 'http://sonarr.test', SONARR_API_KEY: 'secret', SONARR_DEFAULT_QUALITY_PROFILE: '7' })
        )
      )
    )
    assertRedactedValue(sonarr.apiKey, 'secret')

    const tubearchivist = yield* Effect.gen(function* () {
      const config = yield* TubearchivistConfig
      return yield* config.get()
    }).pipe(
      Effect.provide(
        Layer.mergeAll(
          TubearchivistConfigLive,
          envLayer({
            TUBEARCHIVIST_URL: 'http://tubearchivist.test',
            TUBEARCHIVIST_USERNAME: 'admin',
            TUBEARCHIVIST_PASSWORD: 'secret',
          })
        )
      )
    )
    assertRedactedValue(tubearchivist.password, 'secret')
  })
)

import * as BunServices from '@effect/platform-bun/BunServices'
import { assert, describe, it } from '@effect/vitest'
import * as Config from 'effect/Config'
import * as ConfigProvider from 'effect/ConfigProvider'
import * as Effect from 'effect/Effect'
import * as FileSystem from 'effect/FileSystem'
import * as Layer from 'effect/Layer'
import * as Option from 'effect/Option'
import * as Redacted from 'effect/Redacted'

import { FrameEnvFileLive } from '../src/settings.js'

const serviceAccountKey = `{"client_email":"frame@example.iam.gserviceaccount.com","private_key":"-----BEGIN PRIVATE KEY-----\\nabc\\n-----END PRIVATE KEY-----\\n"}`

const envFile = `HOME_ASSISTANT_URL=http://ha.example.test:8123
HOME_ASSISTANT_TOKEN=file-token
GOOGLE_SERVICE_ACCOUNT_KEY='${serviceAccountKey}'
FRAME_TIMEZONE=Europe/London
`

const readSettings = Effect.all({
  url: Config.NonEmptyString('HOME_ASSISTANT_URL'),
  token: Config.Redacted('HOME_ASSISTANT_TOKEN').pipe(Effect.map(Redacted.value)),
  key: Config.Redacted('GOOGLE_SERVICE_ACCOUNT_KEY').pipe(Effect.map(Redacted.value)),
  timezone: Config.NonEmptyString('FRAME_TIMEZONE').pipe(Config.option),
})

const withEnv = (env: Record<string, string>) =>
  FrameEnvFileLive.pipe(
    Layer.provide(ConfigProvider.layer(ConfigProvider.fromEnv({ env }))),
    Layer.provideMerge(BunServices.layer)
  )

const writeEnvFile = Effect.gen(function* () {
  const fs = yield* FileSystem.FileSystem
  const dir = yield* fs.makeTempDirectoryScoped()
  const path = `${dir}/frame.env`
  yield* fs.writeFileString(path, envFile)

  return path
})

describe('FrameEnvFileLive', () => {
  it.effect('reads configuration from the file named by FRAME_ENV_FILE', () =>
    Effect.gen(function* () {
      const path = yield* writeEnvFile

      const settings = yield* readSettings.pipe(Effect.provide(withEnv({ FRAME_ENV_FILE: path })))

      assert.deepStrictEqual(settings, {
        url: 'http://ha.example.test:8123',
        token: 'file-token',
        key: serviceAccountKey,
        timezone: Option.some('Europe/London'),
      })
    }).pipe(Effect.scoped, Effect.provide(BunServices.layer))
  )

  it.effect('lets the process environment override the file', () =>
    Effect.gen(function* () {
      const path = yield* writeEnvFile

      const settings = yield* readSettings.pipe(
        Effect.provide(withEnv({ FRAME_ENV_FILE: path, HOME_ASSISTANT_TOKEN: 'env-token' }))
      )

      assert.strictEqual(settings.token, 'env-token')
      assert.strictEqual(settings.url, 'http://ha.example.test:8123')
    }).pipe(Effect.scoped, Effect.provide(BunServices.layer))
  )

  it.effect('uses only the process environment without FRAME_ENV_FILE', () =>
    Effect.gen(function* () {
      const timezone = yield* Config.NonEmptyString('FRAME_TIMEZONE').pipe(Config.option, Effect.provide(withEnv({})))

      assert.isTrue(Option.isNone(timezone))
    })
  )

  it.effect('fails when FRAME_ENV_FILE names a missing file', () =>
    Effect.gen(function* () {
      const exit = yield* readSettings.pipe(
        Effect.provide(withEnv({ FRAME_ENV_FILE: '/nonexistent/frame.env' })),
        Effect.exit
      )

      assert.isTrue(exit._tag === 'Failure')
    })
  )
})

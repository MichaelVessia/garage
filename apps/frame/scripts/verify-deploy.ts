import * as BunHttpClient from '@effect/platform-bun/BunHttpClient'
import * as BunRuntime from '@effect/platform-bun/BunRuntime'
import * as BunServices from '@effect/platform-bun/BunServices'
import * as Config from 'effect/Config'
import * as Console from 'effect/Console'
import * as Effect from 'effect/Effect'
import * as FileSystem from 'effect/FileSystem'
import * as HttpClient from 'effect/http/HttpClient'
import * as HttpClientResponse from 'effect/http/HttpClientResponse'
import * as Layer from 'effect/Layer'
import * as Option from 'effect/Option'
import * as Path from 'effect/Path'
import * as Schedule from 'effect/Schedule'
import * as Schema from 'effect/Schema'

import { fingerprintHtml } from '../src/server.js'
import { DeployNotLive } from './errors.js'

const Health = Schema.Struct({ status: Schema.Literal('ready'), version: Schema.String })
const CliArgs = Schema.Tuple([Schema.optional(Schema.NonEmptyString)])

const expectedVersion = Effect.fn('frame.verifyDeploy.expectedVersion')(function* () {
  const [arg] = yield* Schema.decodeUnknownEffect(CliArgs)(process.argv.slice(2))

  if (arg !== undefined) {
    return arg
  }

  const fs = yield* FileSystem.FileSystem
  const path = yield* Path.Path
  const indexHtml = yield* fs.readFileString(path.resolve(path.dirname(import.meta.filename), '../web/dist/index.html'))

  return fingerprintHtml(indexHtml)
})

// Waits for the deployed server to report the build that was just shipped.
const verifyDeploy = Effect.fn('frame.verifyDeploy')(function* () {
  const expected = yield* expectedVersion()
  const baseUrl = yield* Config.NonEmptyString('FRAME_URL')
  const client = yield* HttpClient.HttpClient

  const observe = client.get(`${baseUrl}/health`).pipe(
    Effect.flatMap(HttpClientResponse.schemaBodyJson(Health)),
    Effect.map((health) => Option.some(health.version)),
    Effect.tapError((failure) => Effect.logInfo('Frame not ready yet', failure.message)),
    Effect.orElseSucceed(() => Option.none<string>())
  )

  const version = yield* observe.pipe(
    Effect.repeat({
      until: (observed) => Option.isSome(observed) && observed.value === expected,
      schedule: Schedule.spaced('3 seconds'),
      times: 40,
    }),
    Effect.map(Option.getOrElse(() => 'unreachable'))
  )

  if (version !== expected) {
    return yield* DeployNotLive.make({
      expected,
      observed: version,
      message: `expected build ${expected}, the frame host reports ${version}`,
    })
  }

  yield* Console.log(`garage-frame ${expected} is live at ${baseUrl}`)
})

BunRuntime.runMain(verifyDeploy().pipe(Effect.provide(Layer.merge(BunHttpClient.layer, BunServices.layer))))

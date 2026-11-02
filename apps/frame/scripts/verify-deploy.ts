import * as BunHttpClient from '@effect/platform-bun/BunHttpClient'
import * as BunRuntime from '@effect/platform-bun/BunRuntime'
import * as Config from 'effect/Config'
import * as Console from 'effect/Console'
import * as Effect from 'effect/Effect'
import { HttpClient, HttpClientResponse } from 'effect/http'
import * as Schedule from 'effect/Schedule'
import * as Schema from 'effect/Schema'

import { DeployNotLive } from './errors.js'

const Arguments = Schema.Tuple([Schema.NonEmptyString])
const Health = Schema.Struct({ status: Schema.Literal('ready'), version: Schema.String })

// Waits for the deployed server to report the build that was just shipped.
const verifyDeploy = Effect.fn('frame.verifyDeploy')(function* () {
  const [expected] = yield* Schema.decodeUnknownEffect(Arguments)(process.argv.slice(2))
  const baseUrl = yield* Config.NonEmptyString('FRAME_URL')
  const client = yield* HttpClient.HttpClient
  const observe = client.get(`${baseUrl}/health`).pipe(
    Effect.flatMap(HttpClientResponse.schemaBodyJson(Health)),
    Effect.map((health) => health.version),
    Effect.tapError((failure) => Effect.logInfo('Frame not ready yet', failure.message)),
    Effect.orElseSucceed(() => 'unreachable')
  )
  const version = yield* observe.pipe(
    Effect.repeat({ until: (observed) => observed === expected, schedule: Schedule.spaced('3 seconds'), times: 40 })
  )
  if (version !== expected) {
    return yield* new DeployNotLive({
      expected,
      observed: version,
      message: `expected build ${expected}, the frame host reports ${version}`,
    })
  }
  yield* Console.log(`garage-frame ${expected} is live at ${baseUrl}`)
})

// @effect-diagnostics-next-line strictEffectProvide:off -- script entry point
BunRuntime.runMain(verifyDeploy().pipe(Effect.provide(BunHttpClient.layer)))

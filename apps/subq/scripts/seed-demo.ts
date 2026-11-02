/**
 * Seed the deployed subq worker with the demo account and a year of data.
 *
 * Creates the demo user via better-auth (or signs in if it already exists),
 * then replaces all of its data through the UserDataImport RPC — the same
 * path as the app's data-import feature, so all domain validation applies.
 *
 * Run from apps/subq (bun auto-loads .env for BETTER_AUTH_URL):
 *   bun run seed:demo
 */
import { NodeRuntime } from '@effect/platform-node'
import * as Config from 'effect/Config'
import * as Effect from 'effect/Effect'
import * as Cookies from 'effect/http/Cookies'
import * as FetchHttpClient from 'effect/http/FetchHttpClient'
import * as HttpClient from 'effect/http/HttpClient'
import * as HttpClientRequest from 'effect/http/HttpClientRequest'
import * as Layer from 'effect/Layer'
import * as RpcClient from 'effect/rpc/RpcClient'
import * as RpcSerialization from 'effect/rpc/RpcSerialization'
import * as Schema from 'effect/Schema'

import { AppRpcs, DataExport, DEMO_USER } from '#shared'

import { generateDemoData } from './demo-data.js'
import { SeedError } from './errors.js'

// ============================================
// Auth: create (or reuse) the demo user, return the session cookie
// ============================================

interface AuthRequestBody {
  readonly email: string
  readonly name?: string
  readonly password: string
}

const postJson = Effect.fn('seed.postJson')(function* (url: string, body: AuthRequestBody) {
  const client = yield* HttpClient.HttpClient
  const request = yield* HttpClientRequest.post(url).pipe(HttpClientRequest.bodyJson(body))

  return yield* client.execute(request)
})

const authenticate = Effect.fn('seed.authenticate')(function* (baseUrl: string) {
  const { email, name, password } = DEMO_USER

  let response = yield* postJson(`${baseUrl}/api/auth/sign-up/email`, { email, name, password })

  if (response.status < 400) {
    yield* Effect.log('Created demo user').pipe(Effect.annotateLogs({ email }))
  } else {
    yield* Effect.log('Sign-up returned non-success, signing in as existing user').pipe(
      Effect.annotateLogs({ status: response.status, email })
    )
    response = yield* postJson(`${baseUrl}/api/auth/sign-in/email`, { email, password })
  }

  if (response.status >= 400) {
    const body = yield* response.text

    return yield* SeedError.make({ message: `Authentication failed (${response.status}): ${body}` })
  }

  const cookieHeader = Cookies.toCookieHeader(response.cookies)

  if (cookieHeader === '') {
    return yield* SeedError.make({ message: 'Authentication succeeded but returned no session cookie' })
  }

  return cookieHeader
})

// ============================================
// Main
// ============================================

// ndjson serialization is broken with toHttpEffect on effect beta.93; use JSON
const ProtocolLive = Layer.unwrap(
  Effect.gen(function* () {
    const baseUrl = yield* Config.String('BETTER_AUTH_URL')
    yield* Effect.log('Seeding demo data').pipe(Effect.annotateLogs({ baseUrl }))
    const cookie = yield* authenticate(baseUrl)

    return RpcClient.layerProtocolHttp({
      transformClient: HttpClient.mapRequest(HttpClientRequest.setHeader('cookie', cookie)),
      url: `${baseUrl}/rpc`,
    })
  })
).pipe(Layer.provide([RpcSerialization.layerJson, FetchHttpClient.layer]))

const main = Effect.fn('seed.main')(function* () {
  const payload = yield* Schema.decodeUnknownEffect(DataExport)(yield* generateDemoData())
  const client = yield* RpcClient.make(AppRpcs)
  const result = yield* client.UserDataImport(payload)
  yield* Effect.log('Import complete').pipe(
    Effect.annotateLogs({
      weightLogs: result.weightLogs,
      injectionLogs: result.injectionLogs,
      schedules: result.schedules,
      goals: result.goals,
      settingsUpdated: result.settingsUpdated,
    })
  )
})

// @effect-diagnostics-next-line strictEffectProvide:off
NodeRuntime.runMain(main().pipe(Effect.provide(ProtocolLive), Effect.scoped))

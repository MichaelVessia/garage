// @vitest-environment happy-dom
import { assert, describe, it } from '@effect/vitest'
import * as Effect from 'effect/Effect'
import * as Exit from 'effect/Exit'
import * as Layer from 'effect/Layer'
import { HttpClient, HttpClientError, HttpClientResponse } from 'effect/unstable/http'
import type { HttpClientRequest } from 'effect/unstable/http'

import { changePassword, fetchSession, signIn, signOut, signUp } from '../src/adapter/better-auth-http.js'
import { SignOut } from '../src/auth.js'

interface CannedResponse {
  readonly status: number
  readonly body?: unknown
}

const makeCannedClient = (respond: (request: HttpClientRequest.HttpClientRequest) => CannedResponse) => {
  const requests: Array<HttpClientRequest.HttpClientRequest> = []
  const client = HttpClient.make((request) => {
    requests.push(request)
    const response = respond(request)
    const init: ResponseInit = { status: response.status }
    const webResponse = response.body === undefined ? new Response(null, init) : Response.json(response.body, init)
    return Effect.succeed(HttpClientResponse.fromWeb(request, webResponse))
  })
  return { layer: Layer.succeed(HttpClient.HttpClient, client), requests }
}

const requestJson = (request: HttpClientRequest.HttpClientRequest): unknown => {
  if (request.body._tag !== 'Uint8Array') {
    return undefined
  }
  return JSON.parse(new TextDecoder().decode(request.body.body))
}

const user = { email: 'person@example.com', id: 'user-1', name: 'Person' }

describe('Better Auth HTTP adapter', () => {
  it.effect('uses the expected endpoint, method, and JSON body for every operation', () => {
    const canned = makeCannedClient((request) => {
      if (request.url.endsWith('get-session') || request.url.includes('sign-in') || request.url.includes('sign-up')) {
        return { body: { user }, status: 200 }
      }
      return { body: {}, status: 200 }
    })

    return Effect.gen(function* () {
      yield* fetchSession()
      yield* signIn('person@example.com', 'secret')
      yield* signUp('person@example.com', 'Person', 'secret')
      yield* signOut()
      yield* changePassword('old-secret', 'new-secret')

      assert.deepStrictEqual(
        canned.requests.map(({ method, url }) => ({ method, url })),
        [
          { method: 'GET', url: '/api/auth/get-session' },
          { method: 'POST', url: '/api/auth/sign-in/email' },
          { method: 'POST', url: '/api/auth/sign-up/email' },
          { method: 'POST', url: '/api/auth/sign-out' },
          { method: 'POST', url: '/api/auth/change-password' },
        ]
      )
      assert.deepStrictEqual(canned.requests.slice(1).map(requestJson), [
        { email: 'person@example.com', password: 'secret' },
        { email: 'person@example.com', name: 'Person', password: 'secret' },
        {},
        { currentPassword: 'old-secret', newPassword: 'new-secret', revokeOtherSessions: true },
      ])
    }).pipe(Effect.provide(canned.layer))
  })

  it.effect('decodes successful and null sessions', () =>
    Effect.gen(function* () {
      const present = makeCannedClient(() => ({ body: { user }, status: 200 }))
      const absent = makeCannedClient(() => ({ body: null, status: 200 }))

      assert.deepStrictEqual(yield* fetchSession().pipe(Effect.provide(present.layer)), user)
      assert.isNull(yield* fetchSession().pipe(Effect.provide(absent.layer)))
    })
  )

  it.effect('fails on a malformed successful response', () =>
    Effect.gen(function* () {
      const canned = makeCannedClient(() => ({ body: { user: { id: 42 } }, status: 200 }))
      const exit = yield* signIn('person@example.com', 'secret').pipe(Effect.provide(canned.layer), Effect.exit)
      assert.isTrue(Exit.isFailure(exit))
    })
  )

  it.effect('preserves an upstream error message', () =>
    Effect.gen(function* () {
      const canned = makeCannedClient(() => ({ body: { message: 'Invalid credentials' }, status: 401 }))
      const error = yield* signIn('person@example.com', 'bad').pipe(Effect.provide(canned.layer), Effect.flip)
      assert.strictEqual(error._tag, 'BetterAuthHttpError')
      assert.strictEqual(error.message, 'Invalid credentials')
    })
  )

  it.effect('uses the operation fallback when the upstream body has no message', () =>
    Effect.gen(function* () {
      const canned = makeCannedClient(() => ({ body: { error: 'nope' }, status: 400 }))
      const error = yield* changePassword('old', 'new').pipe(Effect.provide(canned.layer), Effect.flip)
      assert.strictEqual(error._tag, 'BetterAuthHttpError')
      assert.strictEqual(error.message, 'Password change failed')
    })
  )

  it.effect('propagates transport failures', () =>
    Effect.gen(function* () {
      const client = HttpClient.make((request) =>
        Effect.fail(
          new HttpClientError.HttpClientError({
            reason: new HttpClientError.TransportError({ description: 'offline', request }),
          })
        )
      )
      const exit = yield* fetchSession().pipe(Effect.provide(Layer.succeed(HttpClient.HttpClient, client)), Effect.exit)
      assert.isTrue(Exit.isFailure(exit))
    })
  )

  it.effect('keeps sign-out UI success behavior when the adapter fails', () =>
    Effect.gen(function* () {
      const canned = makeCannedClient(() => ({ body: { message: 'Unauthorized' }, status: 401 }))
      const message = yield* SignOut().effect.pipe(Effect.provide(canned.layer))
      assert.deepStrictEqual(message, { _tag: 'SucceededSignOut' })
    })
  )
})

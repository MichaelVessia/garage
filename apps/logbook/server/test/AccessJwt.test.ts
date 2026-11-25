import { assert, it } from '@effect/vitest'
import { owner, system } from '@garage/logbook-domain/Actor'
import { Unauthorized } from '@garage/logbook-domain/Session.middleware'
import * as Arr from 'effect/Array'
import * as ConfigProvider from 'effect/ConfigProvider'
import * as Effect from 'effect/Effect'
import * as Base64Url from 'effect/encoding/Base64Url'
import * as Headers from 'effect/http/Headers'
import * as HttpClient from 'effect/http/HttpClient'
import * as HttpClientResponse from 'effect/http/HttpClientResponse'
import * as Layer from 'effect/Layer'
import * as Ref from 'effect/Ref'
import * as Schema from 'effect/Schema'
import * as TestClock from 'effect/testing/TestClock'

import { SessionAuthentication, SessionLive } from '../src/Session.ts'

const issuer = 'https://logbook.cloudflareaccess.com'
const audience = 'logbook-audience'
const now = 1_750_000_000
const claims = { iss: issuer, aud: [audience], exp: now + 3600 }
const config = {
  CF_ACCESS_TEAM_DOMAIN: issuer,
  CF_ACCESS_AUD: audience,
  LOGBOOK_OWNER_EMAIL: 'owner@example.com',
}

const rsaAlgorithm = { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }
const makeKey = (kid: string) =>
  Effect.gen(function* () {
    const pair = yield* Effect.promise(() =>
      crypto.subtle.generateKey(
        {
          ...rsaAlgorithm,
          modulusLength: 2048,
          publicExponent: new Uint8Array([1, 0, 1]),
        },
        true,
        ['sign', 'verify']
      )
    )
    const jwk = yield* Effect.promise(() => crypto.subtle.exportKey('jwk', pair.publicKey))
    return { publicKey: { ...jwk, kid }, privateKey: pair.privateKey }
  })

const encode = Schema.encodeEffect(Schema.fromJsonString(Schema.Json))

const sign = (key: Effect.Success<ReturnType<typeof makeKey>>, payload: Schema.JsonObject, kid = key.publicKey.kid) =>
  Effect.gen(function* () {
    const header = yield* encode({ alg: 'RS256', kid }).pipe(Effect.map(Base64Url.encode))
    const body = yield* encode(payload).pipe(Effect.map(Base64Url.encode))
    const input = `${header}.${body}`
    const signature = yield* Effect.promise(() =>
      crypto.subtle.sign(rsaAlgorithm.name, key.privateKey, new TextEncoder().encode(input))
    )
    return `${input}.${Base64Url.encode(new Uint8Array(signature))}`
  })

const assertion = (token: string) => Headers.fromInput({ 'Cf-Access-Jwt-Assertion': token })
const jwksClient = (getKeys: Effect.Effect<ReadonlyArray<object>>) =>
  Layer.succeed(
    HttpClient.HttpClient,
    HttpClient.make((request, url) =>
      getKeys.pipe(
        Effect.map((keys) => {
          assert.strictEqual(url.href, `${issuer}/cdn-cgi/access/certs`)
          return HttpClientResponse.fromWeb(request, Response.json({ keys }))
        })
      )
    )
  )

const sessionLayer = (env: Record<string, string>, http: Layer.Layer<HttpClient.HttpClient>) =>
  SessionLive.pipe(Layer.provide(Layer.mergeAll(ConfigProvider.layer(ConfigProvider.fromEnvRecord(env)), http)))

it.effect('authenticates a Cloudflare owner, service token, and cookie', () =>
  Effect.gen(function* () {
    yield* TestClock.setTime(now * 1000)
    const key = yield* makeKey('primary')
    const user = yield* sign(key, { ...claims, email: 'OWNER@example.com' })
    const service = yield* sign(key, { ...claims, aud: audience, common_name: 'frame-client' })

    yield* Effect.gen(function* () {
      const { authenticate } = yield* SessionAuthentication
      const headerActor = yield* authenticate(assertion(user))
      const serviceActor = yield* authenticate(assertion(service))
      const cookieActor = yield* authenticate(Headers.fromInput({ cookie: `other=1; CF_Authorization=${user}` }))
      assert.deepStrictEqual(headerActor, owner('OWNER@example.com'))
      assert.deepStrictEqual(serviceActor, system('frame-client'))
      assert.deepStrictEqual(cookieActor, headerActor)
    }).pipe(Effect.provide(sessionLayer(config, jwksClient(Effect.succeed([key.publicKey])))))
  })
)

it.effect('rejects invalid Access claims and signatures without falling back to another identity', () =>
  Effect.gen(function* () {
    yield* TestClock.setTime(now * 1000)
    const key = yield* makeKey('primary')
    const otherKey = yield* makeKey('other')
    const user = { ...claims, email: 'owner@example.com' }
    const invalid = yield* Effect.all(
      [
        sign(key, { ...user, exp: now }),
        sign(key, { ...user, aud: ['other-audience'] }),
        sign(key, { ...user, iss: 'https://other.cloudflareaccess.com' }),
        sign(key, { ...user, nbf: now + 60 }),
        sign(key, { ...user, email: 'other@example.com', common_name: 'frame-client' }),
        sign(otherKey, user, key.publicKey.kid),
      ],
      { concurrency: 1 }
    )

    const env = { ...config, LOGBOOK_API_TOKEN: 'api-secret', LOGBOOK_DEV_EMAIL: 'dev@example.com' }
    yield* Effect.gen(function* () {
      const { authenticate } = yield* SessionAuthentication
      const errors = yield* Effect.forEach(
        invalid,
        (token) =>
          authenticate(Headers.fromInput({ ...assertion(token), authorization: 'Bearer api-secret' })).pipe(
            Effect.flip
          ),
        { concurrency: 1 }
      )
      assert.deepStrictEqual(
        errors,
        Arr.map(invalid, () => Unauthorized.make({}))
      )
    }).pipe(Effect.provide(sessionLayer(env, jwksClient(Effect.succeed([key.publicKey])))))
  })
)

it.effect('uses cached JWKS and refreshes it when the token uses a new key', () =>
  Effect.gen(function* () {
    yield* TestClock.setTime(now * 1000)
    const primary = yield* makeKey('primary')
    const rotated = yield* makeKey('rotated')
    const user = { ...claims, email: 'owner@example.com' }
    const oldToken = yield* sign(primary, user)
    const newToken = yield* sign(rotated, user)
    const requests = yield* Ref.make(0)
    const http = jwksClient(
      Ref.updateAndGet(requests, (count) => count + 1).pipe(
        Effect.map((count) => [count === 1 ? primary.publicKey : rotated.publicKey])
      )
    )

    yield* Effect.gen(function* () {
      const { authenticate } = yield* SessionAuthentication
      yield* authenticate(assertion(oldToken))
      yield* authenticate(assertion(oldToken))
      const cachedRequests = yield* Ref.get(requests)
      assert.strictEqual(cachedRequests, 1)
      const actor = yield* authenticate(assertion(newToken))
      assert.deepStrictEqual(actor, owner(user.email))
      const refreshedRequests = yield* Ref.get(requests)
      assert.strictEqual(refreshedRequests, 2)
    }).pipe(Effect.provide(sessionLayer(config, http)))
  })
)

it.effect('authenticates a configured API token and uses the development email for requests without credentials', () =>
  Effect.gen(function* () {
    const { authenticate } = yield* SessionAuthentication
    const apiActor = yield* authenticate(Headers.fromInput({ Authorization: 'Bearer api-secret' }))
    const error = yield* authenticate(Headers.fromInput({ Authorization: 'Bearer api-guess' })).pipe(Effect.flip)
    const devActor = yield* authenticate(Headers.empty)
    assert.deepStrictEqual(apiActor, system('api-token'))
    assert.instanceOf(error, Unauthorized)
    assert.deepStrictEqual(devActor, owner('dev@example.com'))
  }).pipe(
    Effect.provide(
      sessionLayer(
        { LOGBOOK_API_TOKEN: 'api-secret', LOGBOOK_DEV_EMAIL: 'dev@example.com' },
        jwksClient(Effect.die('Bearer and development authentication do not use JWKS'))
      )
    )
  )
)

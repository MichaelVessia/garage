import * as Domain from '@alchemy.run/domain'
import { assert, it } from '@effect/vitest'
import { PERSONAL_JOURNAL_ID } from '@garage/subq-domain/Journal/Journal.id'
import { Unauthorized } from '@garage/subq-domain/Session.middleware'
import { Subq, SubqHandlers } from '@garage/subq-domain/Subq.model'
import { safeHttpEffect } from 'alchemy/Http'
import * as Arr from 'effect/Array'
import * as Clock from 'effect/Clock'
import * as ConfigProvider from 'effect/ConfigProvider'
import * as Effect from 'effect/Effect'
import * as Base64Url from 'effect/encoding/Base64Url'
import * as HttpClient from 'effect/http/HttpClient'
import * as HttpClientResponse from 'effect/http/HttpClientResponse'
import * as HttpServerRequest from 'effect/http/HttpServerRequest'
import * as HttpServerResponse from 'effect/http/HttpServerResponse'
import * as Layer from 'effect/Layer'
import * as Schema from 'effect/Schema'

import { SessionLive } from '../src/Session.ts'
import { SubqRouter } from '../src/SubqRouter.ts'

const journal = Subq.layer(SubqHandlers).pipe(Layer.provide(Domain.InMemory))
const configLayer = (env: Record<string, string>) => ConfigProvider.layer(ConfigProvider.fromEnvRecord(env))
const server = Layer.mergeAll(
  journal,
  SessionLive.pipe(
    Layer.provide(
      Layer.mergeAll(
        configLayer({ SUBQ_API_TOKEN: 'api-secret' }),
        Layer.succeed(
          HttpClient.HttpClient,
          HttpClient.make(() => Effect.die('Unexpected JWKS request'))
        )
      )
    )
  )
)

const makeHandle = Effect.gen(function* () {
  const { fetch } = yield* SubqRouter
  return (path: string, init?: RequestInit) =>
    Effect.gen(function* () {
      const request = HttpServerRequest.fromWeb(new Request(`https://subq.test${path}`, init))
      const response = yield* Effect.provideService(safeHttpEffect(fetch), HttpServerRequest.HttpServerRequest, request)
      return HttpServerResponse.toWeb(response)
    }).pipe(Effect.scoped)
})

const JsonBody = Schema.fromJsonString(Schema.Json)
const encodeJson = Schema.encodeEffect(JsonBody)
const json = (response: Response) =>
  Effect.promise(() => response.text()).pipe(Effect.flatMap(Schema.decodeEffect(JsonBody)))

const okJson = (response: Response) => {
  assert.strictEqual(response.status, 200)
  return json(response)
}

const Receipt = Schema.Struct({ stream: Schema.String, version: Schema.Int })
type Receipt = typeof Receipt.Type
const target = PERSONAL_JOURNAL_ID
const bearer = { authorization: 'Bearer api-secret' }

type Handle = Effect.Success<typeof makeHandle>

const post = (handle: Handle, headers: NonNullable<RequestInit['headers']>, path: string, payload: Schema.Json) =>
  Effect.gen(function* () {
    const body = yield* encodeJson(payload)
    return yield* handle(path, { method: 'POST', headers, body })
  })

const httpCommand = (handle: Handle, headers: Record<string, string>, command: string, input: Schema.JsonObject) =>
  post(handle, { ...headers, 'content-type': 'application/json' }, `/v1/${command}`, { target, input }).pipe(
    Effect.flatMap(okJson),
    Effect.flatMap(Schema.decodeUnknownEffect(Receipt))
  )

const httpProfile = (handle: Handle, headers: Record<string, string>, { stream, version }: Receipt) =>
  handle(`/v1/JournalProfile/${target}?${new URLSearchParams({ stream, version: String(version) })}`, {
    headers,
  }).pipe(Effect.flatMap(okJson))

const protocol = '2026-07-28'
const mcp = (
  handle: Handle,
  authHeaders: Record<string, string>,
  method: string,
  params: Readonly<Record<string, Schema.Json>> = {},
  name?: string
) => {
  const headers = new Headers({
    ...authHeaders,
    'content-type': 'application/json',
    accept: 'application/json, text/event-stream',
    'mcp-protocol-version': protocol,
    'mcp-method': method,
  })
  if (name !== undefined) {
    headers.set('mcp-name', name)
  }
  return post(handle, headers, '/mcp', {
    jsonrpc: '2.0',
    id: 1,
    method,
    params: {
      ...params,
      _meta: {
        'io.modelcontextprotocol/protocolVersion': protocol,
        'io.modelcontextprotocol/clientCapabilities': {},
      },
    },
  }).pipe(Effect.flatMap(okJson))
}

const mcpCall = (handle: Handle, headers: Record<string, string>, name: string, args: Schema.JsonObject) =>
  mcp(handle, headers, 'tools/call', { name, arguments: args }, name).pipe(
    Effect.flatMap(
      Schema.decodeUnknownEffect(
        Schema.Struct({
          result: Schema.Struct({ isError: Schema.optionalKey(Schema.Literal(false)), structuredContent: Schema.Json }),
        })
      )
    ),
    Effect.map(({ result }) => result.structuredContent)
  )

const mcpProfile = (handle: Handle, headers: Record<string, string>, atLeast: Receipt) =>
  mcpCall(handle, headers, 'SubqApi_JournalProfile_get', { key: target, atLeast }).pipe(
    Effect.flatMap(Schema.decodeUnknownEffect(Schema.Struct({ value: Schema.Json }))),
    Effect.map(({ value }) => value)
  )

it.effect('serves public health and returns Unauthorized on protected routes', () =>
  Effect.gen(function* () {
    const handle = yield* makeHandle
    const health = yield* handle('/health').pipe(Effect.flatMap(okJson))
    assert.deepStrictEqual(health, { status: 'ok' })
    const missing = yield* handle('/apiculture')
    assert.strictEqual(missing.status, 404)

    const denial = yield* Schema.encodeEffect(Unauthorized)(Unauthorized.make({}))
    yield* Effect.forEach(
      ['/api', '/api/rpc', '/v1', '/v1/openapi.json', '/mcp'],
      (path) =>
        Effect.gen(function* () {
          const response = yield* handle(path)
          assert.strictEqual(response.status, 401, path)
          const body = yield* json(response)
          assert.deepStrictEqual(body, denial)
        }),
      { concurrency: 1, discard: true }
    )
  }).pipe(Effect.provide(server))
)

it.effect('returns a typed session denial for browser RPC commands', () =>
  Effect.gen(function* () {
    const handle = yield* makeHandle
    const response = yield* handle('/api', {
      method: 'POST',
      headers: { 'content-type': 'application/x-ndjson' },
      body: '{"_tag":"Request","id":"1","tag":"UpdatePreferences","payload":{"target":"personal","input":{"timezone":"UTC"}},"headers":[]}\n',
    })
    assert.strictEqual(response.status, 200)
    const body = yield* Effect.promise(() => response.text())
    assert.include(body, '"_tag":"Unauthorized"')
  }).pipe(Effect.provide(server))
)

// The HTTP read waits for the live projection worker after the write.
// ast-grep-ignore: no-it-live
it.live('serves OpenAPI and reads a committed HTTP command at its receipt version', () =>
  Effect.gen(function* () {
    const handle = yield* makeHandle
    const document = yield* handle('/v1/openapi.json', { headers: bearer }).pipe(Effect.flatMap(okJson))
    assert.propertyVal(document, 'openapi', '3.1.0')
    assert.nestedProperty(document, 'paths./v1/UpdatePreferences.post')
    assert.nestedProperty(document, 'paths./v1/ImportJournal.post')
    assert.nestedProperty(document, 'paths./v1/JournalProfile/{key}.get')
    assert.nestedProperty(document, 'paths./v1/WeightHistory/{key}.get')
    assert.nestedProperty(document, 'paths./v1/InjectionHistory/{key}.get')

    const receipt = yield* httpCommand(handle, bearer, 'UpdatePreferences', { weightUnit: 'kg', timezone: 'UTC' })
    const profile = yield* httpProfile(handle, bearer, receipt)
    assert.deepPropertyVal(profile, 'preferences', { weightUnit: 'kg', timezone: 'UTC' })
  }).pipe(Effect.provide(server))
)

// The MCP read waits for the live projection worker after the write.
// ast-grep-ignore: no-it-live
it.live('discovers, lists, and calls Subq MCP tools without exposing journal import', () =>
  Effect.gen(function* () {
    const handle = yield* makeHandle
    const discovery = yield* mcp(handle, bearer, 'server/discover')
    const info = yield* Schema.decodeUnknownEffect(
      Schema.Struct({
        result: Schema.Struct({
          _meta: Schema.Struct({ 'io.modelcontextprotocol/serverInfo': Schema.Struct({ name: Schema.String }) }),
          supportedVersions: Schema.Array(Schema.String),
        }),
      })
    )(discovery)
    assert.strictEqual(info.result._meta['io.modelcontextprotocol/serverInfo'].name, 'Subq')
    assert.deepStrictEqual(info.result.supportedVersions, [protocol])

    const list = yield* mcp(handle, bearer, 'tools/list')
    const { result } = yield* Schema.decodeUnknownEffect(
      Schema.Struct({
        result: Schema.Struct({ tools: Schema.Array(Schema.Struct({ name: Schema.String })) }),
      })
    )(list)
    assert.sameMembers(
      Arr.map(result.tools, ({ name }) => name),
      [
        'SubqApi_UpdatePreferences_send',
        'SubqApi_RecordWeight_send',
        'SubqApi_CorrectWeight_send',
        'SubqApi_RemoveWeight_send',
        'SubqApi_LogInjection_send',
        'SubqApi_CorrectInjection_send',
        'SubqApi_RemoveInjection_send',
        'SubqApi_AssignInjectionsToSchedule_send',
        'SubqApi_CreateSchedule_send',
        'SubqApi_ReviseSchedule_send',
        'SubqApi_ActivateSchedule_send',
        'SubqApi_DeactivateSchedule_send',
        'SubqApi_RemoveSchedule_send',
        'SubqApi_SetGoal_send',
        'SubqApi_ReviseGoal_send',
        'SubqApi_CompleteGoal_send',
        'SubqApi_RemoveGoal_send',
        'SubqApi_JournalProfile_get',
        'SubqApi_WeightHistory_get',
        'SubqApi_InjectionHistory_get',
      ]
    )

    const receipt = yield* mcpCall(handle, bearer, 'SubqApi_UpdatePreferences_send', {
      target,
      input: { weightUnit: 'lbs', timezone: 'UTC' },
    }).pipe(Effect.flatMap(Schema.decodeUnknownEffect(Receipt)))
    const profile = yield* mcpProfile(handle, bearer, receipt)
    assert.deepPropertyVal(profile, 'preferences', { weightUnit: 'lbs', timezone: 'UTC' })
  }).pipe(Effect.provide(server))
)

const accessSession = Effect.gen(function* () {
  const issuer = 'https://subq.cloudflareaccess.com'
  const audience = 'subq-audience'
  const email = 'owner@example.com'
  const kid = 'subq-key'
  const name = 'RSASSA-PKCS1-v1_5'
  const pair = yield* Effect.promise(() =>
    crypto.subtle.generateKey(
      { name, hash: 'SHA-256', modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]) },
      true,
      ['sign', 'verify']
    )
  )
  const publicKey = yield* Effect.promise(() => crypto.subtle.exportKey('jwk', pair.publicKey))
  const now = yield* Clock.currentTimeMillis
  const header = yield* encodeJson({ alg: 'RS256', kid }).pipe(Effect.map(Base64Url.encode))
  const claims = yield* encodeJson({ iss: issuer, aud: [audience], email, exp: Math.floor(now / 1000) + 3600 }).pipe(
    Effect.map(Base64Url.encode)
  )
  const signed = `${header}.${claims}`
  const signature = yield* Effect.promise(() =>
    crypto.subtle.sign(name, pair.privateKey, new TextEncoder().encode(signed))
  )
  const headers = { 'cf-access-jwt-assertion': `${signed}.${Base64Url.encode(new Uint8Array(signature))}` }
  const layer = Layer.mergeAll(
    journal,
    SessionLive.pipe(
      Layer.provide(
        Layer.mergeAll(
          configLayer({ CF_ACCESS_TEAM_DOMAIN: issuer, CF_ACCESS_AUD: audience, SUBQ_OWNER_EMAIL: email }),
          Layer.succeed(
            HttpClient.HttpClient,
            HttpClient.make((request, url) =>
              Effect.sync(() => {
                assert.strictEqual(url.href, `${issuer}/cdn-cgi/access/certs`)
                return HttpClientResponse.fromWeb(request, Response.json({ keys: [{ ...publicKey, kid }] }))
              })
            )
          )
        )
      )
    )
  )
  return { headers, layer }
})

const journalCommands: ReadonlyArray<readonly [string, Schema.JsonObject]> = [
  ['UpdatePreferences', { timezone: 'UTC', weightUnit: 'kg' }],
  ['RecordWeight', { weightId: 'weight-1', recordedAt: '2026-06-01T12:00:00.000Z', weightLbs: 190 }],
  [
    'LogInjection',
    {
      injectionId: 'injection-1',
      administeredAt: '2026-06-01T13:00:00.000Z',
      compound: 'Semaglutide',
      doseMg: 0.25,
      site: 'Left thigh',
    },
  ],
  [
    'CreateSchedule',
    {
      scheduleId: 'schedule-1',
      name: 'Weekly',
      compound: 'Semaglutide',
      frequency: 'weekly',
      startDate: '2026-06-01',
      phases: [{ id: 'phase-1', order: 1, durationDays: null, doseMg: 0.25 }],
    },
  ],
  ['SetGoal', { goalId: 'goal-1', startingDate: '2026-06-01', goalWeightLbs: 180 }],
]

const verifyJournalWorkflow = (transport: 'HTTP' | 'MCP') =>
  Effect.gen(function* () {
    const { headers, layer } = yield* accessSession
    yield* Effect.gen(function* () {
      const handle = yield* makeHandle
      const send =
        transport === 'HTTP'
          ? (command: string, input: Schema.JsonObject) => httpCommand(handle, headers, command, input)
          : (command: string, input: Schema.JsonObject) =>
              mcpCall(handle, headers, `SubqApi_${command}_send`, { target, input }).pipe(
                Effect.flatMap(Schema.decodeUnknownEffect(Receipt))
              )
      const receipts = yield* Effect.forEach(journalCommands, ([command, input]) => send(command, input), {
        concurrency: 1,
      })
      const complete = yield* send('CompleteGoal', { goalId: 'goal-1' })
      assert.deepStrictEqual(
        Arr.map(receipts, ({ version }) => version),
        [1, 2, 3, 4, 5]
      )
      assert.strictEqual(complete.version, 6)

      const profile =
        transport === 'HTTP'
          ? yield* httpProfile(handle, headers, complete)
          : yield* mcpProfile(handle, headers, complete)
      assert.deepPropertyVal(profile, 'preferences', { timezone: 'UTC', weightUnit: 'kg' })
      assert.nestedPropertyVal(profile, 'latestWeight.weightLbs', 190)
      assert.nestedPropertyVal(profile, 'lastInjection.doseMg', 0.25)
      assert.nestedPropertyVal(profile, 'schedules.schedule-1.phases[0].doseMg', 0.25)
      assert.nestedPropertyVal(profile, 'goals.goal-1.startingWeightLbs', 190)
      assert.nestedPropertyVal(profile, 'goals.goal-1.goalWeightLbs', 180)
      assert.nestedPropertyVal(profile, 'goals.goal-1.isActive', false)
      const { goals } = yield* Schema.decodeUnknownEffect(
        Schema.Struct({
          goals: Schema.Struct({ 'goal-1': Schema.Struct({ completedAt: Schema.DateTimeUtcFromString }) }),
        })
      )(profile)
      assert.isTrue(Number.isFinite(goals['goal-1'].completedAt.epochMilliseconds))
    }).pipe(Effect.provide(layer))
  })

// The JWT and projection worker both use the live clock.
// ast-grep-ignore: no-it-live
it.live('authenticates a signed Access JWT and completes a journal workflow over HTTP', () =>
  verifyJournalWorkflow('HTTP')
)

// The JWT and projection worker both use the live clock.
// ast-grep-ignore: no-it-live
it.live('authenticates a signed Access JWT and completes a journal workflow over MCP', () =>
  verifyJournalWorkflow('MCP')
)

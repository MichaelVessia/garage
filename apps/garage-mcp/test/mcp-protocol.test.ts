import { assert, it } from '@effect/vitest'
import { AutocaliwebApi, unreachable as autocaliwebUnreachable } from '@garage/autocaliweb'
import { SabnzbdApi, envMissing, unreachable } from '@garage/sabnzbd'
import * as Effect from 'effect/Effect'
import * as Layer from 'effect/Layer'
import * as Schema from 'effect/Schema'
import * as HttpRouter from 'effect/unstable/http/HttpRouter'

import { GarageMcpRoutes } from '../src/server.js'

const ToolListResponse = Schema.Struct({
  jsonrpc: Schema.Literal('2.0'),
  id: Schema.Number,
  result: Schema.Struct({
    tools: Schema.Array(
      Schema.Struct({
        name: Schema.String,
        title: Schema.optional(Schema.String),
        description: Schema.optional(Schema.String),
        inputSchema: Schema.Unknown,
        outputSchema: Schema.optional(Schema.Unknown),
        annotations: Schema.Struct({
          title: Schema.optional(Schema.String),
          readOnlyHint: Schema.Boolean,
          destructiveHint: Schema.Boolean,
          idempotentHint: Schema.Boolean,
          openWorldHint: Schema.Boolean,
        }),
      })
    ),
  }),
})

const QueueInputSchema = Schema.Struct({
  type: Schema.Literal('object'),
  properties: Schema.Struct({
    limit: Schema.Struct({
      type: Schema.Literal('integer'),
      allOf: Schema.Array(
        Schema.Struct({
          minimum: Schema.Number,
          maximum: Schema.Number,
          description: Schema.String,
        })
      ),
    }),
  }),
  additionalProperties: Schema.Boolean,
})

const QueueOutputSchema = Schema.Struct({
  type: Schema.Literal('object'),
  properties: Schema.Struct({
    count: Schema.Unknown,
    totalRecords: Schema.Unknown,
    slots: Schema.Unknown,
  }),
  required: Schema.Array(Schema.String),
  additionalProperties: Schema.Boolean,
})

const McpFailure = Schema.Struct({
  code: Schema.String,
  message: Schema.String,
  fix: Schema.String,
})

const ToolCallResponse = Schema.Struct({
  jsonrpc: Schema.Literal('2.0'),
  id: Schema.Number,
  result: Schema.Struct({
    isError: Schema.Boolean,
    content: Schema.Array(
      Schema.Struct({
        type: Schema.Literal('text'),
        text: Schema.String,
      })
    ),
    structuredContent: Schema.optional(Schema.Unknown),
  }),
})

const makeApiLayer = (statusEffect: SabnzbdApi['Service']['status']) =>
  Layer.succeed(
    SabnzbdApi,
    SabnzbdApi.of({
      status: statusEffect,
      version: () => Effect.succeed({ version: '4.5.3' }),
      queue: ({ limit }) =>
        Effect.succeed({
          count: 1,
          totalRecords: 12,
          slots: [{ nzoId: 'SABnzbd_nzo_abc', filename: `limit-${limit}` }],
        }),
      history: () => Effect.succeed({ count: 0, totalRecords: 0, slots: [] }),
      pause: () => Effect.succeed({ action: 'pause', ok: true }),
      resume: () => Effect.succeed({ action: 'resume', ok: true }),
      delete: (nzoId, options) =>
        Effect.succeed({ action: 'delete', ok: true, nzoId, deleteFiles: options.deleteFiles }),
      serverStats: () => Effect.succeed({ total: 1000, servers: {} }),
    })
  )

const makeAutocaliwebLayer = (statusEffect: AutocaliwebApi['Service']['status']) =>
  Layer.succeed(
    AutocaliwebApi,
    AutocaliwebApi.of({
      status: statusEffect,
      stats: () => Effect.succeed({ books: 1, authors: 1, categories: 1, series: 0 }),
      catalog: () => Effect.succeed({ count: 1, records: [{ title: 'Books' }] }),
      books: () => Effect.succeed({ count: 0, records: [] }),
      recent: () => Effect.succeed({ count: 0, records: [] }),
      search: ({ query }) => Effect.succeed({ query, total: 0, count: 0, records: [] }),
      bookInfo: ({ uuid }) =>
        Effect.succeed({ uuid, authors: [], languages: [], categories: [], downloads: [], formats: [], tags: [] }),
      shelves: () => Effect.succeed({ count: 0, records: [] }),
    })
  )

const ReadyAutocaliwebLayer = makeAutocaliwebLayer(() =>
  Effect.succeed({ catalogCount: 1, stats: { books: 1, authors: 1, categories: 1, series: 0 } })
)

const ReadySabnzbdLayer = makeApiLayer(() =>
  Effect.succeed({ version: '4.5.3', uptime: '1d', paused: false, haveWarnings: false })
)

const ReadyApiLayer = Layer.merge(ReadyAutocaliwebLayer, ReadySabnzbdLayer)

const post = (
  handler: (request: Request) => Promise<Response>,
  body: Schema.Json,
  headers: Readonly<Record<string, string>> = {}
) =>
  Schema.encodeEffect(Schema.fromJsonString(Schema.Json))(body).pipe(
    Effect.flatMap((encodedBody) =>
      Effect.tryPromise(() =>
        handler(
          new Request('http://localhost/mcp', {
            method: 'POST',
            headers: {
              accept: 'application/json, text/event-stream',
              'content-type': 'application/json',
              ...headers,
            },
            body: encodedBody,
          })
        )
      )
    )
  )

const responseJson = (response: Response) => Effect.tryPromise(() => response.json())

const withInitializedHandler = <A, E>(
  apiLayer: Layer.Layer<AutocaliwebApi | SabnzbdApi>,
  use: (handler: (request: Request) => Promise<Response>, sessionId: string) => Effect.Effect<A, E>
) =>
  Effect.acquireUseRelease(
    Effect.sync(() => HttpRouter.toWebHandler(GarageMcpRoutes.pipe(Layer.provide(apiLayer)), { disableLogger: true })),
    ({ handler }) =>
      Effect.gen(function* () {
        const response = yield* post(handler, {
          jsonrpc: '2.0',
          id: 0,
          method: 'initialize',
          params: {
            protocolVersion: '2025-06-18',
            capabilities: {},
            clientInfo: { name: 'garage-mcp-test', version: '1.0.0' },
          },
        })
        assert.strictEqual(response.status, 200)
        const sessionId = response.headers.get('mcp-session-id')
        if (sessionId === null) {
          return assert.fail('initialize response did not include an MCP session id')
        }
        return yield* use(handler, sessionId)
      }),
    ({ dispose }) => Effect.tryPromise(() => dispose())
  )

it.effect('discovers consolidated tools with bounded schemas and accurate safety annotations', () =>
  withInitializedHandler(ReadyApiLayer, (handler, sessionId) =>
    Effect.gen(function* () {
      const response = yield* post(
        handler,
        { jsonrpc: '2.0', id: 1, method: 'tools/list', params: {} },
        { 'mcp-session-id': sessionId, 'mcp-protocol-version': '2025-06-18' }
      )
      const body = yield* responseJson(response).pipe(Effect.flatMap(Schema.decodeUnknownEffect(ToolListResponse)))

      assert.deepStrictEqual(
        body.result.tools.map((tool) => tool.name),
        [
          'sabnzbd_status',
          'sabnzbd_version',
          'sabnzbd_queue',
          'sabnzbd_history',
          'sabnzbd_server_stats',
          'sabnzbd_pause',
          'sabnzbd_resume',
          'sabnzbd_delete',
          'autocaliweb_status',
          'autocaliweb_version',
          'autocaliweb_stats',
          'autocaliweb_catalog',
          'autocaliweb_books',
          'autocaliweb_recent',
          'autocaliweb_search',
          'autocaliweb_book_info',
          'autocaliweb_shelves',
        ]
      )
      for (const tool of [
        ...body.result.tools.slice(0, 5),
        ...body.result.tools.filter((candidate) => candidate.name.startsWith('autocaliweb_')),
      ]) {
        assert.deepInclude(tool.annotations, {
          readOnlyHint: true,
          destructiveHint: false,
          idempotentHint: true,
          openWorldHint: false,
        })
      }
      for (const name of ['sabnzbd_pause', 'sabnzbd_resume']) {
        const tool = body.result.tools.find((candidate) => candidate.name === name)
        if (tool === undefined) {
          return assert.fail(`${name} was not discovered`)
        }
        assert.deepInclude(tool.annotations, {
          readOnlyHint: false,
          destructiveHint: false,
          idempotentHint: true,
          openWorldHint: false,
        })
      }
      const deleteTool = body.result.tools.find((tool) => tool.name === 'sabnzbd_delete')
      if (deleteTool === undefined) {
        return assert.fail('sabnzbd_delete was not discovered')
      }
      assert.deepInclude(deleteTool.annotations, {
        readOnlyHint: false,
        destructiveHint: true,
        idempotentHint: false,
        openWorldHint: false,
      })

      const queueTool = body.result.tools.find((tool) => tool.name === 'sabnzbd_queue')
      if (queueTool === undefined) {
        return assert.fail('sabnzbd_queue was not discovered')
      }
      assert.strictEqual(queueTool.annotations.title, 'SABnzbd Queue')
      const inputSchema = yield* Schema.decodeUnknownEffect(QueueInputSchema)(queueTool.inputSchema)
      const outputSchema = yield* Schema.decodeUnknownEffect(QueueOutputSchema)(queueTool.outputSchema)
      assert.deepInclude(inputSchema.properties.limit.allOf[0], { minimum: 1, maximum: 100 })
      assert.sameMembers([...outputSchema.required], ['count', 'totalRecords', 'slots'])
    })
  )
)

it.effect('encodes successful structured results through HTTP MCP', () =>
  withInitializedHandler(ReadyApiLayer, (handler, sessionId) =>
    Effect.gen(function* () {
      const response = yield* post(
        handler,
        {
          jsonrpc: '2.0',
          id: 2,
          method: 'tools/call',
          params: { name: 'sabnzbd_status', arguments: {} },
        },
        { 'mcp-session-id': sessionId, 'mcp-protocol-version': '2025-06-18' }
      )
      const body = yield* responseJson(response).pipe(Effect.flatMap(Schema.decodeUnknownEffect(ToolCallResponse)))

      assert.strictEqual(body.result.isError, false)
      assert.deepStrictEqual(body.result.structuredContent, {
        version: '4.5.3',
        uptime: '1d',
        paused: false,
        haveWarnings: false,
      })
    })
  )
)

it.effect('represents expected package failures without sensitive request data', () =>
  withInitializedHandler(
    Layer.merge(
      ReadyAutocaliwebLayer,
      makeApiLayer(() => Effect.fail(envMissing('SABNZBD_API_KEY')))
    ),
    (handler, sessionId) =>
      Effect.gen(function* () {
        const response = yield* post(
          handler,
          {
            jsonrpc: '2.0',
            id: 3,
            method: 'tools/call',
            params: { name: 'sabnzbd_status', arguments: {} },
          },
          { 'mcp-session-id': sessionId, 'mcp-protocol-version': '2025-06-18' }
        )
        const body = yield* responseJson(response).pipe(Effect.flatMap(Schema.decodeUnknownEffect(ToolCallResponse)))
        const [content] = body.result.content
        if (content === undefined) {
          return assert.fail('expected structured error content')
        }
        const failure = yield* Schema.decodeUnknownEffect(Schema.fromJsonString(McpFailure))(content.text)

        assert.strictEqual(body.result.isError, true)
        assert.strictEqual(failure.code, 'SABNZBD_ENV_MISSING')
        assert.include(failure.fix, 'Garage MCP secret environment')
        assert.notInclude(content.text, 'modules/programs/shell.nix')
        assert.notInclude(content.text, 'apikey=')
      })
  )
)

it.effect('redacts credential-bearing transport failures from MCP results', () =>
  withInitializedHandler(
    Layer.merge(
      ReadyAutocaliwebLayer,
      makeApiLayer(() =>
        Effect.fail(
          unreachable(
            'Transport error for http://sabnzbd.example.test/api?apikey=sentinel-api-key&output=json&mode=fullstatus'
          )
        )
      )
    ),
    (handler, sessionId) =>
      Effect.gen(function* () {
        const response = yield* post(
          handler,
          {
            jsonrpc: '2.0',
            id: 4,
            method: 'tools/call',
            params: { name: 'sabnzbd_status', arguments: {} },
          },
          { 'mcp-session-id': sessionId, 'mcp-protocol-version': '2025-06-18' }
        )
        const body = yield* responseJson(response).pipe(Effect.flatMap(Schema.decodeUnknownEffect(ToolCallResponse)))
        const [content] = body.result.content
        if (content === undefined) {
          return assert.fail('expected redacted error content')
        }
        const failure = yield* Schema.decodeUnknownEffect(Schema.fromJsonString(McpFailure))(content.text)

        assert.strictEqual(body.result.isError, true)
        assert.strictEqual(failure.code, 'SABNZBD_UNREACHABLE')
        assert.notInclude(content.text, 'sentinel-api-key')
        assert.notInclude(content.text, 'apikey=')
        assert.notInclude(content.text, 'sabnzbd.example.test')
      })
  )
)

it.effect('redacts AutoCaliWeb Basic-auth transport failures from MCP results', () =>
  withInitializedHandler(
    Layer.merge(
      makeAutocaliwebLayer(() =>
        Effect.fail(
          autocaliwebUnreachable(
            'Transport error for http://fixture-user:sentinel-password@autocaliweb.example.test/opds'
          )
        )
      ),
      ReadySabnzbdLayer
    ),
    (handler, sessionId) =>
      Effect.gen(function* () {
        const response = yield* post(
          handler,
          {
            jsonrpc: '2.0',
            id: 5,
            method: 'tools/call',
            params: { name: 'autocaliweb_status', arguments: {} },
          },
          { 'mcp-session-id': sessionId, 'mcp-protocol-version': '2025-06-18' }
        )
        const body = yield* responseJson(response).pipe(Effect.flatMap(Schema.decodeUnknownEffect(ToolCallResponse)))
        const [content] = body.result.content
        if (content === undefined) {
          return assert.fail('expected redacted AutoCaliWeb error content')
        }
        const failure = yield* Schema.decodeUnknownEffect(Schema.fromJsonString(McpFailure))(content.text)

        assert.strictEqual(body.result.isError, true)
        assert.strictEqual(failure.code, 'AUTOCALIWEB_UNREACHABLE')
        assert.notInclude(content.text, 'sentinel-password')
        assert.notInclude(content.text, 'fixture-user')
        assert.notInclude(content.text, 'autocaliweb.example.test')
      })
  )
)

it.effect('serves a deterministic HTTP readiness response', () =>
  Effect.acquireUseRelease(
    Effect.sync(() =>
      HttpRouter.toWebHandler(GarageMcpRoutes.pipe(Layer.provide(ReadyApiLayer)), { disableLogger: true })
    ),
    ({ handler }) =>
      Effect.gen(function* () {
        const response = yield* Effect.tryPromise(() => handler(new Request('http://localhost/health')))
        const body = yield* responseJson(response).pipe(
          Effect.flatMap(Schema.decodeUnknownEffect(Schema.Struct({ status: Schema.Literal('ready') })))
        )
        assert.strictEqual(response.status, 200)
        assert.deepStrictEqual(body, { status: 'ready' })
      }),
    ({ dispose }) => Effect.tryPromise(() => dispose())
  )
)

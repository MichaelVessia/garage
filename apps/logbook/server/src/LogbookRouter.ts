import { LogbookApi } from '@garage/logbook-domain/LogbookApi.api'
import type { Unauthorized } from '@garage/logbook-domain/Session.middleware'
import * as Effect from 'effect/Effect'
import * as Headers from 'effect/http/Headers'
import * as HttpRouter from 'effect/http/HttpRouter'
import * as HttpServerRequest from 'effect/http/HttpServerRequest'
import * as HttpServerResponse from 'effect/http/HttpServerResponse'
import * as Str from 'effect/String'

import { FrameApi } from './FrameApi.ts'
import { LogbookMcp } from './LogbookMcp.ts'
import { SessionAuthentication } from './Session.ts'

export const LogbookRouter = Effect.gen(function* () {
  const { fetch: rpc } = yield* LogbookApi
  const frame = yield* HttpRouter.toHttpEffect(FrameApi)
  const mcp = yield* HttpRouter.toHttpEffect(LogbookMcp).pipe(Effect.orDie)
  const { authenticate } = yield* SessionAuthentication

  const redactedHeaders = yield* Headers.CurrentRedactedNames
  const fetch = Effect.gen(function* () {
    const request = yield* HttpServerRequest.HttpServerRequest
    const path = new URL(request.url, 'http://localhost').pathname
    if (request.method === 'GET' && path === '/health') {
      return HttpServerResponse.jsonUnsafe({ status: 'ok' })
    }
    if (path === '/frame/due') {
      return yield* frame
    }
    const isRpcPath = path === '/api' || Str.startsWith('/api/')(path)
    // RPC middleware sends typed denials to clients, including after a WebSocket upgrade.
    if (
      isRpcPath &&
      (request.headers['upgrade'] === 'websocket' ||
        Str.startsWith('application/x-ndjson')(request.headers['content-type'] ?? ''))
    ) {
      return yield* rpc
    }
    if (isRpcPath || path === '/mcp') {
      return yield* authenticate(request.headers).pipe(
        Effect.matchEffect({
          onFailure: (error: Unauthorized) => Effect.succeed(HttpServerResponse.jsonUnsafe(error, { status: 401 })),
          onSuccess: () => (path === '/mcp' ? mcp : rpc),
        })
      )
    }
    return HttpServerResponse.empty({ status: 404 })
  }).pipe(Effect.provideService(Headers.CurrentRedactedNames, [...redactedHeaders, 'cf-access-jwt-assertion']))
  return { fetch }
})

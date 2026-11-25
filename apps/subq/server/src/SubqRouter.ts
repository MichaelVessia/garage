import type { Unauthorized } from '@garage/subq-domain/Session.middleware'
import { SubqApi } from '@garage/subq-domain/SubqApi.api'
import * as Effect from 'effect/Effect'
import * as Headers from 'effect/http/Headers'
import * as HttpRouter from 'effect/http/HttpRouter'
import * as HttpServerRequest from 'effect/http/HttpServerRequest'
import * as HttpServerResponse from 'effect/http/HttpServerResponse'
import * as Str from 'effect/String'

import { SessionAuthentication } from './Session.ts'
import { SubqHttp } from './SubqHttp.ts'
import { SubqMcp } from './SubqMcp.ts'

export const SubqRouter = Effect.gen(function* () {
  const { fetch: rpc } = yield* SubqApi
  const mcp = yield* HttpRouter.toHttpEffect(SubqMcp).pipe(Effect.orDie)
  const http = yield* HttpRouter.toHttpEffect(SubqHttp)
  const { authenticate } = yield* SessionAuthentication

  const redactedHeaders = yield* Headers.CurrentRedactedNames
  const fetch = Effect.gen(function* () {
    const request = yield* HttpServerRequest.HttpServerRequest
    const path = new URL(request.url, 'http://localhost').pathname
    if (request.method === 'GET' && path === '/health') {
      return HttpServerResponse.jsonUnsafe({ status: 'ok' })
    }
    const isRpcPath = path === '/api' || Str.startsWith('/api/')(path)
    // RPC middleware sends typed denials to clients, including after a WebSocket upgrade.
    if (
      isRpcPath &&
      (Str.toLowerCase(request.headers['upgrade'] ?? '') === 'websocket' ||
        Str.startsWith('application/x-ndjson')(Str.toLowerCase(request.headers['content-type'] ?? '')))
    ) {
      return yield* rpc
    }
    const isHttpPath = path === '/v1' || Str.startsWith('/v1/')(path)
    if (isRpcPath || path === '/mcp' || isHttpPath) {
      return yield* authenticate(request.headers).pipe(
        Effect.matchEffect({
          onFailure: (error: Unauthorized) => Effect.succeed(HttpServerResponse.jsonUnsafe(error, { status: 401 })),
          onSuccess: () => {
            if (isHttpPath) {
              return http
            }
            return path === '/mcp' ? mcp : rpc
          },
        })
      )
    }
    return HttpServerResponse.empty({ status: 404 })
  }).pipe(Effect.provideService(Headers.CurrentRedactedNames, [...redactedHeaders, 'cf-access-jwt-assertion']))
  return { fetch }
})

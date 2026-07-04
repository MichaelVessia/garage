import * as Effect from 'effect/Effect'
import * as Layer from 'effect/Layer'
import * as P from 'effect/Predicate'
import * as Ref from 'effect/Ref'
import { HttpClient, HttpClientResponse } from 'effect/unstable/http'
import type { HttpClientRequest } from 'effect/unstable/http'

export interface RecordedHttpRequest {
  readonly method: string
  readonly url: string
  readonly raw: HttpClientRequest.HttpClientRequest
}

export interface RecordingHttpResponse {
  readonly status: number
  readonly body?: unknown
  readonly headers?: Headers
}

const toWebResponse = (response: RecordingHttpResponse): Response => {
  const init: ResponseInit = {
    status: response.status,
    ...(response.headers === undefined ? {} : { headers: response.headers }),
  }
  if (response.status === 204 || response.body === undefined) {
    return new Response(null, init)
  }
  // A caller-supplied `headers` signals the body is already wire-ready text (e.g. XML, or
  // a pre-serialized JSON string paired with an explicit content-type); otherwise JSON-encode it.
  return P.isString(response.body) && response.headers !== undefined
    ? new Response(response.body, init)
    : Response.json(response.body, init)
}

export const makeRecordingHttpClient = Effect.fn('cli-protocol.makeRecordingHttpClient')(function* (
  respond: (method: string, url: URL, request: HttpClientRequest.HttpClientRequest) => RecordingHttpResponse
) {
  const requests = yield* Ref.make<ReadonlyArray<RecordedHttpRequest>>([])
  const client = HttpClient.make((request, url) =>
    Ref.update(requests, (records) => [...records, { method: request.method, url: url.toString(), raw: request }]).pipe(
      Effect.map(() => HttpClientResponse.fromWeb(request, toWebResponse(respond(request.method, url, request))))
    )
  )
  return { layer: Layer.succeed(HttpClient.HttpClient, client), requests }
})

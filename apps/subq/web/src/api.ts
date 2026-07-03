import { Context, Layer } from 'effect'
import type { Effect } from 'effect'
import { FetchHttpClient } from 'effect/unstable/http'
import { RpcClient, RpcSerialization } from 'effect/unstable/rpc'

import { AppRpcs } from '#shared'

// FetchHttpClient with credentials so auth cookies flow on same-origin calls
export const FetchWithCredentials = FetchHttpClient.layer.pipe(
  Layer.provide(Layer.succeed(FetchHttpClient.RequestInit)({ credentials: 'include' }))
)

const ProtocolLive = RpcClient.layerProtocolHttp({ url: '/rpc' }).pipe(
  Layer.provide([RpcSerialization.layerJson, FetchWithCredentials])
)

const makeClient = RpcClient.make(AppRpcs)

export class Api extends Context.Service<Api, Effect.Success<typeof makeClient>>()('@garage/subq/web/src/api') {}

export const ApiLive: Layer.Layer<Api> = Layer.effect(Api, makeClient).pipe(Layer.provide(ProtocolLive))

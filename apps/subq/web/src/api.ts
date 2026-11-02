import * as Context from 'effect/Context'
import type * as Effect from 'effect/Effect'
import * as FetchHttpClient from 'effect/http/FetchHttpClient'
import * as Layer from 'effect/Layer'
import * as RpcClient from 'effect/rpc/RpcClient'
import * as RpcSerialization from 'effect/rpc/RpcSerialization'

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

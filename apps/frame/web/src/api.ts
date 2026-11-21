import * as Context from 'effect/Context'
import type * as Effect from 'effect/Effect'
import * as FetchHttpClient from 'effect/http/FetchHttpClient'
import * as Layer from 'effect/Layer'
import * as RpcClient from 'effect/rpc/RpcClient'
import * as RpcSerialization from 'effect/rpc/RpcSerialization'

import { FrameRpcs } from '#shared'

const ProtocolLive = RpcClient.layerProtocolHttp({ url: '/rpc' }).pipe(
  Layer.provide([RpcSerialization.layerJson, FetchHttpClient.layer])
)

const makeClient = RpcClient.make(FrameRpcs)

export class Api extends Context.Service<Api, Effect.Success<typeof makeClient>>()('@garage/frame/web/src/api') {
  public static readonly make = makeClient

  public static readonly layer: Layer.Layer<Api> = Layer.effect(this, this.make).pipe(Layer.provide(ProtocolLive))
}

export const ApiLive: Layer.Layer<Api> = Api.layer

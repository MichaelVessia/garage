import * as Context from 'effect/Context'
import type * as Effect from 'effect/Effect'
import * as Layer from 'effect/Layer'
import { FetchHttpClient } from 'effect/unstable/http'
import { RpcClient, RpcSerialization } from 'effect/unstable/rpc'

import { FrameRpcs } from '#shared'

const ProtocolLive = RpcClient.layerProtocolHttp({ url: '/rpc' }).pipe(
  Layer.provide([RpcSerialization.layerJson, FetchHttpClient.layer])
)

const makeClient = RpcClient.make(FrameRpcs)

export class Api extends Context.Service<Api, Effect.Success<typeof makeClient>>()('@garage/frame/web/src/api') {}

export const ApiLive: Layer.Layer<Api> = Layer.effect(Api, makeClient).pipe(Layer.provide(ProtocolLive))

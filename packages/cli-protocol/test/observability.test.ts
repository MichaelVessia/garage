import { it } from '@effect/vitest'
import * as ConfigProvider from 'effect/ConfigProvider'
import * as Effect from 'effect/Effect'
import * as Layer from 'effect/Layer'
import { HttpClient, HttpClientResponse } from 'effect/unstable/http'
import { describe } from 'vitest'

import { cliObservabilityLayer, cliObservabilityLayerFromConfig } from '../src/index.js'

const NoopHttpClient = Layer.succeed(
  HttpClient.HttpClient,
  HttpClient.make((request) => Effect.succeed(HttpClientResponse.fromWeb(request, new Response(null, { status: 204 }))))
)

describe('CLI observability', () => {
  it.effect('builds a disabled layer without requiring OTLP URLs', () =>
    Effect.void.pipe(
      Effect.provide(
        cliObservabilityLayer({
          serviceName: '@garage/test-cli',
          serviceVersion: '0.0.0',
          environment: 'test',
        }).pipe(Layer.provide(NoopHttpClient))
      )
    )
  )

  it.effect('builds a layer from Effect Config', () =>
    Effect.void.pipe(
      Effect.provide(
        cliObservabilityLayerFromConfig({
          serviceName: '@garage/test-cli',
          serviceVersion: '0.0.0',
          environment: 'test',
        }).pipe(
          Layer.provide(NoopHttpClient),
          Layer.provide(
            ConfigProvider.layer(
              ConfigProvider.fromEnv({
                env: {
                  GARAGE_OTLP_TRACES_URL: 'http://collector.example.test/v1/traces',
                  GARAGE_OTLP_LOGS_URL: 'http://collector.example.test/v1/logs',
                },
              })
            )
          )
        )
      )
    )
  )
})

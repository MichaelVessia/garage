import * as Config from 'effect/Config'
import * as Effect from 'effect/Effect'
import * as Layer from 'effect/Layer'
import * as Option from 'effect/Option'
import type { HttpClient } from 'effect/unstable/http'
import { OtlpLogger, OtlpSerialization, OtlpTracer } from 'effect/unstable/observability'

export interface CliObservabilityOptions {
  readonly serviceName: string
  readonly serviceVersion: string
  readonly environment: string
  // oxlint-disable-next-line effect/prefer-option-over-null -- public option bag constructed by out-of-scope app CLIs that pass plain string env vars
  readonly tracesUrl?: string | undefined
  // oxlint-disable-next-line effect/prefer-option-over-null -- public option bag constructed by out-of-scope app CLIs that pass plain string env vars
  readonly logsUrl?: string | undefined
}

export type CliObservabilityConfigOptions = Omit<CliObservabilityOptions, 'tracesUrl' | 'logsUrl'>

type OtlpRequirements = HttpClient.HttpClient | OtlpSerialization.OtlpSerialization

const optionalUrl = (value: Option.Option<string>): Option.Option<string> =>
  // oxlint-disable-next-line effect/no-length-comparison -- string emptiness check, not an array
  Option.filter(value, (url) => url.trim().length > 0)

const emptyObservabilityLayer: Layer.Layer<never, never, OtlpRequirements> = Layer.empty

const optionalConfigString = (name: string): Effect.Effect<Option.Option<string>, Config.ConfigError> =>
  Config.option(Config.string(name))

export const cliObservabilityLayer = (
  options: CliObservabilityOptions
): Layer.Layer<never, never, HttpClient.HttpClient> => {
  const resource = {
    serviceName: options.serviceName,
    serviceVersion: options.serviceVersion,
    attributes: { 'deployment.environment': options.environment },
  }
  const tracingLayer = Option.match(optionalUrl(Option.fromNullishOr(options.tracesUrl)), {
    onNone: () => emptyObservabilityLayer,
    onSome: (url) => OtlpTracer.layer({ url, resource }),
  })
  const loggingLayer = Option.match(optionalUrl(Option.fromNullishOr(options.logsUrl)), {
    onNone: () => emptyObservabilityLayer,
    onSome: (url) => OtlpLogger.layer({ url, resource }),
  })

  return Layer.mergeAll(tracingLayer, loggingLayer).pipe(Layer.provide(OtlpSerialization.layerJson))
}

export const cliObservabilityLayerFromConfig = (
  options: CliObservabilityConfigOptions
): Layer.Layer<never, Config.ConfigError, HttpClient.HttpClient> =>
  Layer.unwrap(
    Effect.gen(function* () {
      const tracesUrl = yield* optionalConfigString('GARAGE_OTLP_TRACES_URL')
      const logsUrl = yield* optionalConfigString('GARAGE_OTLP_LOGS_URL')
      return cliObservabilityLayer({
        ...options,
        tracesUrl: Option.getOrUndefined(tracesUrl),
        logsUrl: Option.getOrUndefined(logsUrl),
      })
    })
  )
